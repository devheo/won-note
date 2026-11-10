import React, { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  Activity,
  BarChart3,
  FolderKanban,
  History,
  Layers3,
  LogOut,
  Plus,
  RefreshCw,
  Search,
  Shield,
  Trash2,
  Users,
  X,
  HardDrive,
  Download,
  FileText,
  Image as ImageIcon,
  MessageSquare,
  ExternalLink,
} from 'lucide-react';
import { API_PATHS } from '../../constants/api';
import { fetchBridge } from '../../services/httpBridge';
import type { TableDocument, WorkspaceData } from '../../types';

type Tab = 'overview' | 'accounts' | 'groups' | 'boards' | 'files' | 'history';
type User = { id: string; email: string; display_name: string; role: 'master' | 'user'; status: string; created_at: number; last_login_at: number | null };
type Member = { id: string; email: string; display_name: string; role: string };
type Group = { id: string; name: string; owner_id: string; members: Member[]; users: Member[] };
type Login = { id: string; email: string; display_name?: string; success: number; reason: string; ip: string; created_at: number };
type CurrentUser = { id: string; email: string; displayName: string; role: string };
type AdminFile = {
  id: string;
  fileType: 'chat_attachment' | 'row_image';
  filename: string;
  mimeType: string;
  size: number;
  createdAt: number;
  storageType: 's3' | 'local' | 'sqlite';
  uploaderName?: string;
  downloadUrl: string;
  tableId?: string;
};

type Props = { user: CurrentUser; onClose: () => void };

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetchBridge(path, { ...init, headers: { 'Content-Type': 'application/json', ...(init?.headers || {}) } });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || `요청 실패 (${response.status})`);
  return data as T;
}

