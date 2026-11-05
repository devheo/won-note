import React, { useEffect, useMemo, useState } from 'react';
import { Users, X, Plus, Trash2, Shield, LockKeyhole, Globe2, Save } from 'lucide-react';
import { fetchBridge } from '../../services/httpBridge';
import { API_PATHS } from '../../constants/api';
import { TableDocument } from '../../types';

type GroupMember = { id: string; email: string; display_name: string; role: string };
type UserOption = { id: string; email: string; display_name: string };
type UserGroup = { id: string; name: string; owner_id: string; member_role: string; members: GroupMember[]; users: UserOption[] };
type BoardGroup = { id: string; name: string; permission: 'read' | 'write' };
type BoardInfo = { visibility: 'shared' | 'private' | 'group'; groups: BoardGroup[]; groupOptions: UserGroup[] };

async function requestJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetchBridge(url, { ...init, headers: { 'Content-Type': 'application/json', ...(init?.headers || {}) } });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.error || `요청 실패 (${response.status})`);
  return body as T;
}

interface GroupAccessModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentUserId: string;
  table: TableDocument | null;
  onUpdateTable?: (table: TableDocument) => void;
}

export const GroupAccessModal: React.FC<GroupAccessModalProps> = ({ isOpen, onClose, currentUserId, table, onUpdateTable }) => {
  const [groups, setGroups] = useState<UserGroup[]>([]);
  const [boardInfo, setBoardInfo] = useState<BoardInfo | null>(null);
  const [newGroupName, setNewGroupName] = useState('');
  const [selectedGroupId, setSelectedGroupId] = useState('');
  const [accessMode, setAccessMode] = useState<'shared' | 'private' | 'group'>(table?.visibility || 'shared');
  const [boardGroups, setBoardGroups] = useState<Record<string, 'read' | 'write'>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const refresh = async () => {
    const nextGroups = await requestJson<UserGroup[]>(API_PATHS.groups);
    setGroups(nextGroups);
    setSelectedGroupId(previous => nextGroups.some(group => group.id === previous) ? previous : nextGroups[0]?.id || '');
    if (table) {
      const info = await requestJson<BoardInfo>(API_PATHS.tablePermissionsPattern.replace(':id', encodeURIComponent(table.id)));
      setBoardInfo(info);
      setAccessMode(info.visibility);
      setBoardGroups(Object.fromEntries(info.groups.map(group => [group.id, group.permission])));
    } else {
      setBoardInfo(null);
    }
  };

  useEffect(() => {
    if (!isOpen) return;
    setError(''); setNotice('');
    void refresh().catch(reason => setError(reason instanceof Error ? reason.message : '그룹 정보를 가져오지 못했습니다.'));
  }, [isOpen, table?.id]);

  const selectedGroup = useMemo(() => groups.find(group => group.id === selectedGroupId) || null, [groups, selectedGroupId]);
  const isBoardOwner = Boolean(boardInfo && (table?.ownerId === currentUserId || table?.accessLevel === 'owner' || (table?.visibility === 'shared' && !table.ownerId)));

  const createGroup = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!newGroupName.trim()) return;
    setBusy(true); setError('');
    try {
      await requestJson<UserGroup>(API_PATHS.groups, { method: 'POST', body: JSON.stringify({ name: newGroupName }) });
      setNewGroupName(''); await refresh(); setNotice('그룹을 만들었습니다.');
    } catch (reason) { setError(reason instanceof Error ? reason.message : '그룹 생성에 실패했습니다.'); }
    finally { setBusy(false); }
  };

  const saveMembers = async (memberIds: string[]) => {
    if (!selectedGroup) return;
    setBusy(true); setError('');
    try {
      await requestJson(API_PATHS.groupMembersPattern.replace(':id', encodeURIComponent(selectedGroup.id)), { method: 'PUT', body: JSON.stringify({ memberIds }) });
      await refresh(); setNotice('그룹 구성원을 저장했습니다.');
    } catch (reason) { setError(reason instanceof Error ? reason.message : '구성원 저장에 실패했습니다.'); }
    finally { setBusy(false); }
  };

  const deleteGroup = async () => {
    if (!selectedGroup || selectedGroup.owner_id !== currentUserId || !window.confirm(`“${selectedGroup.name}” 그룹을 삭제할까요?`)) return;
    setBusy(true); setError('');
    try {
      await requestJson(API_PATHS.groupByIdPattern.replace(':id', encodeURIComponent(selectedGroup.id)), { method: 'DELETE' });
      await refresh(); setNotice('그룹을 삭제했습니다.');
    } catch (reason) { setError(reason instanceof Error ? reason.message : '그룹 삭제에 실패했습니다.'); }
    finally { setBusy(false); }
  };

  const saveBoardPermissions = async () => {
    if (!table) return;
    const permissions = Object.entries(boardGroups).map(([groupId, permission]) => ({ groupId, permission }));
    setBusy(true); setError('');
    try {
      await requestJson(API_PATHS.tablePermissionsPattern.replace(':id', encodeURIComponent(table.id)), {
        method: 'PUT', body: JSON.stringify({ visibility: accessMode, groups: permissions }),
      });
      onUpdateTable?.({ ...table, visibility: accessMode, ownerId: accessMode === 'shared' ? undefined : table.ownerId || currentUserId });
      await refresh(); setNotice('보드 접근 권한을 저장했습니다.');
    } catch (reason) { setError(reason instanceof Error ? reason.message : '보드 권한 저장에 실패했습니다.'); }
    finally { setBusy(false); }
  };

  if (!isOpen) return null;
  return <div className="fixed inset-0 z-[110] bg-black/55 backdrop-blur-sm flex items-center justify-center p-3 sm:p-6" onMouseDown={event => { if (event.target === event.currentTarget) onClose(); }}>
    <section className="w-full max-w-5xl max-h-[90vh] flex flex-col overflow-hidden rounded-2xl border border-stone-200 bg-white shadow-2xl dark:border-stone-700 dark:bg-stone-900">
      <header className="flex items-center justify-between border-b border-stone-200 px-5 py-4 dark:border-stone-700">
        <div className="flex items-center gap-3"><span className="rounded-xl bg-indigo-100 p-2 text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300"><Users size={19}/></span><div><h2 className="font-bold">그룹 및 보드 권한</h2><p className="text-xs text-stone-500">팀 구성원과 보드별 읽기·쓰기 권한을 관리합니다.</p></div></div>
        <button onClick={onClose} aria-label="닫기" className="rounded-lg p-2 hover:bg-stone-100 dark:hover:bg-stone-800"><X size={18}/></button>
      </header>
      <div className="grid min-h-0 flex-1 overflow-auto lg:grid-cols-[300px_minmax(0,1fr)]">
        <aside className="border-b border-stone-200 p-4 dark:border-stone-700 lg:border-b-0 lg:border-r">
          <form onSubmit={createGroup} className="mb-4 flex gap-2"><input value={newGroupName} onChange={event => setNewGroupName(event.target.value)} maxLength={80} placeholder="새 팀 그룹 이름" className="min-w-0 flex-1 rounded-lg border border-stone-300 bg-transparent px-3 py-2 text-sm dark:border-stone-700"/><button disabled={busy || !newGroupName.trim()} title="그룹 만들기" className="rounded-lg bg-indigo-600 px-3 text-white disabled:opacity-50"><Plus size={17}/></button></form>
          <div className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-stone-500">내 그룹 ({groups.length})</div>
          <div className="space-y-1">{groups.map(group => <button key={group.id} onClick={() => setSelectedGroupId(group.id)} className={`flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-sm ${selectedGroupId === group.id ? 'bg-indigo-50 text-indigo-900 dark:bg-indigo-950/60 dark:text-indigo-100' : 'hover:bg-stone-100 dark:hover:bg-stone-800'}`}><span className="truncate">{group.name}</span><span className="ml-2 text-[10px] text-stone-500">{group.members.length}명</span></button>)}</div>
          {!groups.length && <div className="rounded-lg border border-dashed p-4 text-center text-xs text-stone-500">그룹을 만들어 팀원을 초대하세요.</div>}
        </aside>
        <main className="min-h-0 overflow-auto p-5">
          {selectedGroup ? <section className="mb-7">
            <div className="mb-3 flex items-center justify-between"><div><h3 className="font-semibold">{selectedGroup.name} 구성원</h3><p className="text-xs text-stone-500">그룹 소유자만 구성원을 추가하거나 제거할 수 있습니다.</p></div>{selectedGroup.owner_id === currentUserId && <button onClick={() => void deleteGroup()} disabled={busy} title="그룹 삭제" className="rounded-lg p-2 text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/30"><Trash2 size={16}/></button>}</div>
            <div className="max-h-48 space-y-1 overflow-auto rounded-xl border border-stone-200 p-2 dark:border-stone-700">{selectedGroup.users.map(user => <label key={user.id} className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm hover:bg-stone-50 dark:hover:bg-stone-800"><input type="checkbox" checked={selectedGroup.members.some(member => member.id === user.id)} disabled={busy || selectedGroup.owner_id !== currentUserId || user.id === selectedGroup.owner_id} onChange={event => { const ids = selectedGroup.members.filter(member => member.id !== selectedGroup.owner_id).map(member => member.id); void saveMembers(event.target.checked ? [...ids, user.id] : ids.filter(id => id !== user.id)); }}/><span className="min-w-0 flex-1 truncate">{user.display_name || user.email}</span><span className="truncate text-xs text-stone-500">{user.email}</span></label>)}</div>
          </section> : <div className="mb-7 rounded-xl border border-dashed p-5 text-sm text-stone-500">왼쪽에서 그룹을 만들거나 선택하면 구성원을 관리할 수 있습니다.</div>}

          {table && <section className="border-t border-stone-200 pt-5 dark:border-stone-700">
            <div className="mb-3 flex items-start justify-between gap-3"><div><h3 className="font-semibold">보드 접근 범위</h3><p className="text-xs text-stone-500">현재 보드: <b>{table.title}</b></p></div><Shield size={17} className="text-amber-600"/></div>
            {isBoardOwner ? <>
              <div className="grid gap-2 sm:grid-cols-3">
                <button onClick={() => setAccessMode('shared')} className={`rounded-xl border p-3 text-left ${accessMode === 'shared' ? 'border-amber-500 bg-amber-50 dark:bg-amber-950/30' : 'border-stone-200 dark:border-stone-700'}`}><Globe2 size={16}/><b className="mt-2 block text-sm">전체 공유</b><span className="text-[11px] text-stone-500">서버 사용자가 읽고 쓸 수 있음</span></button>
                <button onClick={() => setAccessMode('private')} className={`rounded-xl border p-3 text-left ${accessMode === 'private' ? 'border-amber-500 bg-amber-50 dark:bg-amber-950/30' : 'border-stone-200 dark:border-stone-700'}`}><LockKeyhole size={16}/><b className="mt-2 block text-sm">개인</b><span className="text-[11px] text-stone-500">소유자와 마스터만 접근</span></button>
                <button onClick={() => setAccessMode('group')} className={`rounded-xl border p-3 text-left ${accessMode === 'group' ? 'border-amber-500 bg-amber-50 dark:bg-amber-950/30' : 'border-stone-200 dark:border-stone-700'}`}><Users size={16}/><b className="mt-2 block text-sm">그룹 전용</b><span className="text-[11px] text-stone-500">지정한 그룹만 접근</span></button>
              </div>
              {accessMode === 'group' && <div className="mt-4 space-y-2">{groups.map(group => <label key={group.id} className="flex flex-wrap items-center gap-3 rounded-lg border border-stone-200 px-3 py-2 text-sm dark:border-stone-700"><input type="checkbox" checked={Boolean(boardGroups[group.id])} onChange={event => setBoardGroups(previous => { const next = { ...previous }; if (event.target.checked) next[group.id] = 'read'; else delete next[group.id]; return next; })}/><span className="min-w-28 flex-1">{group.name}</span><select disabled={!boardGroups[group.id]} value={boardGroups[group.id] || 'read'} onChange={event => setBoardGroups(previous => ({ ...previous, [group.id]: event.target.value as 'read' | 'write' }))} className="rounded border border-stone-300 bg-transparent px-2 py-1 text-xs dark:border-stone-700"><option value="read">읽기만</option><option value="write">읽기·쓰기</option></select></label>)}{groups.length === 0 && <p className="text-xs text-stone-500">그룹을 먼저 만들고 구성원을 추가해 주세요.</p>}</div>}
              <button onClick={() => void saveBoardPermissions()} disabled={busy || (accessMode === 'group' && !Object.keys(boardGroups).length)} className="mt-4 inline-flex items-center gap-2 rounded-lg bg-stone-900 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50 dark:bg-amber-500 dark:text-stone-950"><Save size={15}/>권한 저장</button>
            </> : <p className="rounded-lg bg-stone-50 p-3 text-sm text-stone-600 dark:bg-stone-800 dark:text-stone-300">보드 공개 범위는 보드 소유자만 변경할 수 있습니다. 현재 권한: {table.accessLevel === 'write' ? '읽기·쓰기' : '읽기 전용'}.</p>}
          </section>}
          {notice && <p className="mt-4 text-sm text-emerald-700 dark:text-emerald-400">{notice}</p>}
          {error && <p className="mt-4 rounded-lg bg-rose-50 p-3 text-sm text-rose-700 dark:bg-rose-950/30 dark:text-rose-300">{error}</p>}
        </main>
      </div>
    </section>
  </div>;
};
