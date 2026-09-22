import { WorkspaceData } from '../types';

export const INITIAL_WORKSPACE_DATA: WorkspaceData = {
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

