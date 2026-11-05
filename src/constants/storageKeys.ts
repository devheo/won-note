export const STORAGE_KEYS = {
  useServer: 'wonbee_use_server',
  serverUrl: 'wonbee_server_url',
  zoomLevel: 'wonbee_zoom_level',
  postmanWorkspaces: 'wonbee_postman_workspaces',
  postmanHistory: 'wonbee_postman_history',
  postmanCorsProxy: 'wonbee_postman_cors_proxy',
  userEnv: 'wonbee_user_env',
  activeDocument: 'wonbee_active_doc_id',
  activeTable: 'wonbee_active_table_id',
  theme: 'wonbee_theme',
  viewMode: 'wonbee_view_mode',
  openTabs: 'wonbee_open_tabs',
  richEditorFullscreen: 'wonbee_rich_editor_fullscreen',
  calendarSoundEnabled: 'wonbee_calendar_sound_enabled',
  calculatorHistory: 'wonbee_calc_history',
  performanceOptions: 'wonbee_performance_options_v2',
} as const;

export const STORAGE_KEY_PREFIXES = {
  viewModeByTable: 'wonbee_view_mode_',
  calendarEventsByTable: 'wonbee_calendar_events_',
  memoLayoutByTable: 'wonbee_memo_board_layout_',
  kanbanTitleColumnByTable: 'wonbee_kanban_title_col_',
  kanbanContentColumnByTable: 'wonbee_kanban_content_col_',
  filterColumnsByTable: 'wonbee_filter_cols_',
} as const;

export const storageKeyFor = (prefix: string, id: string) => `${prefix}${id}`;
