import React, { useEffect, useMemo, useState } from 'react';
import { Activity, BarChart3, FolderKanban, History, Layers3, Plus, RefreshCw, Shield, Trash2, Users, X } from 'lucide-react';
import { API_PATHS } from '../../constants/api';
import { fetchBridge } from '../../services/httpBridge';
import type { TableDocument, WorkspaceData } from '../../types';

type Tab = 'overview' | 'accounts' | 'groups' | 'boards' | 'history';
type User = { id: string; email: string; display_name: string; role: 'master' | 'user'; status: string; created_at: number; last_login_at: number | null };
type Member = { id: string; email: string; display_name: string; role: string };
type Group = { id: string; name: string; owner_id: string; members: Member[]; users: Member[] };
type Login = { id: string; email: string; display_name?: string; success: number; reason: string; ip: string; created_at: number };
type CurrentUser = { id: string; email: string; displayName: string; role: string };
type Props = { user: CurrentUser; onClose: () => void };

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetchBridge(path, { ...init, headers: { 'Content-Type': 'application/json', ...(init?.headers || {}) } });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || `요청 실패 (${response.status})`);
  return data as T;
}

const buttonClass = 'rounded-lg border border-stone-200 px-3 py-2 text-sm hover:bg-stone-50 dark:border-stone-700 dark:hover:bg-stone-800';

