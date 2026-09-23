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
  const tables: Record<string, TableDocument> = { ...(data.tables || {}) };

  let tree: TreeItem[] = Array.isArray(data.tree) ? [...data.tree] : [];

  // Set of IDs already in tree
  const existingIdsInTree = new Set(tree.map((item) => item.id));

  // 1. Auto-generate tree node for any table that is not in the tree
  Object.keys(tables).forEach((tableId) => {
    if (!existingIdsInTree.has(tableId)) {
      const table = tables[tableId];
      const newTreeItem: TreeItem = {
        id: tableId,
        parentId: null,
        title: table.title || '새 데이터 테이블',
        type: 'table',
        isExpanded: false,
        createdAt: table.createdAt || Date.now(),
        updatedAt: table.updatedAt || Date.now(),
      };
      tree.push(newTreeItem);
      existingIdsInTree.add(tableId);
    }
  });

  // 2. Keep tree item titles and table titles in sync bidirectionally
  tree = tree.map((item) => {
    if (item.type === 'table' && tables[item.id]) {
      const tbl = tables[item.id];
      const tblTitle = tbl.title || '';
      const itemTitle = item.title || '';

      if (tblTitle && itemTitle && tblTitle !== itemTitle) {
        // If tree item was updated more recently than the table, sync table's title
        if ((item.updatedAt || 0) > (tbl.updatedAt || 0)) {
          tables[item.id] = { ...tbl, title: itemTitle };
          return item;
        } else {
          // Otherwise, sync tree item title from table
          return { ...item, title: tblTitle };
        }
      } else if (!itemTitle && tblTitle) {
        return { ...item, title: tblTitle };
      } else if (!tblTitle && itemTitle) {
        tables[item.id] = { ...tbl, title: itemTitle };
        return item;
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
