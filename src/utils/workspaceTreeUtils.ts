import { WorkspaceData, TreeItem, TableDocument, WonNoteDocument } from '../types';
/**
 * Ensures a WorkspaceData object has a complete, valid tree structure.
 * If tree is missing, empty, or lacks entries for any tables,
 * automatically generates tree nodes for those tables so they appear in the UI.
 */
export function ensureWorkspaceTree(data: Partial<WorkspaceData> | null | undefined): WorkspaceData {
  if (!data) {
    return {
      version: '1.0.0',
      exportedAt: Date.now(),
      settings: {
        theme: 'light',
        zoom: 100,
        useServer: true,
        serverUrl: '/api',
      },
      tree: [],
      tables: {},
      documents: {},
    };
  }

  const version = data.version || '1.0.0';
  const exportedAt = data.exportedAt || Date.now();
  const settings = data.settings || {
    theme: 'light',
    zoom: 100,
    useServer: true,
    serverUrl: '/api',
  };

  // Robustly extract tables whether formatted as Record, Array, or wrapped under data/workspace
  const rawTables =
    (data as any)?.tables ||
    (Array.isArray(data) ? data : null) ||
    (data as any)?.data?.tables ||
    (data as any)?.workspace?.tables ||
    {};

  const tables: Record<string, TableDocument> = {};
  if (Array.isArray(rawTables)) {
    rawTables.forEach((tbl, idx) => {
      if (tbl && typeof tbl === 'object') {
        const id = tbl.id || `table-${idx + 1}`;
        tables[id] = { ...tbl, id };
      }
    });
  } else if (typeof rawTables === 'object' && rawTables !== null) {
    Object.entries(rawTables).forEach(([key, tbl]: [string, any]) => {
      if (tbl && typeof tbl === 'object') {
        const id = tbl.id || key;
        tables[id] = { ...tbl, id };
      }
    });
  }

  const documents = { ...((data as any)?.documents || {}) };

  // Robustly extract tree
  const rawTree =
    (data as any)?.tree ||
    (data as any)?.data?.tree ||
    (data as any)?.workspace?.tree ||
    [];
  let tree: TreeItem[] = Array.isArray(rawTree) ? [...rawTree] : [];
  // 유효한 모든 폴더 ID 집합 구성 (고립된 parentId 검증용)
const validFolderIds = new Set<string>(
  tree.filter((item) => item.type === 'folder').map((item) => item.id)
);

  // Set of IDs already in tree (including hyphen/underscore variants)
  const existingIdsInTree = new Set<string>();
  tree = tree.map((item) => {
      existingIdsInTree.add(item.id);
      existingIdsInTree.add(item.id.replace(/-/g, '_'));
      existingIdsInTree.add(item.id.replace(/_/g, '-'));

      // 자기 자신이 부모이거나, parentId 폴더가 실제로 존재하지 않으면 루트(null)로 끌어올림
      if (item.parentId && (item.parentId === item.id || !validFolderIds.has(item.parentId))) {
        console.warn(`[Tree Repair] 고립되거나 꼬인 노드(${item.title || item.id})의 parentId를 루트(null)로 자동 복구합니다.`);
        return {
          ...item,
          parentId: null,
          updatedAt: Date.now(),
        };
      }
      return item;
    });

  // Undo the prior invalid defaultView value without changing the table's columns or rows.
  Object.entries(tables).forEach(([tableId, table]) => {
    if (!table || (table.defaultView as string) !== 'won-note') return;
    const item = tree.find((entry) => entry.id === tableId || entry.id.replace(/_/g, '-') === tableId.replace(/_/g, '-'));
    const title = item?.title || table.title || '';
    const view = item?.icon === 'sticky-note' || title.includes('📌') || title.includes('메모') || title.includes('스티커')
      ? 'memo'
      : item?.icon === 'calendar' || title.includes('📅') || title.includes('캘린더') || title.includes('일정')
        ? 'calendar'
        : item?.icon === 'kanban' || title.includes('📋') || title.includes('칸반') || title.includes('TO-DO')
          ? 'cards'
          : 'grid';
    tables[tableId] = { ...table, defaultView: view };
  });

  // Notes have titles in both the document payload (tab/header) and tree node
  // (workspace sidebar). Reconcile them by update time so every entry point
  // displays one title after imports, cached loads, and server synchronization.
  Object.entries(documents).forEach(([documentId, rawDocument]) => {
    const document = rawDocument as WonNoteDocument;
    const treeIndex = tree.findIndex(item => item.type === 'document' && (
      item.id === documentId || item.id.replace(/_/g, '-') === documentId.replace(/_/g, '-')
    ));
    if (treeIndex < 0) return;
    const item = tree[treeIndex];
    const documentTitle = (document.title || '').trim();
    const treeTitle = (item.title || '').trim();
    if (documentTitle === treeTitle) return;

    const documentUpdatedAt = document.updatedAt || 0;
    const treeUpdatedAt = item.updatedAt || 0;
    const title = treeUpdatedAt > documentUpdatedAt ? treeTitle : documentTitle;
    const updatedAt = Math.max(documentUpdatedAt, treeUpdatedAt);
    documents[documentId] = { ...document, title, updatedAt };
    tree[treeIndex] = { ...item, title, updatedAt };
  });

  // 1. Auto-generate tree node for any valid table that is not in the tree
  Object.keys(tables).forEach((tableId) => {
    if (!existingIdsInTree.has(tableId)) {
      const table = tables[tableId];
      if (!table) return;
      const newTreeItem: TreeItem = {
        id: tableId,
        parentId: null,
        title: table.title || '새 데이터 테이블',
        type: 'table',
        isExpanded: false,
        createdAt: table.createdAt || Date.now(),
        updatedAt: table.updatedAt || Date.now(),
      };
      tree.unshift(newTreeItem);
      existingIdsInTree.add(tableId);
      existingIdsInTree.add(tableId.replace(/-/g, '_'));
      existingIdsInTree.add(tableId.replace(/_/g, '-'));
    }
  });

    //  누락된 테이블 노드 생성 시 unshift 대신 push 사용 (순서 붕괴 방지)
  Object.keys(tables).forEach((tableId) => {
    if (!existingIdsInTree.has(tableId)) {
      const table = tables[tableId];
      if (!table) return;
      const newTreeItem: TreeItem = {
        id: tableId,
        parentId: null, // 누락된 경우 항상 안전하게 최상위 루트에 배치
        title: table.title || '새 데이터 테이블',
        type: 'table',
        isExpanded: false,
        createdAt: table.createdAt || Date.now(),
        updatedAt: table.updatedAt || Date.now(),
      };
      tree.push(newTreeItem); // unshift 대신 push로 추가
      existingIdsInTree.add(tableId);
      existingIdsInTree.add(tableId.replace(/-/g, '_'));
      existingIdsInTree.add(tableId.replace(/_/g, '-'));
    }
  });

  // 2. Keep tree item titles and table titles in sync bidirectionally
  tree = tree.map((item) => {
    if (item.type === 'table') {
      const tbl =
        tables[item.id] ||
        Object.values(tables).find(
          (t) => t.id === item.id || t.id.replace(/_/g, '-') === item.id.replace(/_/g, '-')
        );

      if (tbl) {
        const tblTitle = (tbl.title || '').trim();
        const itemTitle = (item.title || '').trim();

        if (tblTitle && itemTitle && tblTitle !== itemTitle) {
          // If tree item was updated more recently or at same timestamp, sync table's title
          if ((item.updatedAt || 0) >= (tbl.updatedAt || 0)) {
            tbl.title = itemTitle;
            tables[tbl.id] = { ...tbl, title: itemTitle };
            if (tables[item.id]) tables[item.id] = { ...tables[item.id], title: itemTitle };
            return item;
          } else {
            // Otherwise, sync tree item title from table
            return { ...item, title: tblTitle };
          }
        } else if (!itemTitle && tblTitle) {
          return { ...item, title: tblTitle };
        } else if (!tblTitle && itemTitle) {
          tbl.title = itemTitle;
          tables[tbl.id] = { ...tbl, title: itemTitle };
          if (tables[item.id]) tables[item.id] = { ...tables[item.id], title: itemTitle };
          return item;
        }
      }
    }
    return item;
  });

  return {
    version,
    exportedAt,
    settings,
    tree,
    tables,
    documents,
  };
}

/**
 * Merges server tree into local tree while preserving local ordering and items
 * that may not have reached the server yet.
 */
export function mergeTrees(localTree: TreeItem[], serverTree: TreeItem[]): TreeItem[] {
  if (!localTree || !Array.isArray(localTree)) return serverTree || [];
  if (!serverTree || !Array.isArray(serverTree)) return localTree;

  const localMap = new Map(localTree.map((item) => [item.id, item]));
  const merged = [...localTree];

  serverTree.forEach((serverItem) => {
    if (!localMap.has(serverItem.id)) {
      merged.push({ ...serverItem });
    } else {
      const idx = merged.findIndex((t) => t.id === serverItem.id);
      if (idx !== -1 && (serverItem.updatedAt || 0) > (merged[idx].updatedAt || 0)) {
        merged[idx] = {
          ...merged[idx],
          title: serverItem.title || merged[idx].title,
          updatedAt: serverItem.updatedAt,
        };
      }
    }
  });

  return merged;
}