function formatBytes(bytes: number): string {
  if (bytes <= 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${(bytes / Math.pow(k, i)).toFixed(1)} ${sizes[i]}`;
}

const buttonClass = 'rounded-lg border border-stone-200 px-3 py-2 text-sm hover:bg-stone-50 dark:border-stone-700 dark:hover:bg-stone-800 cursor-pointer';

export const AdminConsole: React.FC<Props> = ({ user, onClose }) => {
  const [tab, setTab] = useState<Tab>('overview');
  const [users, setUsers] = useState<User[]>([]);
  const [groups, setGroups] = useState<Group[]>([]);
  const [workspace, setWorkspace] = useState<WorkspaceData | null>(null);
  const [history, setHistory] = useState<Login[]>([]);
  const [files, setFiles] = useState<AdminFile[]>([]);
  const [groupName, setGroupName] = useState('');
  const [newAccount, setNewAccount] = useState({ email: '', name: '', password: '' });
  const [accountQuery, setAccountQuery] = useState('');
  const [fileQuery, setFileQuery] = useState('');
  const [memberSelection, setMemberSelection] = useState<Record<string, string[]>>({});
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);

  const refresh = async () => {
    setBusy(true); setError('');
    try {
      const [nextUsers, nextGroups, nextWorkspace, nextHistory, nextFiles] = await Promise.all([
        api<User[]>(API_PATHS.admin.users),
        api<Group[]>(API_PATHS.groups),
        api<WorkspaceData>(API_PATHS.workspace),
        api<Login[]>(API_PATHS.admin.loginHistory),
        api<AdminFile[]>('/api/admin/files').catch(() => []),
      ]);
      setUsers(Array.isArray(nextUsers) ? nextUsers : []);
      setGroups(Array.isArray(nextGroups) ? nextGroups : []);
      setWorkspace(nextWorkspace);
      setHistory(Array.isArray(nextHistory) ? nextHistory : []);
      setFiles(Array.isArray(nextFiles) ? nextFiles : []);
      setMemberSelection(Object.fromEntries((Array.isArray(nextGroups) ? nextGroups : []).map(group => [group.id, (group.members || []).map(member => member.id)])));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '관리 정보를 불러오지 못했습니다.');
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => { void refresh(); }, []);

  const tables = useMemo(() => Object.values(workspace?.tables || {}) as TableDocument[], [workspace]);
  const documentsCount = Object.keys(workspace?.documents || {}).length;
  const activeUsers = useMemo(() => (Array.isArray(users) ? users : []).filter(item => item.status === 'active').length, [users]);
  const failedLogins = useMemo(() => (Array.isArray(history) ? history : []).filter(item => !item.success).length, [history]);
  const visibleUsers = useMemo(() => (Array.isArray(users) ? users : []).filter(item => `${item.display_name || ''} ${item.email || ''}`.toLowerCase().includes(accountQuery.trim().toLowerCase())), [users, accountQuery]);

  const safeFiles = useMemo(() => (Array.isArray(files) ? files : []), [files]);

  const visibleFiles = useMemo(() => {
    if (!fileQuery.trim()) return safeFiles;
    const q = fileQuery.trim().toLowerCase();
    return safeFiles.filter(f =>
      (f.filename || '').toLowerCase().includes(q) ||
      (f.uploaderName || '').toLowerCase().includes(q) ||
      (f.mimeType || '').toLowerCase().includes(q)
    );
  }, [safeFiles, fileQuery]);

  const totalFilesSize = useMemo(() => safeFiles.reduce((acc, f) => acc + (f.size || 0), 0), [safeFiles]);
  const s3FileCount = useMemo(() => safeFiles.filter(f => f.storageType === 's3').length, [safeFiles]);
  const localFileCount = useMemo(() => safeFiles.filter(f => f.storageType === 'local').length, [safeFiles]);
  const sqliteFileCount = useMemo(() => safeFiles.filter(f => f.storageType === 'sqlite').length, [safeFiles]);

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

  const handleDeleteFile = async (file: AdminFile) => {
    if (!window.confirm(`“${file.filename}” 파일을 정말 삭제할까요?`)) return;
    await run(async () => {
      await api(`/api/admin/files/${encodeURIComponent(file.id)}`, { method: 'DELETE' });
    }, '파일을 삭제했습니다.');
  };

  const tabs: Array<{ id: Tab; label: string; icon: React.ReactNode }> = [
    { id: 'overview', label: '현황', icon: <BarChart3 size={16}/> },
    { id: 'accounts', label: '계정', icon: <Users size={16}/> },
    { id: 'groups', label: '그룹', icon: <Layers3 size={16}/> },
    { id: 'boards', label: '보드·자료', icon: <FolderKanban size={16}/> },
    { id: 'files', label: '업로드 파일', icon: <HardDrive size={16}/> },
    { id: 'history', label: '접속 기록', icon: <History size={16}/> },
  ];

  return createPortal(
    <div
      className="fixed inset-0 z-[999999] flex items-center justify-center bg-black/65 backdrop-blur-sm p-3 sm:p-6 animate-in fade-in duration-150"
      onMouseDown={event => { if (event.target === event.currentTarget) onClose(); }}
    >
      <section className="flex max-h-[92vh] w-full max-w-6xl flex-col overflow-hidden rounded-2xl border border-stone-200 bg-white shadow-2xl dark:border-stone-700 dark:bg-stone-900 animate-in zoom-in-95 duration-150 text-stone-900 dark:text-stone-100">
        <header className="flex items-center justify-between border-b border-stone-200 px-5 py-4 dark:border-stone-700 shrink-0">
          <div className="flex items-center gap-3">
            <span className="rounded-xl bg-amber-100 p-2 text-amber-800 dark:bg-amber-950 dark:text-amber-300">
              <Shield size={19}/>
            </span>
            <div>
              <h2 className="font-bold text-lg">관리자 센터</h2>
              <p className="text-xs text-stone-500 dark:text-stone-400">계정, 그룹, 보드, 파일 스토리지 및 접속 현황을 한곳에서 관리합니다.</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button disabled={busy} onClick={() => void refresh()} className={buttonClass} title="새로고침">
              <RefreshCw size={16} className={busy ? 'animate-spin' : ''}/>
            </button>
            <button onClick={onClose} aria-label="닫기" className={buttonClass}>
              <X size={17}/>
            </button>
          </div>
        </header>

        <nav className="flex gap-1 overflow-x-auto border-b border-stone-200 px-4 py-2 dark:border-stone-700 shrink-0 custom-scrollbar">
          {tabs.map(item => (
            <button
              key={item.id}
              onClick={() => setTab(item.id)}
              className={`inline-flex shrink-0 items-center gap-2 rounded-lg px-3 py-2 text-sm font-semibold transition-colors cursor-pointer ${
                tab === item.id
                  ? 'bg-stone-900 text-white dark:bg-amber-500 dark:text-stone-950 shadow-xs'
                  : 'text-stone-600 hover:bg-stone-100 dark:text-stone-300 dark:hover:bg-stone-800'
              }`}
            >
              {item.icon}
              {item.label}
            </button>
          ))}
        </nav>

        <main className="min-h-0 flex-1 overflow-auto p-4 sm:p-6 custom-scrollbar">
          {error && <p role="alert" className="mb-4 rounded-xl bg-rose-50 p-3 text-sm text-rose-700 border border-rose-200 dark:border-rose-800 dark:bg-rose-950/30 dark:text-rose-300 font-medium">{error}</p>}
          {notice && <p className="mb-4 rounded-xl bg-emerald-50 p-3 text-sm text-emerald-700 border border-emerald-200 dark:border-emerald-800 dark:bg-emerald-950/30 dark:text-emerald-300 font-medium">{notice}</p>}

          {tab === 'overview' && <>
            <div className="mb-5"><h3 className="text-lg font-bold">워크스페이스 운영 현황</h3><p className="text-sm text-stone-500">현재 등록된 계정과 공유 자원을 요약합니다.</p></div>
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">{[
              ['활성 계정', `${activeUsers} / ${users.length}`, '차단 계정 포함'], ['마스터', users.filter(item => item.role === 'master').length, '관리 권한 계정'],
              ['그룹', groups.length, '팀별 권한 관리'], ['보드 / 노트', `${tables.length} / ${documentsCount}`, '전체 등록 자료'],
              ['업로드 파일', `${files.length}개 (${formatBytes(totalFilesSize)})`, `S3/로컬: ${s3FileCount + localFileCount}개`],
            ].map(([label, value, caption]) => <div key={String(label)} className="rounded-xl border border-stone-200 p-4 dark:border-stone-700"><div className="text-xs text-stone-500">{label}</div><div className="my-2 text-2xl font-bold">{value}</div><div className="text-xs text-stone-400">{caption}</div></div>)}</div>
            <div className="mt-5 grid gap-4 lg:grid-cols-2"><section className="rounded-xl border border-stone-200 p-4 dark:border-stone-700"><h4 className="mb-3 flex items-center gap-2 font-semibold"><Activity size={16}/>최근 접속 시도</h4>{history.slice(0, 6).map(item => <div key={item.id} className="flex items-center justify-between border-t py-2 text-sm dark:border-stone-800"><span>{item.display_name || item.email || '알 수 없는 계정'}<small className="ml-2 text-stone-400">{new Date(item.created_at).toLocaleString()}</small></span><span className={item.success ? 'text-emerald-600' : 'text-rose-600'}>{item.success ? '성공' : '실패'}</span></div>)}{!history.length && <p className="text-sm text-stone-500">접속 기록이 없습니다.</p>}<div className="mt-2 text-xs text-stone-500">실패한 로그인 {failedLogins}건</div></section>
              <section className="rounded-xl border border-stone-200 p-4 dark:border-stone-700"><h4 className="mb-3 font-semibold">공개 범위 현황</h4><div className="space-y-2 text-sm"><div className="flex justify-between"><span>전체 공유 보드</span><b>{tables.filter(table => !table.visibility || table.visibility === 'shared').length}</b></div><div className="flex justify-between"><span>개인 보드</span><b>{tables.filter(table => table.visibility === 'private').length}</b></div><div className="flex justify-between"><span>그룹 전용 보드</span><b>{tables.filter(table => table.visibility === 'group').length}</b></div></div></section></div>
          </>}

          {tab === 'accounts' && <>
            <div className="mb-3 flex flex-wrap items-end justify-between gap-3"><div><h3 className="text-lg font-bold">계정 관리</h3><p className="text-sm text-stone-500">계정 조회, 관리자 권한 변경, 접속 종료와 계정 정지를 관리합니다.</p></div><span className="text-xs text-stone-500">{visibleUsers.length} / {users.length}개 계정</span></div>
            <form className="mb-5 grid gap-2 rounded-xl bg-stone-50 p-3 dark:bg-stone-800/60 sm:grid-cols-2 xl:grid-cols-[1.2fr_1fr_1fr_auto]" onSubmit={event => { event.preventDefault(); void run(async () => { await api(API_PATHS.admin.users, { method: 'POST', body: JSON.stringify({ email: newAccount.email, displayName: newAccount.name, password: newAccount.password }) }); setNewAccount({ email: '', name: '', password: '' }); }, '계정을 등록했습니다.'); }}>
              <input required type="email" placeholder="이메일" value={newAccount.email} onChange={event => setNewAccount({ ...newAccount, email: event.target.value })} className="rounded-lg border bg-white p-2 text-sm dark:border-stone-700 dark:bg-stone-900"/><input placeholder="표시 이름" value={newAccount.name} onChange={event => setNewAccount({ ...newAccount, name: event.target.value })} className="rounded-lg border bg-white p-2 text-sm dark:border-stone-700 dark:bg-stone-900"/><input required minLength={8} type="password" placeholder="초기 비밀번호 (8자 이상)" value={newAccount.password} onChange={event => setNewAccount({ ...newAccount, password: event.target.value })} className="rounded-lg border bg-white p-2 text-sm dark:border-stone-700 dark:bg-stone-900"/><button disabled={busy} className="rounded-lg bg-amber-500 px-4 py-2 text-sm font-semibold text-stone-950 cursor-pointer"><Plus className="mr-1 inline" size={15}/>계정 등록</button>
            </form>
            <label className="mb-3 flex items-center gap-2 rounded-lg border border-stone-200 px-3 dark:border-stone-700"><Search size={16} className="text-stone-400"/><input value={accountQuery} onChange={event => setAccountQuery(event.target.value)} placeholder="이름 또는 이메일로 계정 검색" className="min-w-0 flex-1 bg-transparent py-2 text-sm outline-none"/></label>
            <div className="overflow-hidden rounded-xl border border-stone-200 dark:border-stone-700">{visibleUsers.map(item => <div key={item.id} className="grid gap-2 border-b p-3 last:border-0 dark:border-stone-800 sm:grid-cols-[minmax(0,1fr)_140px_90px_auto_auto] sm:items-center"><div className="min-w-0"><b className="block truncate text-sm">{item.display_name || item.email}</b><span className="text-xs text-stone-500">{item.email} · 등록 {new Date(item.created_at).toLocaleDateString()} · 최근 접속 {item.last_login_at ? new Date(item.last_login_at).toLocaleString() : '없음'}</span></div><select value={item.role} disabled={item.id === user.id || busy} aria-label={`${item.email} 권한`} onChange={event => void run(async () => { await api(API_PATHS.admin.userByIdPattern.replace(':id', encodeURIComponent(item.id)), { method: 'PATCH', body: JSON.stringify({ role: event.target.value }) }); }, '계정 권한을 변경했습니다.')} className="rounded border bg-transparent p-1.5 text-sm dark:border-stone-700 cursor-pointer"><option value="user">일반 계정</option><option value="master">관리자</option></select><span className={`text-xs ${item.status === 'active' ? 'text-emerald-600' : 'text-rose-600'}`}>{item.status === 'active' ? '활성' : '정지됨'}</span><button disabled={item.id === user.id || busy || item.status !== 'active'} onClick={() => { if (window.confirm(`${item.display_name || item.email} 계정의 모든 접속을 종료할까요? 사용자는 다시 로그인할 수 있습니다.`)) void run(async () => { await api(API_PATHS.admin.userByIdPattern.replace(':id', encodeURIComponent(item.id)), { method: 'PATCH', body: JSON.stringify({ revokeSessions: true }) }); }, '해당 계정의 모든 접속을 종료했습니다.'); }} className="inline-flex items-center gap-1 text-xs text-amber-700 underline disabled:opacity-40 dark:text-amber-300 cursor-pointer" title="모든 세션 종료"><LogOut size={14}/>접속 종료</button><button disabled={item.id === user.id || busy} onClick={() => { const nextStatus = item.status === 'active' ? 'disabled' : 'active'; if (nextStatus === 'disabled' && !window.confirm(`${item.display_name || item.email} 계정을 정지하고 현재 접속도 종료할까요?`)) return; void run(async () => { await api(API_PATHS.admin.userByIdPattern.replace(':id', encodeURIComponent(item.id)), { method: 'PATCH', body: JSON.stringify({ status: nextStatus }) }); }, nextStatus === 'disabled' ? '계정을 정지하고 접속을 종료했습니다.' : '계정을 다시 활성화했습니다.'); }} className="text-left text-xs underline disabled:opacity-40 cursor-pointer">{item.status === 'active' ? '계정 정지' : '정지 해제'}</button></div>)}</div>
            {!visibleUsers.length && <p className="rounded-xl border border-dashed p-8 text-center text-sm text-stone-500">검색 결과가 없습니다.</p>}
          </>}

          {tab === 'groups' && <>
            <h3 className="mb-3 text-lg font-bold">팀 그룹 및 구성원</h3>
            <form className="mb-4 flex gap-2" onSubmit={event => { event.preventDefault(); void run(async () => { await api(API_PATHS.groups, { method: 'POST', body: JSON.stringify({ name: groupName }) }); setGroupName(''); }, '그룹을 만들었습니다.'); }}><input required maxLength={80} value={groupName} onChange={event => setGroupName(event.target.value)} placeholder="새 그룹 이름" className="min-w-0 flex-1 rounded-lg border p-2 text-sm dark:border-stone-700 dark:bg-stone-900"/><button disabled={busy} className="rounded-lg bg-indigo-600 px-4 text-sm font-semibold text-white cursor-pointer"><Plus className="mr-1 inline" size={15}/>그룹 만들기</button></form>
            <div className="space-y-3">{groups.map(group => <details key={group.id} className="rounded-xl border border-stone-200 p-3 dark:border-stone-700"><summary className="flex cursor-pointer list-none items-center justify-between gap-3"><span><b>{group.name}</b><small className="ml-2 text-stone-500">{group.members.length}명 · 소유자 {group.members.find(item => item.id === group.owner_id)?.display_name || group.members.find(item => item.id === group.owner_id)?.email || '미확인'}</small></span><button type="button" disabled={busy} onClick={event => { event.preventDefault(); event.stopPropagation(); if (window.confirm(`“${group.name}” 그룹을 삭제할까요? 연결된 보드의 그룹 권한도 해제됩니다.`)) void run(async () => { await api(API_PATHS.groupByIdPattern.replace(':id', encodeURIComponent(group.id)), { method: 'DELETE' }); }, '그룹을 삭제했습니다.'); }} className="rounded p-2 text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/30 cursor-pointer" title="그룹 삭제"><Trash2 size={15}/></button></summary>
              <div className="mt-3 grid gap-2 border-t pt-3 dark:border-stone-800 sm:grid-cols-2">{group.users.map(member => <label key={member.id} className="flex items-center gap-2 rounded-lg px-2 py-1 text-sm hover:bg-stone-50 dark:hover:bg-stone-800 cursor-pointer"><input type="checkbox" checked={(memberSelection[group.id] || []).includes(member.id)} disabled={busy || member.id === group.owner_id} onChange={event => setMemberSelection(current => ({ ...current, [group.id]: event.target.checked ? [...(current[group.id] || []), member.id] : (current[group.id] || []).filter(id => id !== member.id) }))}/><span className="truncate">{member.display_name || member.email}</span><small className="ml-auto text-stone-400">{member.email}</small></label>)}</div>
              <button disabled={busy} onClick={() => void run(async () => { await api(API_PATHS.groupMembersPattern.replace(':id', encodeURIComponent(group.id)), { method: 'PUT', body: JSON.stringify({ memberIds: memberSelection[group.id] || [] }) }); }, `${group.name} 구성원을 저장했습니다.`)} className="mt-3 rounded-lg bg-stone-900 px-3 py-2 text-xs font-semibold text-white dark:bg-amber-500 dark:text-stone-950 cursor-pointer">구성원 저장</button>
            </details>)}</div>
            {!groups.length && <p className="rounded-xl border border-dashed p-8 text-center text-sm text-stone-500">아직 그룹이 없습니다.</p>}
          </>}

          {tab === 'boards' && <>
            <div className="mb-4"><h3 className="text-lg font-bold">보드 및 자료 관리</h3><p className="text-sm text-stone-500">보드 공개 범위를 바꿀 수 있습니다. 그룹 전용 보드의 그룹별 읽기·쓰기 설정은 사이드바의 ‘공유 및 그룹 권한’에서 관리하세요.</p></div>
            <div className="overflow-hidden rounded-xl border border-stone-200 dark:border-stone-700">{tables.map(table => <div key={table.id} className="grid gap-2 border-b p-3 last:border-0 dark:border-stone-800 sm:grid-cols-[minmax(0,1fr)_130px_100px] sm:items-center"><div className="min-w-0"><b className="block truncate text-sm">{table.title}</b><small className="text-stone-500">{table.rows.length}개 항목 · {table.id}</small></div><span className="text-xs text-stone-500">{table.visibility === 'private' ? '개인' : table.visibility === 'group' ? '그룹 전용' : '전체 공유'}</span><select value={table.visibility === 'private' ? 'private' : 'shared'} disabled={busy || table.visibility === 'group'} onChange={event => void setBoardVisibility(table, event.target.value as 'shared' | 'private')} className="rounded border bg-transparent p-1.5 text-sm dark:border-stone-700 cursor-pointer"><option value="shared">전체 공유</option><option value="private">개인</option></select></div>)}</div>
            {!tables.length && <p className="rounded-xl border border-dashed p-8 text-center text-sm text-stone-500">등록된 보드가 없습니다.</p>}
            {workspace && <div className="mt-4 grid gap-3 sm:grid-cols-2"><div className="rounded-xl border p-4 dark:border-stone-700"><b>노트</b><span className="ml-3 text-sm text-stone-500">{documentsCount}개</span></div><div className="rounded-xl border p-4 dark:border-stone-700"><b>트리 항목</b><span className="ml-3 text-sm text-stone-500">{workspace.tree.length}개</span></div></div>}
          </>}

          {tab === 'files' && <>
            <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
              <div>
                <h3 className="text-lg font-bold">업로드 파일 스토리지 관리</h3>
                <p className="text-sm text-stone-500">채팅 첨부파일 및 테이블 이미지를 조회, 다운로드, 삭제 관리합니다.</p>
              </div>
              <span className="text-xs text-stone-500">{visibleFiles.length} / {files.length}개 파일</span>
            </div>

            {/* Summary Cards */}
            <div className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <div className="rounded-xl border border-stone-200 p-3.5 dark:border-stone-700 bg-stone-50/50 dark:bg-stone-800/40">
                <div className="text-xs text-stone-500">총 업로드 파일 수</div>
                <div className="my-1 text-xl font-bold text-stone-900 dark:text-stone-100">{files.length}개</div>
                <div className="text-[11px] text-stone-400">채팅 및 보드 이미지 포함</div>
              </div>
              <div className="rounded-xl border border-stone-200 p-3.5 dark:border-stone-700 bg-stone-50/50 dark:bg-stone-800/40">
                <div className="text-xs text-stone-500">총 파일 용량</div>
                <div className="my-1 text-xl font-bold text-stone-900 dark:text-stone-100">{formatBytes(totalFilesSize)}</div>
                <div className="text-[11px] text-stone-400">전체 스토리지 점유량</div>
              </div>
              <div className="rounded-xl border border-stone-200 p-3.5 dark:border-stone-700 bg-stone-50/50 dark:bg-stone-800/40">
                <div className="text-xs text-stone-500">☁️ S3 / 📁 로컬 파일</div>
                <div className="my-1 text-xl font-bold text-sky-600 dark:text-sky-400">{s3FileCount + localFileCount}개</div>
                <div className="text-[11px] text-stone-400">S3: {s3FileCount}개 / 로컬: {localFileCount}개</div>
              </div>
              <div className="rounded-xl border border-stone-200 p-3.5 dark:border-stone-700 bg-stone-50/50 dark:bg-stone-800/40">
                <div className="text-xs text-stone-500">💾 SQLite 내장 파일</div>
                <div className="my-1 text-xl font-bold text-emerald-600 dark:text-emerald-400">{sqliteFileCount}개</div>
                <div className="text-[11px] text-stone-400">DB 내장 이미지/파일</div>
              </div>
            </div>

            {/* Search Input */}
            <label className="mb-3 flex items-center gap-2 rounded-xl border border-stone-200 px-3 bg-white dark:bg-stone-900 dark:border-stone-700">
              <Search size={16} className="text-stone-400"/>
              <input
                value={fileQuery}
                onChange={event => setFileQuery(event.target.value)}
                placeholder="파일명, 작성자 이름/이메일 또는 확장자로 검색..."
                className="min-w-0 flex-1 bg-transparent py-2.5 text-sm outline-none"
              />
            </label>

            {/* Files List Table */}
            <div className="overflow-hidden rounded-xl border border-stone-200 dark:border-stone-700">
              {visibleFiles.map(file => (
                <div key={file.id} className="grid gap-2 border-b p-3 last:border-0 dark:border-stone-800 sm:grid-cols-[minmax(0,1fr)_120px_100px_120px_auto] sm:items-center text-xs">
                  <div className="min-w-0 flex items-center gap-2.5">
                    <div className="p-2 rounded-lg bg-stone-100 dark:bg-stone-800 shrink-0">
                      {file.mimeType.startsWith('image/') ? <ImageIcon size={16} className="text-sky-500" /> : <MessageSquare size={16} className="text-amber-500" />}
                    </div>
                    <div className="min-w-0">
                      <b className="block truncate text-sm font-semibold text-stone-800 dark:text-stone-200" title={file.filename}>
                        {file.filename}
                      </b>
                      <span className="text-[11px] text-stone-500 dark:text-stone-400">
                        {file.uploaderName || '익명'} · {new Date(file.createdAt).toLocaleString()}
                      </span>
                    </div>
                  </div>

                  {/* Category Badge */}
                  <div>
                    <span className={`inline-flex items-center px-2 py-0.5 rounded-md font-bold text-[10px] ${
                      file.fileType === 'chat_attachment'
                        ? 'bg-amber-500/15 text-amber-700 dark:text-amber-300'
                        : 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300'
                    }`}>
                      {file.fileType === 'chat_attachment' ? '💬 채팅 첨부' : '📊 테이블 이미지'}
                    </span>
                  </div>

                  {/* Storage Type Badge */}
                  <div>
                    <span className={`inline-flex items-center px-2 py-0.5 rounded-md font-bold text-[10px] ${
                      file.storageType === 's3'
                        ? 'bg-sky-500/15 text-sky-700 dark:text-sky-300'
                        : file.storageType === 'local'
                        ? 'bg-indigo-500/15 text-indigo-700 dark:text-indigo-300'
                        : 'bg-stone-200 dark:bg-stone-800 text-stone-700 dark:text-stone-300'
                    }`}>
                      {file.storageType === 's3' ? '☁️ S3/Floci' : file.storageType === 'local' ? '📁 로컬 오브젝트' : '💾 SQLite DB'}
                    </span>
                  </div>

                  {/* File Size */}
                  <div className="font-mono font-semibold text-stone-700 dark:text-stone-300">
                    {formatBytes(file.size)}
                  </div>

                  {/* Action Buttons */}
                  <div className="flex items-center gap-2">
                    <a
                      href={file.downloadUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="p-1.5 rounded-lg border border-stone-200 dark:border-stone-700 hover:bg-stone-100 dark:hover:bg-stone-800 text-stone-700 dark:text-stone-300 font-semibold flex items-center gap-1 cursor-pointer"
                      title="다운로드 / 새 탭에서 열기"
                    >
                      <Download size={13} className="text-sky-500" />
                      <span>보기</span>
                    </a>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => void handleDeleteFile(file)}
                      className="p-1.5 rounded-lg border border-rose-200 dark:border-rose-900/50 bg-rose-50 dark:bg-rose-950/40 hover:bg-rose-100 text-rose-600 dark:text-rose-400 font-semibold flex items-center gap-1 cursor-pointer disabled:opacity-40"
                      title="파일 삭제"
                    >
                      <Trash2 size={13} />
                      <span>삭제</span>
                    </button>
                  </div>
                </div>
              ))}
            </div>
            {!visibleFiles.length && <p className="rounded-xl border border-dashed p-8 text-center text-sm text-stone-500">업로드된 파일이 없거나 검색 결과가 없습니다.</p>}
          </>}

          {tab === 'history' && <><div className="mb-4 flex items-center gap-2"><History size={18}/><h3 className="text-lg font-bold">계정 접속 기록</h3></div><div className="overflow-hidden rounded-xl border border-stone-200 dark:border-stone-700">{history.map(item => <div key={item.id} className="grid gap-1 border-b p-3 last:border-0 dark:border-stone-800 sm:grid-cols-[minmax(0,1fr)_100px_180px]"><span className="text-sm">{item.display_name || item.email || '알 수 없는 계정'}<small className="block text-xs text-stone-500">{item.reason} · {item.ip || 'IP 미확인'}</small></span><span className={`text-xs ${item.success ? 'text-emerald-600' : 'text-rose-600'}`}>{item.success ? '로그인 성공' : '로그인 실패'}</span><time className="text-xs text-stone-500">{new Date(item.created_at).toLocaleString()}</time></div>)}</div>{!history.length && <p className="p-8 text-center text-sm text-stone-500">로그인 기록이 없습니다.</p>}</>}
        </main>
        <footer className="flex items-center justify-between border-t px-5 py-3 text-xs text-stone-500 dark:border-stone-700 shrink-0"><span>{user.displayName || user.email} · 마스터 계정</span><span>기본 읽기/쓰기 권한: ON</span></footer>
      </section>
    </div>,
    document.body
  );
};
