import { createHash, createPublicKey, pbkdf2Sync, randomBytes, randomUUID, timingSafeEqual, verify } from 'crypto';
import type { NextFunction, Request, Response } from 'express';
import { authQuery, authRun } from './db';
import { AUTH_CONFIG } from './constants';

const cookieName = 'wonbee_session';
type User = { id: string; issuer: string; subject: string; email: string; display_name: string; role: 'master' | 'user'; status: string };
declare global { namespace Express { interface Request { authUser?: User } } }
const digest = (value: string) => createHash('sha256').update(value).digest('hex');
const b64url = (value: string) => Buffer.from(value, 'base64url').toString('utf8');
const passwordDigest = (password: string, salt: string, iterations: number = AUTH_CONFIG.passwordIterations) => pbkdf2Sync(password, salt, iterations, 32, 'sha256').toString('hex');
function makePassword(password: string) { const salt = randomBytes(16).toString('hex'); return { salt, hash: `pbkdf2-sha256$${AUTH_CONFIG.passwordIterations}$${passwordDigest(password, salt)}` }; }
function passwordMatches(password: string, salt: string, expected: string) {
  const [algorithm, rawIterations, hash] = expected.split('$');
  const iterations = Number(rawIterations);
  if (algorithm !== 'pbkdf2-sha256' || !Number.isInteger(iterations) || iterations < 100000 || iterations > 1000000) return false;
  const actual = Buffer.from(passwordDigest(password, salt, iterations), 'hex');
  const target = Buffer.from(hash || '', 'hex');
  return actual.length === target.length && timingSafeEqual(actual, target);
}
let jwksCache: { at: number; keys: any[] } | null = null;

function config() {
  const issuer = process.env.OIDC_ISSUER?.replace(/\/$/, '');
  const audience = process.env.OIDC_CLIENT_ID;
  return issuer && audience ? { issuer, audience } : null;
}

async function verifyOidcToken(token: string) {
  const cfg = config();
  if (!cfg) throw new Error('OIDC 서버 설정이 완료되지 않았습니다.');
  const pieces = token.split('.');
  if (pieces.length !== 3) throw new Error('OIDC Bearer 토큰 형식이 올바르지 않습니다.');
  const header = JSON.parse(b64url(pieces[0]));
  const claims = JSON.parse(b64url(pieces[1]));
  if (header.alg !== 'RS256' || !header.kid) throw new Error('지원하지 않는 서명 알고리즘입니다.');
  if (!jwksCache || Date.now() - jwksCache.at > AUTH_CONFIG.jwksCacheMs) {
    const discoveryRes = await fetch(`${cfg.issuer}/.well-known/openid-configuration`);
    if (!discoveryRes.ok) throw new Error('OIDC discovery 정보를 가져오지 못했습니다.');
    const discovery: any = await discoveryRes.json();
    if (discovery.issuer !== cfg.issuer || !discovery.jwks_uri) throw new Error('OIDC issuer 정보가 일치하지 않습니다.');
    const keysRes = await fetch(discovery.jwks_uri);
    if (!keysRes.ok) throw new Error('OIDC 서명 키를 가져오지 못했습니다.');
    const result: any = await keysRes.json();
    jwksCache = { at: Date.now(), keys: result.keys || [] };
  }
  const jwk = jwksCache.keys.find((key) => key.kid === header.kid && key.kty === 'RSA');
  if (!jwk) throw new Error('OIDC 서명 키를 찾을 수 없습니다.');
  const key = createPublicKey({ key: jwk, format: 'jwk' });
  const valid = verify('RSA-SHA256', Buffer.from(`${pieces[0]}.${pieces[1]}`), key, Buffer.from(pieces[2], 'base64url'));
  const now = Math.floor(Date.now() / 1000);
  if (!valid || claims.iss !== cfg.issuer || !(Array.isArray(claims.aud) ? claims.aud.includes(cfg.audience) : claims.aud === cfg.audience) || !claims.sub || !claims.exp || claims.exp <= now || (claims.nbf && claims.nbf > now)) {
    throw new Error('OIDC 토큰 서명 또는 발급 대상 검증에 실패했습니다.');
  }
  if (claims.email && claims.email_verified === false) throw new Error('SSO 이메일 인증을 완료해 주세요.');
  return { ...claims, issuer: cfg.issuer };
}

function setSessionCookie(res: Response, token: string) {
  const secure = process.env.NODE_ENV === 'production' || process.env.COOKIE_SECURE === 'true';
  res.setHeader('Set-Cookie', `${cookieName}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${Math.floor(AUTH_CONFIG.sessionLifetimeMs / 1000)}${secure ? '; Secure' : ''}`);
}

function cookie(req: Request, name: string) {
  return (req.headers.cookie || '').split(';').map(x => x.trim()).find(x => x.startsWith(`${name}=`))?.slice(name.length + 1);
}

export function authEnabled() { return process.env.AUTH_REQUIRED === 'true' || !!config(); }

