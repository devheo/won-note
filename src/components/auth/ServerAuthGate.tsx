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
  const [loginEmail, setLoginEmail] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [error, setError] = useState('');
  const [adminOpen, setAdminOpen] = useState(false);

  const refresh = async () => {
    if (!useServer) { setState({ enabled: false, user: null }); return; }
    try { setState(await jsonRequest<AuthState>(API_PATHS.auth.me)); }
    catch { setState({ enabled: true, user: null }); }
  };
  useEffect(() => { void refresh(); }, [useServer]);

  useEffect(() => {
    const openAdmin = () => {
      if (state?.enabled && state.user?.role === 'master') setAdminOpen(true);
    };
    window.addEventListener(APP_EVENTS.openAdminConsole, openAdmin);
    return () => window.removeEventListener(APP_EVENTS.openAdminConsole, openAdmin);
  }, [state]);

  if (!useServer) return null;

  if (!useServer || !state?.enabled) return null;
  if (!state.user) return <div className="fixed inset-0 z-[100] bg-stone-950/90 backdrop-blur-sm flex items-center justify-center p-4">
    <form className="w-full max-w-md rounded-2xl bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-700 p-7 space-y-4 shadow-2xl" onSubmit={async e => { e.preventDefault(); setError(''); try { const result = await jsonRequest<{user: AuthState['user']}>(loginMode === 'password' ? API_PATHS.auth.passwordLogin : API_PATHS.auth.login, { method: 'POST', body: JSON.stringify(loginMode === 'password' ? { email: loginEmail, password: loginPassword } : { token: token.trim() }) }); setState({ enabled: true, user: result.user }); setToken(''); setLoginPassword(''); } catch (err) { setError(err instanceof Error ? err.message : '로그인에 실패했습니다.'); } }}>
      <div className="flex items-center gap-3"><div className="rounded-xl bg-amber-100 p-2 text-amber-700"><Shield /></div><div><h1 className="text-lg font-bold">WonNote 서버 로그인</h1><p className="text-xs text-stone-500">등록된 OIDC 계정으로 로그인하세요.</p></div></div>
      <div className="flex rounded-lg bg-stone-100 dark:bg-stone-800 p-1"><button type="button" onClick={()=>setLoginMode('password')} className={`flex-1 rounded-md py-2 text-xs ${loginMode==='password'?'bg-white shadow dark:bg-stone-700':''}`}>이메일·비밀번호</button><button type="button" onClick={()=>setLoginMode('oidc')} className={`flex-1 rounded-md py-2 text-xs ${loginMode==='oidc'?'bg-white shadow dark:bg-stone-700':''}`}>OIDC Bearer 토큰</button></div>
      {loginMode === 'password' ? <><label className="block text-xs font-semibold">이메일<input value={loginEmail} onChange={e=>setLoginEmail(e.target.value)} type="email" autoComplete="username" required className="mt-1 w-full rounded-lg border p-2.5" /></label><label className="block text-xs font-semibold">비밀번호<input value={loginPassword} onChange={e=>setLoginPassword(e.target.value)} type="password" autoComplete="current-password" required className="mt-1 w-full rounded-lg border p-2.5" /></label></> : <label className="block text-xs font-semibold">SSO Bearer 토큰<input value={token} onChange={e => setToken(e.target.value)} type="password" autoComplete="off" required className="mt-1 w-full rounded-lg border p-2.5 font-mono" placeholder="SSO에서 발급한 access token" /></label>}
      {error && <p className="text-sm text-red-600">{error}</p>}
      <button className="w-full rounded-lg bg-stone-900 text-white py-2.5 font-semibold flex items-center justify-center gap-2"><KeyRound size={16}/> 로그인</button>
      <p className="text-[11px] leading-relaxed text-stone-500">로그인에 성공하면 30일 HttpOnly 세션 쿠키가 발급됩니다. 계정은 관리자 사전 등록이 필요합니다.</p>
    </form>
  </div>;

  return <>
    <div className="fixed bottom-5 right-5 z-40 flex items-center gap-2 rounded-full bg-white/95 dark:bg-stone-900/95 border px-3 py-2 text-xs shadow-lg"><span>{state.user.displayName || state.user.email}</span><button title="로그아웃" onClick={async () => { await jsonRequest(API_PATHS.auth.logout, { method: 'POST' }); await refresh(); }}><LogOut size={15}/></button></div>
    {adminOpen && <AdminConsole user={state.user} onClose={() => setAdminOpen(false)} />}
  </>;
};
