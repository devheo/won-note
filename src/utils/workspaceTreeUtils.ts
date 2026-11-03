import { WorkspaceData, TreeItem, TableDocument } from '../types';
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
  };
}

/**
 * Merges server tree into local tree while preserving user's custom local tree ordering and positions.
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