export const AdminConsole: React.FC<Props> = ({ user, onClose }) => {
  const [tab, setTab] = useState<Tab>('overview');
  const [users, setUsers] = useState<User[]>([]);
  const [groups, setGroups] = useState<Group[]>([]);
  const [workspace, setWorkspace] = useState<WorkspaceData | null>(null);
  const [history, setHistory] = useState<Login[]>([]);
  const [groupName, setGroupName] = useState('');
  const [newAccount, setNewAccount] = useState({ email: '', name: '', password: '' });
  const [memberSelection, setMemberSelection] = useState<Record<string, string[]>>({});
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);

  const refresh = async () => {
    setBusy(true); setError('');
    try {
      const [nextUsers, nextGroups, nextWorkspace, nextHistory] = await Promise.all([
        api<User[]>(API_PATHS.admin.users),
        api<Group[]>(API_PATHS.groups),
        api<WorkspaceData>(API_PATHS.workspace),
        api<Login[]>(API_PATHS.admin.loginHistory),
      ]);
      setUsers(nextUsers); setGroups(nextGroups); setWorkspace(nextWorkspace); setHistory(nextHistory);
      setMemberSelection(Object.fromEntries(nextGroups.map(group => [group.id, group.members.map(member => member.id)])));
    } catch (reason) { setError(reason instanceof Error ? reason.message : '관리 정보를 불러오지 못했습니다.'); }
    finally { setBusy(false); }
  };

  useEffect(() => { void refresh(); }, []);

  const tables = useMemo(() => Object.values(workspace?.tables || {}) as TableDocument[], [workspace]);
  const documentsCount = Object.keys(workspace?.documents || {}).length;
  const activeUsers = users.filter(item => item.status === 'active').length;
  const failedLogins = history.filter(item => !item.success).length;

  const run = async (action: () => Promise<void>, success: string) => {
    setBusy(true); setError(''); setNotice('');
    try { await action(); await refresh(); setNotice(success); }
    catch (reason) { setError(reason instanceof Error ? reason.message : '요청을 처리하지 못했습니다.'); }
    finally { setBusy(false); }
  };

  const setBoardVisibility = async (table: TableDocument, visibility: 'shared' | 'private') => {
    const route = API_PATHS.tablePermissionsPattern.replace(':id', encodeURIComponent(table.id));
    await run(async () => {
      const permission = await api<{ groups: Array<{ groupId: string; permission: 'read' | 'write' }> }>(route);
      await api(route, { method: 'PUT', body: JSON.stringify({ visibility, groups: permission.groups || [] }) });
    }, `${table.title} 보드 공개 범위를 변경했습니다.`);
  };

  const tabs: Array<{ id: Tab; label: string; icon: React.ReactNode }> = [
    { id: 'overview', label: '현황', icon: <BarChart3 size={16}/> },
    { id: 'accounts', label: '계정', icon: <Users size={16}/> },
    { id: 'groups', label: '그룹', icon: <Layers3 size={16}/> },
    { id: 'boards', label: '보드·자료', icon: <FolderKanban size={16}/> },
    { id: 'history', label: '접속 기록', icon: <History size={16}/> },
  ];

  return <div className="fixed inset-0 z-[95] flex items-center justify-center bg-black/55 p-3 sm:p-6" onMouseDown={event => { if (event.target === event.currentTarget) onClose(); }}>
    <section className="flex max-h-[92vh] w-full max-w-6xl flex-col overflow-hidden rounded-2xl border border-stone-200 bg-white shadow-2xl dark:border-stone-700 dark:bg-stone-900">
      <header className="flex items-center justify-between border-b border-stone-200 px-5 py-4 dark:border-stone-700">
        <div className="flex items-center gap-3"><span className="rounded-xl bg-amber-100 p-2 text-amber-800 dark:bg-amber-950 dark:text-amber-300"><Shield size={19}/></span><div><h2 className="font-bold text-lg">관리자 센터</h2><p className="text-xs text-stone-500">계정, 그룹, 보드와 접속 현황을 한곳에서 관리합니다.</p></div></div>
        <div className="flex items-center gap-2"><button disabled={busy} onClick={() => void refresh()} className={buttonClass} title="새로고침"><RefreshCw size={16} className={busy ? 'animate-spin' : ''}/></button><button onClick={onClose} aria-label="닫기" className={buttonClass}><X size={17}/></button></div>
      </header>
      <nav className="flex gap-1 overflow-x-auto border-b border-stone-200 px-4 py-2 dark:border-stone-700">{tabs.map(item => <button key={item.id} onClick={() => setTab(item.id)} className={`inline-flex shrink-0 items-center gap-2 rounded-lg px-3 py-2 text-sm ${tab === item.id ? 'bg-stone-900 font-semibold text-white dark:bg-amber-500 dark:text-stone-950' : 'text-stone-600 hover:bg-stone-100 dark:text-stone-300 dark:hover:bg-stone-800'}`}>{item.icon}{item.label}</button>)}</nav>
      <main className="min-h-0 flex-1 overflow-auto p-4 sm:p-6">
        {error && <p role="alert" className="mb-4 rounded-lg bg-rose-50 p-3 text-sm text-rose-700 dark:bg-rose-950/30 dark:text-rose-300">{error}</p>}
        {notice && <p className="mb-4 rounded-lg bg-emerald-50 p-3 text-sm text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-300">{notice}</p>}

        {tab === 'overview' && <>
          <div className="mb-5"><h3 className="text-lg font-bold">워크스페이스 운영 현황</h3><p className="text-sm text-stone-500">현재 등록된 계정과 공유 자원을 요약합니다.</p></div>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">{[
            ['활성 계정', `${activeUsers} / ${users.length}`, '차단 계정 포함'], ['마스터', users.filter(item => item.role === 'master').length, '관리 권한 계정'],
            ['그룹', groups.length, '팀별 권한 관리'], ['보드 / 노트', `${tables.length} / ${documentsCount}`, '전체 등록 자료'],
          ].map(([label, value, caption]) => <div key={String(label)} className="rounded-xl border border-stone-200 p-4 dark:border-stone-700"><div className="text-xs text-stone-500">{label}</div><div className="my-2 text-2xl font-bold">{value}</div><div className="text-xs text-stone-400">{caption}</div></div>)}</div>
          <div className="mt-5 grid gap-4 lg:grid-cols-2"><section className="rounded-xl border border-stone-200 p-4 dark:border-stone-700"><h4 className="mb-3 flex items-center gap-2 font-semibold"><Activity size={16}/>최근 접속 시도</h4>{history.slice(0, 6).map(item => <div key={item.id} className="flex items-center justify-between border-t py-2 text-sm dark:border-stone-800"><span>{item.display_name || item.email || '알 수 없는 계정'}<small className="ml-2 text-stone-400">{new Date(item.created_at).toLocaleString()}</small></span><span className={item.success ? 'text-emerald-600' : 'text-rose-600'}>{item.success ? '성공' : '실패'}</span></div>)}{!history.length && <p className="text-sm text-stone-500">접속 기록이 없습니다.</p>}<div className="mt-2 text-xs text-stone-500">실패한 로그인 {failedLogins}건</div></section>
            <section className="rounded-xl border border-stone-200 p-4 dark:border-stone-700"><h4 className="mb-3 font-semibold">공개 범위 현황</h4><div className="space-y-2 text-sm"><div className="flex justify-between"><span>전체 공유 보드</span><b>{tables.filter(table => !table.visibility || table.visibility === 'shared').length}</b></div><div className="flex justify-between"><span>개인 보드</span><b>{tables.filter(table => table.visibility === 'private').length}</b></div><div className="flex justify-between"><span>그룹 전용 보드</span><b>{tables.filter(table => table.visibility === 'group').length}</b></div></div></section></div>
        </>}

        {tab === 'accounts' && <>
          <h3 className="mb-3 text-lg font-bold">계정 등록 및 권한</h3>
          <form className="mb-5 grid gap-2 rounded-xl bg-stone-50 p-3 dark:bg-stone-800/60 sm:grid-cols-2 xl:grid-cols-[1.2fr_1fr_1fr_auto]" onSubmit={event => { event.preventDefault(); void run(async () => { await api(API_PATHS.admin.users, { method: 'POST', body: JSON.stringify({ email: newAccount.email, displayName: newAccount.name, password: newAccount.password }) }); setNewAccount({ email: '', name: '', password: '' }); }, '계정을 등록했습니다.'); }}>
            <input required type="email" placeholder="이메일" value={newAccount.email} onChange={event => setNewAccount({ ...newAccount, email: event.target.value })} className="rounded-lg border bg-white p-2 text-sm dark:border-stone-700 dark:bg-stone-900"/><input placeholder="표시 이름" value={newAccount.name} onChange={event => setNewAccount({ ...newAccount, name: event.target.value })} className="rounded-lg border bg-white p-2 text-sm dark:border-stone-700 dark:bg-stone-900"/><input required minLength={8} type="password" placeholder="초기 비밀번호 (8자 이상)" value={newAccount.password} onChange={event => setNewAccount({ ...newAccount, password: event.target.value })} className="rounded-lg border bg-white p-2 text-sm dark:border-stone-700 dark:bg-stone-900"/><button disabled={busy} className="rounded-lg bg-amber-500 px-4 py-2 text-sm font-semibold text-stone-950"><Plus className="mr-1 inline" size={15}/>계정 등록</button>
          </form>
          <div className="overflow-hidden rounded-xl border border-stone-200 dark:border-stone-700">{users.map(item => <div key={item.id} className="grid gap-2 border-b p-3 last:border-0 dark:border-stone-800 sm:grid-cols-[minmax(0,1fr)_150px_100px_auto] sm:items-center"><div className="min-w-0"><b className="block truncate text-sm">{item.display_name || item.email}</b><span className="text-xs text-stone-500">{item.email} · 생성 {new Date(item.created_at).toLocaleDateString()}</span></div><select value={item.role} disabled={item.id === user.id || busy} onChange={event => void run(async () => { await api(API_PATHS.admin.userByIdPattern.replace(':id', encodeURIComponent(item.id)), { method: 'PATCH', body: JSON.stringify({ role: event.target.value }) }); }, '계정 역할을 변경했습니다.')} className="rounded border bg-transparent p-1.5 text-sm dark:border-stone-700"><option value="user">일반 계정</option><option value="master">마스터</option></select><span className={`text-xs ${item.status === 'active' ? 'text-emerald-600' : 'text-rose-600'}`}>{item.status === 'active' ? '활성' : '비활성'}</span><button disabled={item.id === user.id || busy} onClick={() => void run(async () => { await api(API_PATHS.admin.userByIdPattern.replace(':id', encodeURIComponent(item.id)), { method: 'PATCH', body: JSON.stringify({ status: item.status === 'active' ? 'disabled' : 'active' }) }); }, item.status === 'active' ? '계정을 비활성화했습니다.' : '계정을 활성화했습니다.')} className="text-left text-xs underline disabled:opacity-40">{item.status === 'active' ? '비활성화' : '활성화'}</button></div>)}</div>
        </>}

        {tab === 'groups' && <>
          <h3 className="mb-3 text-lg font-bold">팀 그룹 및 구성원</h3>
          <form className="mb-4 flex gap-2" onSubmit={event => { event.preventDefault(); void run(async () => { await api(API_PATHS.groups, { method: 'POST', body: JSON.stringify({ name: groupName }) }); setGroupName(''); }, '그룹을 만들었습니다.'); }}><input required maxLength={80} value={groupName} onChange={event => setGroupName(event.target.value)} placeholder="새 그룹 이름" className="min-w-0 flex-1 rounded-lg border p-2 text-sm dark:border-stone-700 dark:bg-stone-900"/><button disabled={busy} className="rounded-lg bg-indigo-600 px-4 text-sm font-semibold text-white"><Plus className="mr-1 inline" size={15}/>그룹 만들기</button></form>
          <div className="space-y-3">{groups.map(group => <details key={group.id} className="rounded-xl border border-stone-200 p-3 dark:border-stone-700"><summary className="flex cursor-pointer list-none items-center justify-between gap-3"><span><b>{group.name}</b><small className="ml-2 text-stone-500">{group.members.length}명 · 소유자 {group.members.find(item => item.id === group.owner_id)?.display_name || group.members.find(item => item.id === group.owner_id)?.email || '미확인'}</small></span><button type="button" disabled={busy} onClick={event => { event.preventDefault(); event.stopPropagation(); if (window.confirm(`“${group.name}” 그룹을 삭제할까요? 연결된 보드의 그룹 권한도 해제됩니다.`)) void run(async () => { await api(API_PATHS.groupByIdPattern.replace(':id', encodeURIComponent(group.id)), { method: 'DELETE' }); }, '그룹을 삭제했습니다.'); }} className="rounded p-2 text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/30" title="그룹 삭제"><Trash2 size={15}/></button></summary>
            <div className="mt-3 grid gap-2 border-t pt-3 dark:border-stone-800 sm:grid-cols-2">{group.users.map(member => <label key={member.id} className="flex items-center gap-2 rounded-lg px-2 py-1 text-sm hover:bg-stone-50 dark:hover:bg-stone-800"><input type="checkbox" checked={(memberSelection[group.id] || []).includes(member.id)} disabled={busy || member.id === group.owner_id} onChange={event => setMemberSelection(current => ({ ...current, [group.id]: event.target.checked ? [...(current[group.id] || []), member.id] : (current[group.id] || []).filter(id => id !== member.id) }))}/><span className="truncate">{member.display_name || member.email}</span><small className="ml-auto text-stone-400">{member.email}</small></label>)}</div>
            <button disabled={busy} onClick={() => void run(async () => { await api(API_PATHS.groupMembersPattern.replace(':id', encodeURIComponent(group.id)), { method: 'PUT', body: JSON.stringify({ memberIds: memberSelection[group.id] || [] }) }); }, `${group.name} 구성원을 저장했습니다.`)} className="mt-3 rounded-lg bg-stone-900 px-3 py-2 text-xs font-semibold text-white dark:bg-amber-500 dark:text-stone-950">구성원 저장</button>
          </details>)}</div>
          {!groups.length && <p className="rounded-xl border border-dashed p-8 text-center text-sm text-stone-500">아직 그룹이 없습니다.</p>}
        </>}

        {tab === 'boards' && <>
          <div className="mb-4"><h3 className="text-lg font-bold">보드 및 자료 관리</h3><p className="text-sm text-stone-500">보드 공개 범위를 바꿀 수 있습니다. 그룹 전용 보드의 그룹별 읽기·쓰기 설정은 사이드바의 ‘공유 및 그룹 권한’에서 관리하세요.</p></div>
          <div className="overflow-hidden rounded-xl border border-stone-200 dark:border-stone-700">{tables.map(table => <div key={table.id} className="grid gap-2 border-b p-3 last:border-0 dark:border-stone-800 sm:grid-cols-[minmax(0,1fr)_130px_100px] sm:items-center"><div className="min-w-0"><b className="block truncate text-sm">{table.title}</b><small className="text-stone-500">{table.rows.length}개 항목 · {table.id}</small></div><span className="text-xs text-stone-500">{table.visibility === 'private' ? '개인' : table.visibility === 'group' ? '그룹 전용' : '전체 공유'}</span><select value={table.visibility === 'private' ? 'private' : 'shared'} disabled={busy || table.visibility === 'group'} onChange={event => void setBoardVisibility(table, event.target.value as 'shared' | 'private')} className="rounded border bg-transparent p-1.5 text-sm dark:border-stone-700"><option value="shared">전체 공유</option><option value="private">개인</option></select></div>)}</div>
          {!tables.length && <p className="rounded-xl border border-dashed p-8 text-center text-sm text-stone-500">등록된 보드가 없습니다.</p>}
          {workspace && <div className="mt-4 grid gap-3 sm:grid-cols-2"><div className="rounded-xl border p-4 dark:border-stone-700"><b>노트</b><span className="ml-3 text-sm text-stone-500">{documentsCount}개</span></div><div className="rounded-xl border p-4 dark:border-stone-700"><b>트리 항목</b><span className="ml-3 text-sm text-stone-500">{workspace.tree.length}개</span></div></div>}
        </>}

        {tab === 'history' && <><div className="mb-4 flex items-center gap-2"><History size={18}/><h3 className="text-lg font-bold">계정 접속 기록</h3></div><div className="overflow-hidden rounded-xl border border-stone-200 dark:border-stone-700">{history.map(item => <div key={item.id} className="grid gap-1 border-b p-3 last:border-0 dark:border-stone-800 sm:grid-cols-[minmax(0,1fr)_100px_180px]"><span className="text-sm">{item.display_name || item.email || '알 수 없는 계정'}<small className="block text-xs text-stone-500">{item.reason} · {item.ip || 'IP 미확인'}</small></span><span className={`text-xs ${item.success ? 'text-emerald-600' : 'text-rose-600'}`}>{item.success ? '로그인 성공' : '로그인 실패'}</span><time className="text-xs text-stone-500">{new Date(item.created_at).toLocaleString()}</time></div>)}</div>{!history.length && <p className="p-8 text-center text-sm text-stone-500">로그인 기록이 없습니다.</p>}</>}
      </main>
      <footer className="flex items-center justify-between border-t px-5 py-3 text-xs text-stone-500 dark:border-stone-700"><span>{user.displayName || user.email} · 마스터 계정</span><span>기본 읽기/쓰기 권한: ON</span></footer>
    </section>
  </div>;
};