/** Authenticate a Socket.IO handshake with the same HttpOnly session cookie used by REST. */
export function getSocketUser(cookieHeader?: string) {
  if (!authEnabled()) return null;
  const raw = (cookieHeader || '').split(';').map(value => value.trim()).find(value => value.startsWith(`${cookieName}=`))?.slice(cookieName.length + 1);
  if (!raw) return null;
  const session = authQuery<User>('SELECT u.* FROM auth_sessions s JOIN auth_users u ON u.id=s.user_id WHERE s.token_hash=? AND s.revoked_at IS NULL AND s.expires_at>? AND u.status="active"', [digest(raw), Date.now()])[0];
  return session || null;
}

export async function oidcLogin(req: Request, res: Response) {
  const raw = req.body?.token;
  const ip = req.ip || '';
  const ua = req.get('user-agent') || '';
  let claims: any;
  try {
    if (typeof raw !== 'string' || raw.length < 20 || raw.length > 20000) throw new Error('SSO Bearer 토큰을 확인해 주세요.');
    claims = await verifyOidcToken(raw);
    const existing = authQuery<User>('SELECT * FROM auth_users WHERE issuer = ? AND subject = ?', [claims.issuer, claims.sub])[0];
    const emailMatch = claims.email ? authQuery<User>('SELECT * FROM auth_users WHERE lower(email) = lower(?)', [claims.email])[0] : undefined;
    const user = existing || emailMatch;
    if (!user) throw new Error('사전 등록되지 않은 계정입니다. 관리자에게 계정 등록을 요청하세요.');
    if (user.status !== 'active') throw new Error('비활성화된 계정입니다. 관리자에게 문의하세요.');
    if (!existing) authRun('UPDATE auth_users SET issuer = ?, subject = ?, display_name = COALESCE(NULLIF(?, ""), display_name) WHERE id = ?', [claims.issuer, claims.sub, claims.name || '', user.id]);
    const session = randomBytes(32).toString('base64url');
    const now = Date.now();
    authRun('INSERT INTO auth_sessions(token_hash,user_id,created_at,expires_at) VALUES(?,?,?,?)', [digest(session), user.id, now, now + AUTH_CONFIG.sessionLifetimeMs]);
    authRun('UPDATE auth_users SET last_login_at = ? WHERE id = ?', [now, user.id]);
    authRun('INSERT INTO auth_login_history(id,user_id,email,success,reason,created_at,ip,user_agent) VALUES(?,?,?,?,?,?,?,?)', [randomUUID(), user.id, user.email, 1, 'login', now, ip, ua]);
    setSessionCookie(res, session);
    res.json({ user: { id: user.id, email: user.email, displayName: user.display_name || claims.name, role: user.role } });
  } catch (error) {
    authRun('INSERT INTO auth_login_history(id,email,success,reason,created_at,ip,user_agent) VALUES(?,?,?,?,?,?,?)', [randomUUID(), claims?.email || null, 0, error instanceof Error ? error.message : 'login_failed', Date.now(), ip, ua]);
    res.status(401).json({ error: error instanceof Error ? error.message : 'SSO 로그인에 실패했습니다.' });
  }
}

export function passwordLogin(req: Request, res: Response) {
  const email = String(req.body?.email || '').trim().toLowerCase();
  const password = req.body?.password;
  const ip = req.ip || '';
  const ua = req.get('user-agent') || '';
  const user = authQuery<any>('SELECT * FROM auth_users WHERE lower(email)=?', [email])[0];
  const valid = typeof password === 'string' && password.length <= 1024 && user?.password_salt && user?.password_hash && passwordMatches(password, user.password_salt, user.password_hash);
  if (!valid || user.status !== 'active') {
    authRun('INSERT INTO auth_login_history(id,user_id,email,success,reason,created_at,ip,user_agent) VALUES(?,?,?,?,?,?,?,?)', [randomUUID(), user?.id || null, email || null, 0, 'invalid_credentials', Date.now(), ip, ua]);
    res.status(401).json({ error: '이메일 또는 비밀번호를 확인해 주세요.' }); return;
  }
  const session = randomBytes(32).toString('base64url');
  const now = Date.now();
  authRun('INSERT INTO auth_sessions(token_hash,user_id,created_at,expires_at) VALUES(?,?,?,?)', [digest(session), user.id, now, now + AUTH_CONFIG.sessionLifetimeMs]);
  authRun('UPDATE auth_users SET last_login_at=? WHERE id=?', [now, user.id]);
  authRun('INSERT INTO auth_login_history(id,user_id,email,success,reason,created_at,ip,user_agent) VALUES(?,?,?,?,?,?,?,?)', [randomUUID(), user.id, user.email, 1, 'password_login', now, ip, ua]);
  setSessionCookie(res, session);
  res.json({ user: { id: user.id, email: user.email, displayName: user.display_name, role: user.role } });
}

export function logout(req: Request, res: Response) {
  const session = cookie(req, cookieName);
  if (session) authRun('UPDATE auth_sessions SET revoked_at = ? WHERE token_hash = ?', [Date.now(), digest(session)]);
  res.setHeader('Set-Cookie', `${cookieName}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${process.env.NODE_ENV === 'production' || process.env.COOKIE_SECURE === 'true' ? '; Secure' : ''}`);
  res.json({ ok: true });
}

