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
  Database,
  Sparkles,
  Loader2,
} from 'lucide-react';
import { API_PATHS } from '../../constants/api';
import { fetchBridge, resolveApiUrl } from '../../services/httpBridge';
import type { TableDocument, WorkspaceData } from '../../types';

type Tab = 'overview' | 'accounts' | 'groups' | 'boards' | 'files' | 'history' | 'database';
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
type AdminDbStats = {
  fileSize: number;
  filePath: string;
  lastUpdated: number;
  counts: {
    tables: number;
    treeItems: number;
    tableRows: number;
    notes: number;
    tableColumns: number;
    calendarEvents: number;
    rowImages: number;
    documentHistory: number;
    authUsers: number;
    userGroups: number;
  };
};
type AdminTablePage = { tableName: string; columns: string[]; rows: Array<Record<string, unknown>>; total: number; offset: number; limit: number };

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
  const [dbStats, setDbStats] = useState<AdminDbStats | null>(null);
  const [selectedDbTable, setSelectedDbTable] = useState('');
  const [dbTablePage, setDbTablePage] = useState<AdminTablePage | null>(null);
  const [dbTableBusy, setDbTableBusy] = useState(false);
  const [dbRowDetail, setDbRowDetail] = useState<Record<string, unknown> | null>(null);
  const [dbTableSearch, setDbTableSearch] = useState('');
  const [groupName, setGroupName] = useState('');
  const [newAccount, setNewAccount] = useState({ email: '', name: '', password: '' });
  const [accountQuery, setAccountQuery] = useState('');
  const [fileQuery, setFileQuery] = useState('');
  const [memberSelection, setMemberSelection] = useState<Record<string, string[]>>({});
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);

  const refreshDbStats = async () => {
    try {
      const stats = await api<AdminDbStats>('/api/admin/db/stats');
      setDbStats(stats);
      return true;
    } catch (reason) {
      setDbStats(null);
      setError(reason instanceof Error ? reason.message : 'DB 통계를 불러오지 못했습니다.');
      return false;
    }
  };

  const loadDbTable = async (tableName: string, offset = 0, search = dbTableSearch) => {
    setSelectedDbTable(tableName); setDbTableBusy(true); setError('');
    try {
      const params = new URLSearchParams({ offset: String(offset), limit: '50', search });
      const page = await api<AdminTablePage>(`/api/admin/db/tables/${encodeURIComponent(tableName)}/rows?${params.toString()}`);
      setDbTablePage(page);
    } catch (reason) {
      setDbTablePage(null);
      setError(reason instanceof Error ? reason.message : '테이블 데이터를 불러오지 못했습니다.');
    } finally { setDbTableBusy(false); }
  };
  const loadDbRowDetail = async (tableName: string, rowOffset: number) => {
    setDbTableBusy(true);
    try { setDbRowDetail(await api<Record<string, unknown>>(`/api/admin/db/tables/${encodeURIComponent(tableName)}/rows/${rowOffset}?search=${encodeURIComponent(dbTableSearch)}`)); }
    catch (reason) { setError(reason instanceof Error ? reason.message : '상세 데이터를 불러오지 못했습니다.'); }
    finally { setDbTableBusy(false); }
  };

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
      await refreshDbStats();
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
  useEffect(() => { if (tab === 'database') void refreshDbStats(); }, [tab]);

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

  const handleVacuumDb = async () => {
    await run(async () => {
      const result = await api<{ message: string; stats: AdminDbStats }>('/api/admin/db/vacuum', { method: 'POST' });
      if (result.stats) setDbStats(result.stats);
    }, 'SQLite 데이터베이스 최적화(VACUUM)를 성공적으로 완료했습니다.');
  };

  const handleCleanOrphansDb = async () => {
    if (!window.confirm('트리에 존재하지 않는 고아 테이블 및 정리되지 않은 물리 레코드를 정돈할까요?')) return;
    await run(async () => {
      const result = await api<{ message: string; stats: AdminDbStats }>('/api/admin/db/clean-orphans', { method: 'POST' });
      if (result.stats) setDbStats(result.stats);
    }, '고아 레코드 및 비일관성 데이터 정돈을 완료했습니다.');
  };

  const handleReloadDb = async () => {
    if (!window.confirm('디스크에서 데이터베이스를 재로드하시겠습니까? 메모리의 미저장 변경사항이 덮어씌워질 수 있습니다.')) return;
    await run(async () => {
      await api(API_PATHS.databaseReload, { method: 'POST' });
    }, '디스크 데이터베이스 재로드를 완료했습니다.');
  };

  const handleDownloadDbBackup = () => {
    const a = document.createElement('a');
    a.href = resolveApiUrl('/api/admin/db/download');
    a.download = 'wonnote_backup.sqlite';
    a.click();
  };

  const tabs: Array<{ id: Tab; label: string; icon: React.ReactNode }> = [
    { id: 'overview', label: '현황', icon: <BarChart3 size={16}/> },
    { id: 'accounts', label: '계정', icon: <Users size={16}/> },
    { id: 'groups', label: '그룹', icon: <Layers3 size={16}/> },
    { id: 'boards', label: '보드·자료', icon: <FolderKanban size={16}/> },
    { id: 'files', label: '업로드 파일', icon: <HardDrive size={16}/> },
    { id: 'history', label: '접속 기록', icon: <History size={16}/> },
    { id: 'database', label: 'DB 관리', icon: <Database size={16}/> },
  ];

  return createPortal(
    <div
      className="fixed inset-0 z-[999999] flex items-center justify-center bg-black/65 backdrop-blur-sm p-3 sm:p-6 animate-in fade-in duration-150"
      onMouseDown={event => { if (event.target === event.currentTarget) onClose(); }}
    >
      <section aria-busy={busy} className="relative flex max-h-[92vh] w-full max-w-6xl flex-col overflow-hidden rounded-2xl border border-stone-200 bg-white shadow-2xl dark:border-stone-700 dark:bg-stone-900 animate-in zoom-in-95 duration-150 text-stone-900 dark:text-stone-100">
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

          {tab === 'database' && (
            <>
              {!dbStats && <p role="alert" className="mb-4 rounded-xl border border-rose-300 bg-rose-50 p-3 text-sm text-rose-800 dark:border-rose-900 dark:bg-rose-950/30 dark:text-rose-200">DB 통계를 불러오지 못했습니다. 위 오류를 확인한 뒤 새로고침을 눌러 다시 시도해 주세요.</p>}
              <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
                <div>
                  <h3 className="text-lg font-bold">SQLite 데이터베이스(DB) 관리 및 최적화</h3>
                  <p className="text-sm text-stone-500">데이터베이스 통계 확인, 공간 최적화(VACUUM), 고아 레코드 정돈 및 물리 백업을 관리합니다.</p>
                </div>
                <span className="text-xs text-stone-500 font-mono">
                  {dbStats?.filePath ? `경로: ${dbStats.filePath}` : 'SQLite DB Active'}
                </span>
              </div>

              {/* DB Status & Metrics Grid */}
              <div className="mb-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <div className="rounded-xl border border-stone-200 p-4 dark:border-stone-700 bg-amber-50/40 dark:bg-amber-950/20">
                  <div className="text-xs text-stone-500 dark:text-stone-400">데이터베이스 파일 용량</div>
                  <div className="my-1.5 text-2xl font-bold text-amber-700 dark:text-amber-400 font-mono">
                    {formatBytes(dbStats?.fileSize || 0)}
                  </div>
                  <div className="text-[11px] text-stone-400">SQLite 물리 DB 크기</div>
                </div>

                <div className="rounded-xl border border-stone-200 p-4 dark:border-stone-700 bg-stone-50/50 dark:bg-stone-800/40">
                  <div className="text-xs text-stone-500 dark:text-stone-400">등록된 테이블 / 노트 레코드</div>
                  <div className="my-1.5 text-2xl font-bold text-stone-900 dark:text-stone-100 font-mono">
                    {dbStats?.counts?.tables || 0}개 / {dbStats?.counts?.notes || 0}개
                  </div>
                  <div className="text-[11px] text-stone-400">트리 항목: {dbStats?.counts?.treeItems || 0}개</div>
                </div>

                <div className="rounded-xl border border-stone-200 p-4 dark:border-stone-700 bg-stone-50/50 dark:bg-stone-800/40">
                  <div className="text-xs text-stone-500 dark:text-stone-400">테이블 행(Row) / 열(Column)</div>
                  <div className="my-1.5 text-2xl font-bold text-sky-600 dark:text-sky-400 font-mono">
                    {dbStats?.counts?.tableRows || 0}행 / {dbStats?.counts?.tableColumns || 0}열
                  </div>
                  <div className="text-[11px] text-stone-400">일정: {dbStats?.counts?.calendarEvents || 0}개</div>
                </div>

                <div className="rounded-xl border border-stone-200 p-4 dark:border-stone-700 bg-stone-50/50 dark:bg-stone-800/40">
                  <div className="text-xs text-stone-500 dark:text-stone-400">계정 / 그룹 / 이미지 에셋</div>
                  <div className="my-1.5 text-2xl font-bold text-emerald-600 dark:text-emerald-400 font-mono">
                    {dbStats?.counts?.authUsers || 0}명 / {dbStats?.counts?.rowImages || 0}개
                  </div>
                  <div className="text-[11px] text-stone-400">이력 스냅샷: {dbStats?.counts?.documentHistory || 0}개</div>
                </div>
              </div>

              {/* Maintenance Tools Toolbar */}
              <div className="mb-5 rounded-xl border border-stone-200 p-4 dark:border-stone-700 bg-white dark:bg-stone-900">
                <h4 className="mb-3 font-bold text-sm text-stone-800 dark:text-stone-200 flex items-center gap-2">
                  <Database size={16} className="text-amber-500" />
                  <span>데이터베이스 관리 및 백업 액션</span>
                </h4>
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void handleVacuumDb()}
                    className="p-3.5 rounded-xl border border-stone-200 dark:border-stone-700 hover:bg-amber-50 dark:hover:bg-amber-950/30 text-left transition-colors cursor-pointer group disabled:opacity-40"
                  >
                    <div className="flex items-center justify-between font-bold text-xs text-amber-700 dark:text-amber-400 mb-1">
                      <span>🧹 DB VACUUM 최적화</span>
                      <Sparkles size={14} className="group-hover:scale-110 transition-transform" />
                    </div>
                    <p className="text-[11px] text-stone-500 dark:text-stone-400 leading-relaxed">
                      삭제된 미사용 빈 페이지를 정리하고 파편화된 공간을 수축하여 DB 파일 용량을 최적화합니다.
                    </p>
                  </button>

                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void handleCleanOrphansDb()}
                    className="p-3.5 rounded-xl border border-stone-200 dark:border-stone-700 hover:bg-rose-50 dark:hover:bg-rose-950/30 text-left transition-colors cursor-pointer group disabled:opacity-40"
                  >
                    <div className="flex items-center justify-between font-bold text-xs text-rose-700 dark:text-rose-400 mb-1">
                      <span>🛡️ 고아 레코드 정돈</span>
                      <Trash2 size={14} className="group-hover:scale-110 transition-transform" />
                    </div>
                    <p className="text-[11px] text-stone-500 dark:text-stone-400 leading-relaxed">
                      사이드바 트리에 존재하지 않는 무효 물리 테이블과 유령 레코드를 일괄 검사하여 정리합니다.
                    </p>
                  </button>

                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void handleReloadDb()}
                    className="p-3.5 rounded-xl border border-stone-200 dark:border-stone-700 hover:bg-sky-50 dark:hover:bg-sky-950/30 text-left transition-colors cursor-pointer group disabled:opacity-40"
                  >
                    <div className="flex items-center justify-between font-bold text-xs text-sky-700 dark:text-sky-400 mb-1">
                      <span>🔄 디스크 DB 재로드</span>
                      <RefreshCw size={14} className="group-hover:rotate-180 transition-transform duration-300" />
                    </div>
                    <p className="text-[11px] text-stone-500 dark:text-stone-400 leading-relaxed">
                      서버 물리 디스크 `.sqlite` 파일 원본으로부터 데이터베이스를 강제로 새로 읽어옵니다.
                    </p>
                  </button>

                  <button
                    type="button"
                    disabled={busy}
                    onClick={handleDownloadDbBackup}
                    className="p-3.5 rounded-xl border border-stone-200 dark:border-stone-700 hover:bg-emerald-50 dark:hover:bg-emerald-950/30 text-left transition-colors cursor-pointer group disabled:opacity-40"
                  >
                    <div className="flex items-center justify-between font-bold text-xs text-emerald-700 dark:text-emerald-400 mb-1">
                      <span>💾 DB 원본 백업 (.sqlite)</span>
                      <Download size={14} className="group-hover:translate-y-0.5 transition-transform" />
                    </div>
                    <p className="text-[11px] text-stone-500 dark:text-stone-400 leading-relaxed">
                      현재 SQLite 물리 데이터베이스 원본 파일(`.sqlite`)을 컴퓨터에 안전하게 즉시 백업 다운로드합니다.
                    </p>
                  </button>
                </div>
              </div>

              {/* SQLite Tables Inventory Breakdown */}
              <div className="overflow-hidden rounded-xl border border-stone-200 dark:border-stone-700">
                <div className="px-4 py-3 bg-stone-100/70 dark:bg-stone-800/60 border-b border-stone-200 dark:border-stone-700 flex items-center justify-between">
                  <h4 className="font-bold text-xs text-stone-800 dark:text-stone-200 flex items-center gap-2">
                    <Database size={14} className="text-amber-500" />
                    <span>SQLite 시스템 테이블별 저장 상태</span>
                  </h4>
                  <span className="text-[11px] text-stone-500 font-mono">Total Tables: 10</span>
                </div>

                <div className="divide-y divide-stone-200 dark:divide-stone-800 text-xs">
                  {[
                    { name: 'tables', desc: '테이블 메타데이터 및 설정 (Data Tables)', count: dbStats?.counts?.tables || 0, badge: '핵심 테이블' },
                    { name: 'tree_items', desc: '워크스페이스 무한 깊이 트리 구조 (Folders / Documents / Tables)', count: dbStats?.counts?.treeItems || 0, badge: '트리 계층' },
                    { name: 'notes', desc: '문서 및 데이터 행 통합 노트 레코드', count: dbStats?.counts?.notes || 0, badge: '통합 노드' },
                    { name: 'table_rows', desc: '데이터 테이블 개별 행(Row) 및 리치 콘텐츠', count: dbStats?.counts?.tableRows || 0, badge: '행 레코드' },
                    { name: 'table_columns', desc: '테이블 컬럼 정의 및 스키마', count: dbStats?.counts?.tableColumns || 0, badge: '컬럼 스키마' },
                    { name: 'calendar_events', desc: '캘린더 일정 및 타임라인 데이터', count: dbStats?.counts?.calendarEvents || 0, badge: '일정 데이터' },
                    { name: 'row_images', desc: '첨부 이미지 및 BLOB 자산 매핑', count: dbStats?.counts?.rowImages || 0, badge: '이미지 자산' },
                    { name: 'document_history', desc: '문서 이력 및 타임머신 스냅샷', count: dbStats?.counts?.documentHistory || 0, badge: '이력 스냅샷' },
                    { name: 'auth_users', desc: '시스템 사용자 계정 및 권한 데이터', count: dbStats?.counts?.authUsers || 0, badge: '보안 계정' },
                    { name: 'user_groups', desc: '팀 그룹 및 멤버십 권한 데이터', count: dbStats?.counts?.userGroups || 0, badge: '그룹 접근' },
                  ].map((row) => (
                    <button type="button" key={row.name} onClick={() => { setDbTableSearch(''); void loadDbTable(row.name, 0, ''); }} className={`grid w-full grid-cols-[160px_1fr_100px_100px] items-center p-3 text-left hover:bg-amber-50 dark:hover:bg-stone-800/50 cursor-pointer ${selectedDbTable === row.name ? 'bg-amber-50 dark:bg-stone-800' : ''}`}>
                      <span className="font-mono font-bold text-amber-700 dark:text-amber-400">{row.name}</span>
                      <span className="text-stone-600 dark:text-stone-300">{row.desc}</span>
                      <span className="font-mono font-bold text-stone-900 dark:text-stone-100 text-right pr-4">{row.count.toLocaleString()}건</span>
                      <span className="inline-flex items-center justify-center px-2 py-0.5 rounded-md font-bold text-[10px] bg-stone-200/70 dark:bg-stone-800 text-stone-700 dark:text-stone-300">
                        {row.badge}
                      </span>
                    </button>
                  ))}
                </div>
              </div>
              {selectedDbTable && <section className="fixed inset-5 z-40 m-auto flex max-h-[85vh] w-[min(1100px,calc(100vw-40px))] flex-col overflow-hidden rounded-xl border border-stone-200 bg-white shadow-2xl dark:border-stone-700 dark:bg-stone-900">
                <header className="flex items-center justify-between gap-3 border-b bg-stone-100/70 px-4 py-3 dark:border-stone-700 dark:bg-stone-800/60">
                  <div><h4 className="font-bold">{selectedDbTable} 데이터</h4><p className="text-xs text-stone-500">총 {dbTablePage?.total ?? '…'}건 · 페이지당 50건</p></div>
                  <button type="button" onClick={() => { setSelectedDbTable(''); setDbTablePage(null); }} className={buttonClass}>닫기</button>
                </header>
                <form className="flex gap-2 border-b p-3 dark:border-stone-700" onSubmit={event => { event.preventDefault(); void loadDbTable(selectedDbTable, 0, dbTableSearch); }}><input value={dbTableSearch} onChange={event => setDbTableSearch(event.target.value)} placeholder="전체 컬럼에서 검색" className="min-w-0 flex-1 rounded-lg border border-stone-300 bg-transparent px-3 py-2 text-sm dark:border-stone-700" /><button type="submit" className={buttonClass}>검색</button>{dbTableSearch && <button type="button" className={buttonClass} onClick={() => { setDbTableSearch(''); void loadDbTable(selectedDbTable, 0, ''); }}>초기화</button>}</form>
                {dbTableBusy ? <p className="p-8 text-center text-sm text-stone-500">불러오는 중…</p> : dbTablePage && <>
                  <div className="min-h-0 flex-1 overflow-auto"><table className="min-w-full border-collapse text-xs"><thead className="sticky top-0 bg-stone-100 dark:bg-stone-800"><tr>{dbTablePage.columns.filter(c => c !== '__admin_rowid').map(column => <th key={column} className="whitespace-nowrap border-b px-3 py-2 text-left font-semibold">{column}</th>)}<th className="border-b px-3 py-2">상세</th></tr></thead><tbody>{dbTablePage.rows.map((row, index) => <tr key={index} className="border-b last:border-0 dark:border-stone-800">{dbTablePage.columns.filter(c => c !== '__admin_rowid').map(column => <td key={column} className="max-w-64 whitespace-pre-wrap break-all px-3 py-2 align-top">{typeof row[column] === 'string' ? row[column] as string : JSON.stringify(row[column]) ?? 'null'}</td>)}<td className="px-3 py-2"><button type="button" className="whitespace-nowrap text-amber-700 underline dark:text-amber-300" onClick={() => void loadDbRowDetail(selectedDbTable, dbTablePage.offset + index)}>자세히 보기</button></td></tr>)}</tbody></table>{dbTablePage.rows.length === 0 && <p className="p-6 text-center text-stone-500">레코드가 없습니다.</p>}</div>
                  <footer className="flex items-center justify-between border-t px-4 py-2 dark:border-stone-700"><span className="text-xs text-stone-500">{dbTablePage.total ? dbTablePage.offset + 1 : 0}–{Math.min(dbTablePage.offset + dbTablePage.rows.length, dbTablePage.total)} / {dbTablePage.total}</span><div className="flex gap-2"><button type="button" disabled={dbTablePage.offset <= 0} onClick={() => void loadDbTable(selectedDbTable, Math.max(0, dbTablePage.offset - dbTablePage.limit))} className={buttonClass}>이전</button><button type="button" disabled={dbTablePage.offset + dbTablePage.limit >= dbTablePage.total} onClick={() => void loadDbTable(selectedDbTable, dbTablePage.offset + dbTablePage.limit)} className={buttonClass}>다음</button></div></footer>
                </>}
              </section>}
              {selectedDbTable && <div className="fixed inset-0 z-30 bg-black/45" onClick={() => { setSelectedDbTable(''); setDbTablePage(null); setDbRowDetail(null); }} />}
              {dbRowDetail && <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/55 p-5" onClick={() => setDbRowDetail(null)}><section className="max-h-[85vh] w-full max-w-4xl overflow-auto rounded-2xl bg-white p-5 shadow-2xl dark:bg-stone-900" onClick={event => event.stopPropagation()}><div className="mb-4 flex items-center justify-between"><h3 className="text-lg font-bold">레코드 상세</h3><button type="button" className={buttonClass} onClick={() => setDbRowDetail(null)}>닫기</button></div><div className="space-y-3">{Object.entries(dbRowDetail).map(([key, value]) => <div key={key} className="rounded-lg border p-3 dark:border-stone-700"><b className="mb-2 block text-xs text-stone-500">{key}</b><pre className="max-h-72 overflow-auto whitespace-pre-wrap break-all text-xs">{typeof value === 'string' ? value : JSON.stringify(value, null, 2) ?? 'null'}</pre></div>)}</div></section></div>}
            </>
          )}
        </main>
        {busy && <div className="absolute inset-0 z-30 flex items-center justify-center bg-stone-950/35 backdrop-blur-[2px]" role="status" aria-live="polite">
          <div className="flex min-w-52 flex-col items-center gap-3 rounded-2xl border border-stone-200 bg-white/95 px-7 py-6 text-stone-800 shadow-2xl dark:border-stone-700 dark:bg-stone-900/95 dark:text-stone-100">
            <Loader2 size={30} className="animate-spin text-amber-500" />
            <span className="text-sm font-semibold">관리자 데이터를 불러오는 중…</span>
          </div>
        </div>}
        <footer className="flex items-center justify-between border-t px-5 py-3 text-xs text-stone-500 dark:border-stone-700 shrink-0"><span>{user.displayName || user.email} · 마스터 계정</span><span>기본 읽기/쓰기 권한: ON</span></footer>
      </section>
    </div>,
    document.body
  );
};
