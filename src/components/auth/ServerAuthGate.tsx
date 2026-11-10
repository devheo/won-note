import React, { useEffect, useState } from 'react';
import { fetchBridge } from '../../services/httpBridge';
import { API_PATHS } from '../../constants/api';
import { KeyRound, Shield, LogOut } from 'lucide-react';
import { AdminConsole } from './AdminConsole';
import { APP_EVENTS } from '../../constants/events';

type AuthState = { enabled: boolean; user: null | { id: string; email: string; displayName: string; role: 'master' | 'user' } };

async function jsonRequest<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetchBridge(path, { ...init, headers: { 'Content-Type': 'application/json', ...(init?.headers || {}) } });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || `요청 실패 (${response.status})`);
  return data as T;
}

export const ServerAuthGate: React.FC<{ useServer: boolean }> = ({ useServer }) => {
  const [state, setState] = useState<AuthState | null>(null);
  const [token, setToken] = useState('');
  const [loginMode, setLoginMode] = useState<'password' | 'oidc'>('password');

  // Auto-fill remembered login credentials from localStorage
  const [rememberMe, setRememberMe] = useState<boolean>(() => {
    return localStorage.getItem('wonbee_remember_login') === 'true';
  });
  const [loginEmail, setLoginEmail] = useState<string>(() => {
    return localStorage.getItem('wonbee_remember_email') || '';
  });
  const [loginPassword, setLoginPassword] = useState<string>(() => {
    return localStorage.getItem('wonbee_remember_password') || '';
  });

  const [error, setError] = useState('');
  const [adminOpen, setAdminOpen] = useState(false);

  // A browser opened directly on the hosted server must honor server auth
  // even when this browser has a persisted local-workspace preference.
  // Non-browser desktop/file builds keep their local mode independent.
  const shouldCheckServerAuth = useServer || (typeof window !== 'undefined' && /^https?:$/.test(window.location.protocol));

  const refresh = async () => {
    if (!shouldCheckServerAuth) { setState({ enabled: false, user: null }); return; }
    try { setState(await jsonRequest<AuthState>(API_PATHS.auth.me)); }
    catch { setState({ enabled: true, user: null }); }
  };
  useEffect(() => { void refresh(); }, [shouldCheckServerAuth]);

  useEffect(() => {
    const openAdmin = () => {
      if (state?.enabled && state.user?.role === 'master') setAdminOpen(true);
    };
    window.addEventListener(APP_EVENTS.openAdminConsole, openAdmin);
    return () => window.removeEventListener(APP_EVENTS.openAdminConsole, openAdmin);
  }, [state]);

  if (!shouldCheckServerAuth) return null;

  // Keep the workspace covered until the server has confirmed whether this
  // deployment requires authentication. Otherwise protected content briefly
  // renders while /api/auth/me is still in flight.
  if (!state) return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-stone-950/90 p-4 text-sm text-stone-200 backdrop-blur-sm" role="status" aria-live="polite">
      서버 로그인 상태를 확인하고 있습니다...
    </div>
  );

  if (!state.enabled) return null;
  if (!state.user) return (
    <div className="fixed inset-0 z-[100] bg-stone-950/90 backdrop-blur-sm flex items-center justify-center p-4">
      <form
        className="w-full max-w-md rounded-2xl bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-700 p-7 space-y-4 shadow-2xl animate-in zoom-in-95 duration-150"
        onSubmit={async (e) => {
          e.preventDefault();
          setError('');
          try {
            const result = await jsonRequest<{ user: AuthState['user'] }>(
              loginMode === 'password' ? API_PATHS.auth.passwordLogin : API_PATHS.auth.login,
              {
                method: 'POST',
                body: JSON.stringify(
                  loginMode === 'password'
                    ? { email: loginEmail.trim(), password: loginPassword }
                    : { token: token.trim() }
                ),
              }
            );

            // Save or clear remembered credentials based on checkbox
            if (rememberMe && loginMode === 'password') {
              localStorage.setItem('wonbee_remember_login', 'true');
              localStorage.setItem('wonbee_remember_email', loginEmail.trim());
              localStorage.setItem('wonbee_remember_password', loginPassword);
            } else if (!rememberMe) {
              localStorage.removeItem('wonbee_remember_login');
              localStorage.removeItem('wonbee_remember_email');
              localStorage.removeItem('wonbee_remember_password');
            }

            setState({ enabled: true, user: result.user });
            setToken('');
          } catch (err) {
            setError(err instanceof Error ? err.message : '로그인에 실패했습니다.');
          }
        }}
      >
        <div className="flex items-center gap-3">
          <div className="rounded-xl bg-amber-500/15 p-2 text-amber-600 dark:text-amber-400">
            <Shield className="w-6 h-6" />
          </div>
          <div>
            <h1 className="text-lg font-bold text-stone-900 dark:text-stone-100">WonNote 서버 로그인</h1>
            <p className="text-xs text-stone-500 dark:text-stone-400">서버 데이터베이스 접속 인증이 필요합니다.</p>
          </div>
        </div>

        <div className="flex rounded-lg bg-stone-100 dark:bg-stone-800 p-1 text-xs">
          <button
            type="button"
            onClick={() => setLoginMode('password')}
            className={`flex-1 rounded-md py-2 text-xs font-semibold transition-colors cursor-pointer ${
              loginMode === 'password' ? 'bg-white shadow-xs dark:bg-stone-700 text-stone-900 dark:text-stone-100' : 'text-stone-500'
            }`}
          >
            이메일·비밀번호
          </button>
          <button
            type="button"
            onClick={() => setLoginMode('oidc')}
            className={`flex-1 rounded-md py-2 text-xs font-semibold transition-colors cursor-pointer ${
              loginMode === 'oidc' ? 'bg-white shadow-xs dark:bg-stone-700 text-stone-900 dark:text-stone-100' : 'text-stone-500'
            }`}
          >
            OIDC Bearer 토큰
          </button>
        </div>

        {loginMode === 'password' ? (
          <>
            <label className="block text-xs font-semibold text-stone-700 dark:text-stone-300">
              이메일 주소
              <input
                value={loginEmail}
                onChange={(e) => setLoginEmail(e.target.value)}
                type="email"
                autoComplete="username"
                required
                className="mt-1 w-full rounded-xl border border-stone-300 dark:border-stone-700 bg-stone-50 dark:bg-stone-800 p-2.5 text-xs outline-none focus:ring-2 focus:ring-amber-500"
                placeholder="master@wonnote.com"
              />
            </label>
            <label className="block text-xs font-semibold text-stone-700 dark:text-stone-300">
              비밀번호
              <input
                value={loginPassword}
                onChange={(e) => setLoginPassword(e.target.value)}
                type="password"
                autoComplete="current-password"
                required
                className="mt-1 w-full rounded-xl border border-stone-300 dark:border-stone-700 bg-stone-50 dark:bg-stone-800 p-2.5 text-xs outline-none focus:ring-2 focus:ring-amber-500"
                placeholder="••••••••"
              />
            </label>

            {/* Remember Me Checkbox */}
            <label className="flex items-center gap-2 pt-1 text-xs font-semibold text-stone-700 dark:text-stone-300 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={rememberMe}
                onChange={(e) => setRememberMe(e.target.checked)}
                className="w-4 h-4 rounded text-amber-500 focus:ring-amber-500 cursor-pointer accent-amber-500"
              />
              <span>로그인 정보 (아이디 / 비밀번호) 기억하기</span>
            </label>
          </>
        ) : (
          <label className="block text-xs font-semibold text-stone-700 dark:text-stone-300">
            SSO Bearer 토큰
            <input
              value={token}
              onChange={(e) => setToken(e.target.value)}
              type="password"
              autoComplete="off"
              required
              className="mt-1 w-full rounded-xl border border-stone-300 dark:border-stone-700 bg-stone-50 dark:bg-stone-800 p-2.5 text-xs font-mono outline-none focus:ring-2 focus:ring-amber-500"
              placeholder="SSO에서 발급한 access token"
            />
          </label>
        )}

        {error && <p className="text-xs text-rose-600 font-semibold p-2 bg-rose-500/10 rounded-lg border border-rose-500/20">{error}</p>}

        <button className="w-full rounded-xl bg-amber-500 hover:bg-amber-400 text-stone-950 py-2.5 text-xs font-bold transition-all shadow-md cursor-pointer flex items-center justify-center gap-2 active:scale-98">
          <KeyRound size={16} /> 로그인
        </button>

        <p className="text-[11px] leading-relaxed text-stone-400 text-center">
          로그인에 성공하면 HttpOnly 세션 쿠키가 발급되며 원비 서버 데이터베이스에 연결됩니다.
        </p>
      </form>
    </div>
  );

  return (
    <>
      <div className="fixed bottom-5 right-5 z-40 flex items-center gap-2 rounded-full bg-white/95 dark:bg-stone-900/95 border border-stone-200 dark:border-stone-700 px-3.5 py-2 text-xs shadow-lg backdrop-blur-xs">
        <span className="font-bold text-stone-800 dark:text-stone-200">{state.user.displayName || state.user.email}</span>
        <span className="text-[10px] px-1.5 py-0.2 rounded-md bg-amber-500/15 text-amber-700 dark:text-amber-300 font-bold uppercase">{state.user.role}</span>
        <button
          title="로그아웃"
          onClick={async () => {
            await jsonRequest(API_PATHS.auth.logout, { method: 'POST' });
            await refresh();
          }}
          className="p-1 rounded-lg text-stone-400 hover:text-rose-500 transition-colors cursor-pointer"
        >
          <LogOut size={15} />
        </button>
      </div>
      {adminOpen && <AdminConsole user={state.user} onClose={() => setAdminOpen(false)} />}
    </>
  );
};