export function requireAuth(req: Request, res: Response, next: NextFunction) {
  if (!authEnabled() || req.path === '/health' || req.path.startsWith('/auth/')) return next();
  const raw = cookie(req, cookieName);
  const bearer = req.get('authorization')?.match(/^Bearer\s+(.+)$/i)?.[1];
  if (bearer) { res.status(401).json({ error: '로그인은 /api/auth/login을 통해 진행해 주세요.' }); return; }
  if (!raw) { res.status(401).json({ error: '로그인이 필요합니다.' }); return; }
  const session = authQuery<any>('SELECT u.* FROM auth_sessions s JOIN auth_users u ON u.id=s.user_id WHERE s.token_hash=? AND s.revoked_at IS NULL AND s.expires_at>? AND u.status="active"', [digest(raw), Date.now()])[0];
  if (!session) { res.status(401).json({ error: '로그인이 만료되었습니다.' }); return; }
  req.authUser = session;
  next();
}

export function requireMaster(req: Request, res: Response, next: NextFunction) {
  if (req.authUser?.role !== 'master') { res.status(403).json({ error: '관리자 권한이 필요합니다.' }); return; }
  next();
}

export function authMe(req: Request, res: Response) {
  res.json({ enabled: authEnabled(), user: req.authUser ? { id: req.authUser.id, email: req.authUser.email, displayName: req.authUser.display_name, role: req.authUser.role } : null });
}

export function adminUsers(_req: Request, res: Response) {
  res.json(authQuery('SELECT id,email,display_name,role,status,created_at,last_login_at FROM auth_users ORDER BY created_at DESC'));
}

export function addUser(req: Request, res: Response) {
  const email = String(req.body?.email || '').trim().toLowerCase();
  const password = req.body?.password;
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { res.status(400).json({ error: '올바른 이메일 주소를 입력하세요.' }); return; }
  if (typeof password !== 'string' || password.length < 8 || password.length > 1024) { res.status(400).json({ error: '비밀번호는 8자 이상이어야 합니다.' }); return; }
  if (authQuery('SELECT id FROM auth_users WHERE lower(email)=?', [email]).length) { res.status(409).json({ error: '이미 등록된 이메일입니다.' }); return; }
  const now = Date.now();
  const secret = makePassword(password);
  authRun('INSERT INTO auth_users(id,issuer,subject,email,display_name,role,status,created_at,password_salt,password_hash) VALUES(?,?,?,?,?,?,?,?,?,?)', [randomUUID(), config()?.issuer || '', `pending:${randomUUID()}`, email, String(req.body?.displayName || email), 'user', 'active', now, secret.salt, secret.hash]);
  res.status(201).json({ ok: true });
}

export function updateUser(req: Request, res: Response) {
  const id = String(req.params.id);
  const body = req.body || {};
  if (id === req.authUser?.id && body.status === 'disabled') { res.status(400).json({ error: '현재 로그인한 마스터 계정은 비활성화할 수 없습니다.' }); return; }
  const role = body.role === 'master' ? 'master' : body.role === 'user' ? 'user' : null;
  const status = body.status === 'disabled' ? 'disabled' : body.status === 'active' ? 'active' : null;
  if (!role && !status) { res.status(400).json({ error: '변경할 권한 또는 상태를 지정하세요.' }); return; }
  if (role) authRun('UPDATE auth_users SET role=? WHERE id=?', [role, id]);
  if (status) authRun('UPDATE auth_users SET status=? WHERE id=?', [status, id]);
  if (status === 'disabled') authRun('UPDATE auth_sessions SET revoked_at=? WHERE user_id=? AND revoked_at IS NULL', [Date.now(), id]);
  res.json({ ok: true });
}

export function adminHistory(_req: Request, res: Response) {
  res.json(authQuery('SELECT h.id,h.email,h.success,h.reason,h.created_at,h.ip,h.user_agent,u.display_name FROM auth_login_history h LEFT JOIN auth_users u ON u.id=h.user_id ORDER BY h.created_at DESC LIMIT 500'));
}

export function bootstrapMaster() {
  const email = process.env.AUTH_MASTER_EMAIL?.trim().toLowerCase();
  const password = process.env.AUTH_MASTER_PASSWORD;
  if (!email || authQuery('SELECT id FROM auth_users WHERE role="master"').length) return;
  if (!password || password.length < 8) { console.warn('[Auth] AUTH_MASTER_PASSWORD is unset or too short; master can only be created after it is configured.'); return; }
  const id = randomUUID();
  const secret = makePassword(password);
  authRun('INSERT INTO auth_users(id,issuer,subject,email,display_name,role,status,created_at,password_salt,password_hash) VALUES(?,?,?,?,?,?,?,?,?,?)', [id, config()?.issuer || '', `pending:${id}`, email, 'Master', 'master', 'active', Date.now(), secret.salt, secret.hash]);
  console.log(`[Auth] Master account pre-registered: ${email}`);
}
