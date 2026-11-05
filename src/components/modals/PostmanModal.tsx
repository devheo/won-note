import React, { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import { STORAGE_KEYS } from '../../constants/storageKeys';
import { createPortal } from 'react-dom';
import {
  X,
  Send,
  Loader2,
  Trash2,
  Copy,
  Check,
  Download,
  Plus,
  Clock,
  Globe,
  Database,
  Key,
  Code2,
  Sliders,
  CheckCircle,
  ShieldCheck,
  AlertCircle,
  FileCode,
  Lock,
  History,
  Play,
  RotateCcw,
  Sparkles,
  ChevronRight,
  Terminal,
  FileJson,
  Layers,
  Server,
  HardDrive,
  Bookmark,
  Folder,
  Save,
  Edit3,
} from 'lucide-react';

interface PostmanModalProps {
  isOpen: boolean;
  onClose: () => void;
}

type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
type RequestTab = 'params' | 'headers' | 'body' | 'auth';
type ResponseTab = 'body' | 'headers' | 'raw_request';
type BodyType = 'none' | 'raw_json' | 'form_data' | 'urlencoded';
type AuthType = 'none' | 'bearer' | 'basic';

interface ParamRow {
  id: string;
  enabled: boolean;
  key: string;
  value: string;
  description: string;
}

interface HistoryItem {
  id: string;
  method: HttpMethod;
  url: string;
  timestamp: number;
  status?: number;
  statusText?: string;
  timeMs?: number;
  sizeBytes?: number;
  paramsList: ParamRow[];
  headersList: ParamRow[];
  bodyType: BodyType;
  bodyJson: string;
  authType: AuthType;
  authToken: string;
  authUsername: string;
  authPassword: string;
  useCorsProxy: boolean;
}

export interface PostmanSavedRequest {
  id: string;
  name: string;
  item: HistoryItem;
}

export interface PostmanCollection {
  id: string;
  name: string;
  requests: PostmanSavedRequest[];
}

export interface PostmanWorkspace {
  id: string;
  name: string;
  collections: PostmanCollection[];
}

const defaultRequest = (id: string, name: string, method: HttpMethod, url: string, body = ''): PostmanSavedRequest => ({
  id,
  name,
  item: {
    id: `item-${id}`, method, url, timestamp: Date.now(), paramsList: [],
    headersList: [{ id: `accept-${id}`, enabled: true, key: 'Accept', value: 'application/json', description: '' }],
    bodyType: body ? 'raw_json' : 'none', bodyJson: body,
    authType: 'none', authToken: '', authUsername: '', authPassword: '', useCorsProxy: false,
  },
});

const DEFAULT_WORKSPACES: PostmanWorkspace[] = [{
  id: 'ws-wonnote', name: 'WonNote 워크스페이스', collections: [
    { id: 'col-auth', name: '인증', requests: [
      defaultRequest('auth-health','서버 상태 확인','GET','/api/health'),
      defaultRequest('auth-me','현재 로그인 사용자','GET','/api/auth/me'),
      defaultRequest('auth-password','이메일 비밀번호 로그인','POST','/api/auth/password-login','{\n  "email": "user@example.com",\n  "password": "<등록한 비밀번호>"\n}'),
      defaultRequest('auth-oidc','OIDC Bearer 토큰 로그인','POST','/api/auth/login','{\n  "token": "<OIDC access token>"\n}'),
      defaultRequest('auth-logout','로그아웃','POST','/api/auth/logout','{}'),
      defaultRequest('admin-users','관리자: 계정 목록','GET','/api/admin/users'),
      defaultRequest('admin-add-user','관리자: 계정 사전 등록','POST','/api/admin/users','{\n  "email": "user@example.com",\n  "displayName": "사용자 이름",\n  "password": "<8자 이상 비밀번호>"\n}'),
      defaultRequest('admin-update-user','관리자: 계정 권한·상태 변경 (ID 교체)','PATCH','/api/admin/users/<user-id>','{\n  "role": "user",\n  "status": "active"\n}'),
      defaultRequest('admin-history','관리자: 로그인 이력','GET','/api/admin/login-history'),
    ]},
    { id: 'col-workspace', name: '워크스페이스·트리·노트', requests: [
      defaultRequest('ws-get','워크스페이스 전체 조회','GET','/api/workspace'),
      defaultRequest('ws-meta','워크스페이스 메타 조회','GET','/api/workspace/meta'),
      defaultRequest('ws-version','워크스페이스 버전 확인','GET','/api/workspace/version'),
      defaultRequest('ws-save','워크스페이스 저장','PUT','/api/workspace','{\n  "tables": {},\n  "tree": [],\n  "documents": {}\n}'),
      defaultRequest('tree-get','트리 조회','GET','/api/tree'),
      defaultRequest('tree-save','트리 저장','PUT','/api/tree','[]'),
      defaultRequest('notes-list','노트 목록 조회','GET','/api/notes?limit=50'),
      defaultRequest('notes-sync','노트 변경분 조회','GET','/api/notes/sync?since=0'),
      defaultRequest('notes-push','노트 변경분 반영','POST','/api/notes/push-sync','{\n  "notes": []\n}'),
      defaultRequest('notes-clean','워크스페이스 정리','POST','/api/workspace/clean','{}'),
      defaultRequest('doc-save','문서 저장 (ID 교체)','PUT','/api/documents/<document-id>','{\n  "id": "<document-id>",\n  "title": "새 제목",\n  "content": "본문"\n}'),
      defaultRequest('doc-delete','문서 삭제 (ID 교체)','DELETE','/api/documents/<document-id>'),
    ]},
    { id: 'col-tables', name: '테이블·일정·에셋', requests: [
      defaultRequest('table-get','테이블 조회 (ID 교체)','GET','/api/tables/<table-id>'),
      defaultRequest('table-save','테이블 저장 (ID 교체)','PUT','/api/tables/<table-id>','{\n  "id": "<table-id>",\n  "title": "테이블 이름",\n  "columns": [],\n  "rows": []\n}'),
      defaultRequest('table-rename','테이블 이름 변경 (ID 교체)','PUT','/api/tables/<table-id>/rename','{\n  "title": "새 테이블 이름"\n}'),
      defaultRequest('table-delete','테이블 삭제 (ID 교체)','DELETE','/api/tables/<table-id>'),
      defaultRequest('events-get','일정 목록 조회','GET','/api/events'),
      defaultRequest('events-create','일정 생성','POST','/api/events','{\n  "title": "예시 일정",\n  "startDate": "2026-11-05",\n  "endDate": "2026-11-05"\n}'),
      defaultRequest('events-delete','일정 삭제 (ID 교체)','DELETE','/api/events/<event-id>'),
      defaultRequest('asset-get','이미지 에셋 조회 (ID 교체)','GET','/api/assets/<asset-id>'),
      defaultRequest('asset-save','이미지 에셋 저장','POST','/api/assets','{\n  "id": "example-image",\n  "mimeType": "image/png",\n  "data": "<base64>"\n}'),
      defaultRequest('images-get','행 이미지 조회 (ID 교체)','GET','/api/images/<image-id>'),
      defaultRequest('network-info','서버 네트워크 정보','GET','/api/network/info'),
    ]},
    { id: 'col-ai', name: '검색·AI·가져오기', requests: [
      defaultRequest('rag-index','문서 검색 인덱스 갱신','POST','/api/rag/index','{}'),
      defaultRequest('rag-search','문서 검색','POST','/api/rag/search','{\n  "query": "검색어",\n  "limit": 5\n}'),
      defaultRequest('ollama-status','Ollama 상태 확인','GET','/api/ollama/status'),
      defaultRequest('ollama-config-get','Ollama 설정 조회','GET','/api/ollama/config'),
      defaultRequest('ollama-config-set','Ollama 설정 변경','POST','/api/ollama/config','{\n  "host": "http://localhost:11434",\n  "model": "<model-name>"\n}'),
      defaultRequest('ollama-generate','Ollama 응답 생성','POST','/api/ollama/generate','{\n  "prompt": "안녕하세요",\n  "systemPrompt": "간결하게 답변하세요"\n}'),
      defaultRequest('action-execute','AI 액션 실행','POST','/api/action/execute','{\n  "action": "<action>",\n  "payload": {}\n}'),
      defaultRequest('exchange-items','교환 파일 가져오기 (바이너리 요청)','POST','/api/exchange/items'),
      defaultRequest('exchange-list','가져오기 가능한 항목 목록','GET','/api/exchange/items'),
      defaultRequest('exchange-export','교환 파일 내보내기 (ID 교체)','GET','/api/exchange/items/<item-id>'),
      defaultRequest('exchange-import-folder','교환 폴더 가져오기 (바이너리 요청)','POST','/api/exchange/items/folders'),
      defaultRequest('api-proxy','CORS 프록시 예시','GET','/api/proxy?url=https%3A%2F%2Fexample.com%2Fapi'),
      defaultRequest('database-reload','디스크 DB 다시 불러오기','POST','/api/database/reload','{}'),
      defaultRequest('ppt-convert','PPT 변환 (바이너리 요청)','POST','/api/convert/ppt'),
    ]},
  ],
}];

const DEFAULT_MOCK_URL = 'https://xxx.xxxxxx.com';

const METHOD_COLORS: Record<HttpMethod, { bg: string; text: string; border: string }> = {
  GET: {
    bg: 'bg-emerald-500/15',
    text: 'text-emerald-700 dark:text-emerald-400',
    border: 'border-emerald-500/30',
  },
  POST: {
    bg: 'bg-amber-500/15',
    text: 'text-amber-700 dark:text-amber-400',
    border: 'border-amber-500/30',
  },
  PUT: {
    bg: 'bg-blue-500/15',
    text: 'text-blue-700 dark:text-blue-400',
    border: 'border-blue-500/30',
  },
  PATCH: {
    bg: 'bg-purple-500/15',
    text: 'text-purple-700 dark:text-purple-400',
    border: 'border-purple-500/30',
  },
  DELETE: {
    bg: 'bg-rose-500/15',
    text: 'text-rose-700 dark:text-rose-400',
    border: 'border-rose-500/30',
  },
};

export const PostmanModal: React.FC<PostmanModalProps> = ({ isOpen, onClose }) => {
  const [method, setMethod] = useState<HttpMethod>('GET');
  const [url, setUrl] = useState<string>(DEFAULT_MOCK_URL);
  const [activeReqTab, setActiveReqTab] = useState<RequestTab>('params');
  const [activeResTab, setActiveResTab] = useState<ResponseTab>('body');

  // Sidebar Tab ('history' | 'workspaces')
  const [sidebarTab, setSidebarTab] = useState<'history' | 'workspaces'>('workspaces');

  // Workspaces & Collections State
  const [workspaces, setWorkspaces] = useState<PostmanWorkspace[]>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEYS.postmanWorkspaces);
      if (saved) {
        const parsed = JSON.parse(saved) as PostmanWorkspace[];
        const seeded = DEFAULT_WORKSPACES[0];
        const existing = parsed.find(ws => ws.id === seeded.id || ws.name === seeded.name);
        if (!existing) return [seeded, ...parsed];
        const collections = seeded.collections.map(seedCollection => {
          const oldCollection = existing.collections.find(collection => collection.id === seedCollection.id || collection.name === seedCollection.name);
          if (!oldCollection) return seedCollection;
          const knownIds = new Set(oldCollection.requests.map(request => request.id));
          return { ...oldCollection, requests: [...oldCollection.requests, ...seedCollection.requests.filter(request => !knownIds.has(request.id))] };
        });
        const mergedCollections = existing.collections.map(old => collections.find(seed => seed.id === old.id) || old);
        for (const seed of collections) if (!mergedCollections.some(old => old.id === seed.id)) mergedCollections.push(seed);
        return parsed.map(ws => ws === existing ? { ...ws, collections: mergedCollections } : ws);
      }
    } catch {}
    return DEFAULT_WORKSPACES;
  });
  const [activeWorkspaceId, setActiveWorkspaceId] = useState<string>('ws-wonnote');
  useEffect(() => {
    try { localStorage.setItem(STORAGE_KEYS.postmanWorkspaces, JSON.stringify(workspaces)); } catch { /* storage may be unavailable */ }
  }, [workspaces]);

  // Save Request Modal Dialog State
  const [isSaveModalOpen, setIsSaveModalOpen] = useState<boolean>(false);
  const [saveReqName, setSaveReqName] = useState<string>('');
  const [saveTargetColId, setSaveTargetColId] = useState<string>('');
  const [newColNameInput, setNewColNameInput] = useState<string>('');
  const [newWsNameInput, setNewWsNameInput] = useState<string>('');

  // Headers Mode State ('keyvalue' | 'raw')
  const [headerMode, setHeaderMode] = useState<'keyvalue' | 'raw'>('keyvalue');
  const [rawHeadersText, setRawHeadersText] = useState<string>('');

  const [useCorsProxy, setUseCorsProxy] = useState<boolean>(() => {
    return localStorage.getItem(STORAGE_KEYS.postmanCorsProxy) === 'true';
  });

  const [useServerMode, setUseServerMode] = useState<boolean>(() => {
    return localStorage.getItem(STORAGE_KEYS.useServer) === 'true';
  });

  const saveWorkspacesToStorage = (updated: PostmanWorkspace[]) => {
    setWorkspaces(updated);
    localStorage.setItem(STORAGE_KEYS.postmanWorkspaces, JSON.stringify(updated));
  };

  const handleSwitchHeaderMode = (mode: 'keyvalue' | 'raw') => {
    setHeaderMode(mode);
    if (mode === 'raw') {
      const rawText = headersList
        .filter((h) => h.enabled && h.key.trim())
        .map((h) => `${h.key.trim()}: ${h.value}`)
        .join('\n');
      setRawHeadersText(rawText);
    } else {
      parseHeadersFromRawText(rawHeadersText);
    }
  };

  const parseHeadersFromRawText = (text: string) => {
    const lines = text.split('\n');
    const parsedRows: ParamRow[] = [];
    lines.forEach((line, idx) => {
      const colonIdx = line.indexOf(':');
      if (colonIdx !== -1) {
        const k = line.substring(0, colonIdx).trim();
        const v = line.substring(colonIdx + 1).trim();
        if (k) {
          parsedRows.push({
            id: `h-raw-${idx}-${Date.now()}`,
            enabled: true,
            key: k,
            value: v,
            description: 'Raw 에디터 입력',
          });
        }
      }
    });
    setHeadersList(parsedRows.length > 0 ? parsedRows : [{ id: 'h-1', enabled: true, key: '', value: '', description: '' }]);
  };

  const handleCreateWorkspace = () => {
    if (!newWsNameInput.trim()) return;
    const newWs: PostmanWorkspace = {
      id: `ws-${Date.now()}`,
      name: newWsNameInput.trim(),
      collections: [],
    };
    const next = [...workspaces, newWs];
    saveWorkspacesToStorage(next);
    setActiveWorkspaceId(newWs.id);
    setNewWsNameInput('');
    showToast(`✓ 새 워크스페이스가 생성되었습니다: [${newWs.name}]`);
  };

  const handleCreateCollection = () => {
    if (!newColNameInput.trim()) return;
    const newCol: PostmanCollection = {
      id: `col-${Date.now()}`,
      name: newColNameInput.trim(),
      requests: [],
    };
    const next = workspaces.map((ws) => {
      if (ws.id === activeWorkspaceId) {
        return { ...ws, collections: [...ws.collections, newCol] };
      }
      return ws;
    });
    saveWorkspacesToStorage(next);
    setSaveTargetColId(newCol.id);
    setNewColNameInput('');
    showToast(`✓ 새 컬렉션이 생성되었습니다: [${newCol.name}]`);
  };

  const handleSaveCurrentRequestToCollection = () => {
    if (!saveReqName.trim()) {
      showToast('⚠ 저장할 요청 이름을 입력하세요.');
      return;
    }
    if (!saveTargetColId) {
      showToast('⚠ 요청을 저장할 컬렉션을 선택하세요.');
      return;
    }

    const currentReqItem: HistoryItem = {
      id: `req-item-${Date.now()}`,
      method,
      url,
      timestamp: Date.now(),
      paramsList,
      headersList,
      bodyType,
      bodyJson,
      authType,
      authToken,
      authUsername,
      authPassword,
      useCorsProxy,
    };

    const savedReq: PostmanSavedRequest = {
      id: `saved-req-${Date.now()}`,
      name: saveReqName.trim(),
      item: currentReqItem,
    };

    const next = workspaces.map((ws) => {
      if (ws.id === activeWorkspaceId) {
        return {
          ...ws,
          collections: ws.collections.map((col) => {
            if (col.id === saveTargetColId) {
              return { ...col, requests: [...col.requests, savedReq] };
            }
            return col;
          }),
        };
      }
      return ws;
    });

    saveWorkspacesToStorage(next);
    setIsSaveModalOpen(false);
    setSaveReqName('');
    showToast(`✓ 컬렉션에 성공적으로 저장되었습니다: [${savedReq.name}]`);
  };

  const handleDeleteSavedRequest = (colId: string, reqId: string) => {
    const next = workspaces.map((ws) => {
      if (ws.id === activeWorkspaceId) {
        return {
          ...ws,
          collections: ws.collections.map((col) => {
            if (col.id === colId) {
              return { ...col, requests: col.requests.filter((r) => r.id !== reqId) };
            }
            return col;
          }),
        };
      }
      return ws;
    });
    saveWorkspacesToStorage(next);
    showToast('✓ 저장된 요청이 삭제되었습니다.');
  };

  const handleDeleteCollection = (colId: string) => {
    const next = workspaces.map((ws) => {
      if (ws.id === activeWorkspaceId) {
        return {
          ...ws,
          collections: ws.collections.filter((col) => col.id !== colId),
        };
      }
      return ws;
    });
    saveWorkspacesToStorage(next);
    showToast('✓ 컬렉션이 삭제되었습니다.');
  };

  const handleToggleCorsProxy = (val: boolean) => {
    setUseCorsProxy(val);
    localStorage.setItem(STORAGE_KEYS.postmanCorsProxy, String(val));
    showToast(val ? '✓ CORS Proxy가 활성화되었습니다.' : 'CORS Proxy가 비활성화되었습니다.');
  };

  const handleToggleServerMode = (val: boolean) => {
    setUseServerMode(val);
    localStorage.setItem(STORAGE_KEYS.useServer, String(val));
    showToast(val ? '✓ Server 모드 (REST API 백엔드)로 설정되었습니다.' : 'Client 모드 (Serverless IndexedDB)로 설정되었습니다.');
  };

  // Query Params state
  const [paramsList, setParamsList] = useState<ParamRow[]>([
    { id: 'p-1', enabled: true, key: '', value: '', description: '' },
  ]);

  // Headers state
  const [headersList, setHeadersList] = useState<ParamRow[]>([
    { id: 'h-1', enabled: true, key: 'Content-Type', value: 'application/json', description: '요청 본문 포맷' },
    { id: 'h-2', enabled: true, key: 'Accept', value: '*/*', description: '수신 응답 포맷' },
  ]);

  // Body state
  const [bodyType, setBodyType] = useState<BodyType>('none');
  const [bodyJson, setBodyJson] = useState<string>(
    '{\n  "title": "WonBee Note API Client Task",\n  "completed": false\n}'
  );

  // Auth state
  const [authType, setAuthType] = useState<AuthType>('none');
  const [authToken, setAuthToken] = useState<string>('');
  const [authUsername, setAuthUsername] = useState<string>('');
  const [authPassword, setAuthPassword] = useState<string>('');

  // History & Sidebar state
  const [historyList, setHistoryList] = useState<HistoryItem[]>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEYS.postmanHistory);
      if (saved) return JSON.parse(saved);
    } catch {}
    return [];
  });
  const [isSidebarOpen, setIsSidebarOpen] = useState<boolean>(true);

  // Loading & In-flight request cancellation
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const abortControllerRef = useRef<AbortController | null>(null);

  // Response state
  const [resStatus, setResStatus] = useState<number | null>(null);
  const [resStatusText, setResStatusText] = useState<string>('');
  const [resTimeMs, setResTimeMs] = useState<number | null>(null);
  const [resSizeBytes, setResSizeBytes] = useState<number | null>(null);
  const [resBodyText, setResBodyText] = useState<string>('');
  const [resRawRequestText, setResRawRequestText] = useState<string>('');
  const [resHeaders, setResHeaders] = useState<Record<string, string>>({});
  const [resIsError, setResIsError] = useState<boolean>(false);

  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 2500);
  };

  // Sync Query Params into URL
  const updateUrlFromParams = useCallback((newParams: ParamRow[]) => {
    try {
      const baseUrl = url.split('?')[0];
      const activeParams = newParams.filter((p) => p.enabled && p.key.trim() !== '');
      if (activeParams.length === 0) {
        setUrl(baseUrl);
        return;
      }
      const searchParams = new URLSearchParams();
      activeParams.forEach((p) => searchParams.append(p.key.trim(), p.value));
      setUrl(`${baseUrl}?${searchParams.toString()}`);
    } catch (_) {}
  }, [url]);

  // Sync URL query string into Query Params table
  const parseParamsFromUrl = (newUrl: string) => {
    setUrl(newUrl);
    try {
      const qIdx = newUrl.indexOf('?');
      if (qIdx === -1) return;
      const queryString = newUrl.substring(qIdx + 1);
      const searchParams = new URLSearchParams(queryString);
      const parsed: ParamRow[] = [];
      let i = 1;
      searchParams.forEach((val, key) => {
        parsed.push({
          id: `p-parsed-${i++}`,
          enabled: true,
          key,
          value: val,
          description: '',
        });
      });
      if (parsed.length > 0) {
        setParamsList([...parsed, { id: `p-new-${Date.now()}`, enabled: true, key: '', value: '', description: '' }]);
      }
    } catch (_) {}
  };

  const handleParamChange = (id: string, field: keyof ParamRow, val: any) => {
    setParamsList((prev) => {
      const next = prev.map((p) => (p.id === id ? { ...p, [field]: val } : p));
      updateUrlFromParams(next);
      return next;
    });
  };

  const handleAddParamRow = () => {
    setParamsList((prev) => [
      ...prev,
      { id: `p-${Date.now().toString(36)}`, enabled: true, key: '', value: '', description: '' },
    ]);
  };

  const handleDeleteParamRow = (id: string) => {
    setParamsList((prev) => {
      const next = prev.filter((p) => p.id !== id);
      updateUrlFromParams(next);
      return next.length > 0 ? next : [{ id: 'p-1', enabled: true, key: '', value: '', description: '' }];
    });
  };

  const handleHeaderChange = (id: string, field: keyof ParamRow, val: any) => {
    setHeadersList((prev) => prev.map((h) => (h.id === id ? { ...h, [field]: val } : h)));
  };

  const handleAddHeaderRow = () => {
    setHeadersList((prev) => [
      ...prev,
      { id: `h-${Date.now().toString(36)}`, enabled: true, key: '', value: '', description: '' },
    ]);
  };

  const handleDeleteHeaderRow = (id: string) => {
    setHeadersList((prev) => {
      const next = prev.filter((h) => h.id !== id);
      return next.length > 0 ? next : [{ id: 'h-1', enabled: true, key: '', value: '', description: '' }];
    });
  };

  const handlePrettifyJsonBody = () => {
    try {
      const parsed = JSON.parse(bodyJson);
      setBodyJson(JSON.stringify(parsed, null, 2));
      showToast('✓ JSON 포맷팅 정렬이 완료되었습니다.');
    } catch {
      showToast('⚠ 유효한 JSON 포맷이 아닙니다.');
    }
  };

  // Execute API Request via window.fetch
  const handleSendRequest = async () => {
    if (!url.trim()) {
      showToast('⚠ 요청 URL을 입력해주세요.');
      return;
    }

    setIsLoading(true);
    setResIsError(false);
    setResStatus(null);
    setResStatusText('');
    setResTimeMs(null);
    setResSizeBytes(null);
    setResBodyText('');
    setResHeaders({});
    setResRawRequestText('');

    const controller = new AbortController();
    abortControllerRef.current = controller;

    const startTime = performance.now();

    try {
      // Build Headers
      const reqHeaders: Record<string, string> = {};
      headersList.forEach((h) => {
        if (h.enabled && h.key.trim()) {
          reqHeaders[h.key.trim()] = h.value;
        }
      });

      // Apply Auth
      if (authType === 'bearer' && authToken.trim()) {
        reqHeaders['Authorization'] = `Bearer ${authToken.trim()}`;
      } else if (authType === 'basic' && (authUsername || authPassword)) {
        const credentials = btoa(`${authUsername}:${authPassword}`);
        reqHeaders['Authorization'] = `Basic ${credentials}`;
      }

      // Build Body
      let reqBody: any = undefined;
      if (method !== 'GET') {
        if (bodyType === 'raw_json') {
          reqBody = bodyJson;
          if (!reqHeaders['Content-Type']) {
            reqHeaders['Content-Type'] = 'application/json';
          }
        }
      }

      let finalFetchUrl = url;
      if (useCorsProxy) {
        const isFileProtocol = typeof window !== 'undefined' && window.location.protocol.startsWith('file:');
        if (isFileProtocol) {
          finalFetchUrl = `https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`;
        } else {
          finalFetchUrl = `/api/proxy?url=${encodeURIComponent(url)}`;
        }
      }

      // Construct Raw Sent Request HTTP string
      let rawReqText = `${method} ${url} HTTP/1.1\n`;
      Object.entries(reqHeaders).forEach(([k, v]) => {
        rawReqText += `${k}: ${v}\n`;
      });
      if (reqBody) {
        rawReqText += `\n${typeof reqBody === 'string' ? reqBody : JSON.stringify(reqBody, null, 2)}`;
      }
      setResRawRequestText(rawReqText);

      const response = await fetch(finalFetchUrl, {
        method,
        headers: reqHeaders,
        body: reqBody,
        signal: controller.signal,
      });

      const endTime = performance.now();
      const durationMs = Math.round(endTime - startTime);

      setResStatus(response.status);
      setResStatusText(response.statusText || (response.ok ? 'OK' : 'Error'));
      setResTimeMs(durationMs);

      // Parse Response Headers
      const respHeadersMap: Record<string, string> = {};
      response.headers.forEach((val, key) => {
        respHeadersMap[key] = val;
      });
      setResHeaders(respHeadersMap);

      // Read Response Body Text
      const text = await response.text();
      setResSizeBytes(new Blob([text]).size);

      // Pretty Format Response JSON if applicable
      try {
        const jsonObj = JSON.parse(text);
        setResBodyText(JSON.stringify(jsonObj, null, 2));
      } catch {
        setResBodyText(text);
      }

      setResIsError(!response.ok);

      // Save to History
      const newHistoryItem: HistoryItem = {
        id: `hist-${Date.now()}`,
        method,
        url,
        timestamp: Date.now(),
        status: response.status,
        statusText: response.statusText,
        timeMs: durationMs,
        sizeBytes: new Blob([text]).size,
        paramsList,
        headersList,
        bodyType,
        bodyJson,
        authType,
        authToken,
        authUsername,
        authPassword,
        useCorsProxy,
      };

      setHistoryList((prev) => {
        const next = [newHistoryItem, ...prev.filter((h) => h.url !== url || h.method !== method)].slice(0, 30);
        localStorage.setItem(STORAGE_KEYS.postmanHistory, JSON.stringify(next));
        return next;
      });
    } catch (err: any) {
      const endTime = performance.now();
      setResTimeMs(Math.round(endTime - startTime));

      if (err.name === 'AbortError') {
        showToast('🛑 요청이 취소되었습니다.');
        setResBodyText('요청이 사용자에 의해 중단되었습니다 (Aborted).');
      } else {
        setResIsError(true);
        setResStatus(0);
        setResStatusText('CORS / Network Error');
        const isCorsSuspect = err.message?.includes('Failed to fetch') || err.name === 'TypeError' || err.message?.includes('NetworkError');
        if (isCorsSuspect) {
          setResBodyText(`CORS 정책으로 인해 요청이 차단되었습니다. 서버의 CORS 설정을 확인하거나 프록시 옵션을 켜주세요.\n\n상세 오류: ${err.message}`);
          showToast('⚠ CORS 정책으로 차단됨. CORS Proxy 옵션을 켜보세요.');
        } else {
          setResBodyText(`오류 발생: ${err.message || '네트워크 연결 또는 CORS 정책을 확인하세요.'}`);
        }
      }
    } finally {
      setIsLoading(false);
      abortControllerRef.current = null;
    }
  };

  const handleCancelRequest = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
  };

  const handleRestoreHistory = (item: HistoryItem) => {
    setMethod(item.method);
    setUrl(item.url);
    if (item.paramsList) setParamsList(item.paramsList);
    if (item.headersList) setHeadersList(item.headersList);
    if (item.bodyType) setBodyType(item.bodyType);
    if (item.bodyJson !== undefined) setBodyJson(item.bodyJson);
    if (item.authType) setAuthType(item.authType);
    if (item.authToken !== undefined) setAuthToken(item.authToken);
    if (item.authUsername !== undefined) setAuthUsername(item.authUsername);
    if (item.authPassword !== undefined) setAuthPassword(item.authPassword);
    if (item.useCorsProxy !== undefined) {
      setUseCorsProxy(item.useCorsProxy);
      localStorage.setItem(STORAGE_KEYS.postmanCorsProxy, String(item.useCorsProxy));
    }
    showToast(`🔄 히스토리 (${item.method} ${item.url}) 정보가 복원되었습니다.`);
  };

  const handleClearHistory = () => {
    setHistoryList([]);
    localStorage.removeItem(STORAGE_KEYS.postmanHistory);
    showToast('✓ 히스토리 기록이 모두 삭제되었습니다.');
  };

  const copyToClipboard = async (text: string, successMsg: string) => {
    if (!text) return;
    try {
      if (navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
        await navigator.clipboard.writeText(text);
        showToast(successMsg);
        return;
      }
    } catch (err) {
      console.warn('navigator.clipboard failed, falling back to execCommand:', err);
    }

    try {
      const textarea = document.createElement('textarea');
      textarea.value = text;
      textarea.style.position = 'fixed';
      textarea.style.opacity = '0';
      document.body.appendChild(textarea);
      textarea.focus();
      textarea.select();
      const successful = document.execCommand('copy');
      document.body.removeChild(textarea);
      if (successful) {
        showToast(successMsg);
      } else {
        showToast('⚠ 클립보드 복사에 실패했습니다.');
      }
    } catch (fallbackErr) {
      console.error('Fallback clipboard copy error:', fallbackErr);
      showToast('⚠ 클립보드 복사 권한이 제한되어 있습니다.');
    }
  };

  const handleCopyResponseBody = () => {
    if (activeResTab === 'raw_request') {
      copyToClipboard(resRawRequestText, '✓ 전송된 Raw Request가 클립보드에 복사되었습니다.');
    } else if (activeResTab === 'headers') {
      const headersText = Object.entries(resHeaders)
        .map(([k, v]) => `${k}: ${v}`)
        .join('\n');
      copyToClipboard(headersText, '✓ Response Header 정보가 클립보드에 복사되었습니다.');
    } else {
      copyToClipboard(resBodyText, '✓ 응답 본문이 클립보드에 복사되었습니다.');
    }
  };

  const handleDownloadResponse = () => {
    if (!resBodyText) return;
    const blob = new Blob([resBodyText], { type: 'text/plain;charset=utf-8' });
    const blobUrl = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = blobUrl;
    link.download = `response_${Date.now()}.json`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(blobUrl);
    showToast('✓ 응답 결과 파일 다운로드 완료.');
  };

  if (!isOpen) return null;

  return createPortal(
    <div
      id="postman-modal-backdrop"
      className="fixed inset-0 z-[999999] flex items-center justify-center p-3 sm:p-5 bg-stone-950/60 backdrop-blur-xs animate-in fade-in duration-150"
      onClick={onClose}
    >
      <div
        id="postman-modal-container"
        className="bg-white dark:bg-[#1c1c1c] rounded-2xl shadow-2xl border border-stone-200 dark:border-stone-800 w-full max-w-7xl h-[92vh] max-h-[96vh] flex flex-col overflow-hidden text-stone-900 dark:text-stone-100 animate-in zoom-in-95 duration-150 relative"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Floating Toast Notification */}
        {toastMessage && (
          <div className="absolute top-16 left-1/2 -translate-x-1/2 z-50 bg-stone-900/90 dark:bg-stone-100 text-white dark:text-stone-900 px-4 py-2 rounded-xl text-xs font-semibold shadow-xl flex items-center gap-2 backdrop-blur-sm animate-in fade-in zoom-in-95 pointer-events-none">
            <Check className="w-4 h-4 text-emerald-400 dark:text-emerald-600" />
            <span>{toastMessage}</span>
          </div>
        )}

        {/* Modal Header */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-stone-200 dark:border-stone-800 bg-stone-50/80 dark:bg-[#222222]/80 shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-amber-500/15 text-amber-600 dark:text-amber-400 flex items-center justify-center">
              <Terminal className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-stone-900 dark:text-stone-100 flex items-center gap-2">
                API Test 클라이언트
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-amber-100 dark:bg-amber-950 text-amber-800 dark:text-amber-300 font-mono font-medium">
                </span>
              </h2>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => {
                setSaveReqName('');
                const activeWs = workspaces.find((w) => w.id === activeWorkspaceId) || workspaces[0];
                if (activeWs && activeWs.collections.length > 0) {
                  setSaveTargetColId(activeWs.collections[0].id);
                }
                setIsSaveModalOpen(true);
              }}
              className="px-2.5 py-1.5 rounded-xl border border-amber-300 dark:border-amber-700 bg-amber-500/10 hover:bg-amber-500/20 text-amber-900 dark:text-amber-300 text-xs font-bold flex items-center gap-1.5 transition-colors cursor-pointer shadow-2xs"
            >
              <Save className="w-3.5 h-3.5 text-amber-500" />
              <span>컬렉션에 저장</span>
            </button>

            <button
              type="button"
              onClick={() => setIsSidebarOpen(!isSidebarOpen)}
              className="px-2.5 py-1.5 rounded-xl border border-stone-200 dark:border-stone-700 bg-white dark:bg-stone-800 text-stone-600 dark:text-stone-300 text-xs font-semibold flex items-center gap-1.5 hover:bg-stone-100 dark:hover:bg-stone-700 transition-colors"
            >
              <Layers className="w-3.5 h-3.5 text-amber-500" />
              <span>사이드바 패널</span>
            </button>

            <button
              type="button"
              onClick={onClose}
              className="p-1.5 rounded-lg text-stone-400 hover:text-stone-700 dark:hover:text-stone-200 hover:bg-stone-100 dark:hover:bg-stone-800 transition-colors cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Body Split View: History & Workspaces Sidebar + Main Client */}
        <div className="flex-1 flex overflow-hidden">
          {/* Sidebar Panel (Workspaces & Collections vs History) */}
          {isSidebarOpen && (
            <div className="w-72 border-r border-stone-200 dark:border-stone-800 bg-stone-50/50 dark:bg-[#181818] flex flex-col shrink-0 overflow-hidden">
              {/* Sidebar Header Tabs */}
              <div className="px-2 py-1.5 bg-stone-100/80 dark:bg-[#222222] border-b border-stone-200 dark:border-stone-800 flex items-center justify-between text-xs shrink-0">
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => setSidebarTab('workspaces')}
                    className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all flex items-center gap-1 ${
                      sidebarTab === 'workspaces'
                        ? 'bg-amber-500 text-stone-950 shadow-2xs'
                        : 'text-stone-600 dark:text-stone-400 hover:text-stone-900'
                    }`}
                  >
                    <Folder className="w-3.5 h-3.5" />
                    <span>컬렉션</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setSidebarTab('history')}
                    className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all flex items-center gap-1 ${
                      sidebarTab === 'history'
                        ? 'bg-amber-500 text-stone-950 shadow-2xs'
                        : 'text-stone-600 dark:text-stone-400 hover:text-stone-900'
                    }`}
                  >
                    <Clock className="w-3.5 h-3.5" />
                    <span>히스토리 ({historyList.length})</span>
                  </button>
                </div>
              </div>

              {/* Sidebar Content */}
              <div className="flex-1 overflow-y-auto p-2 space-y-2 custom-scrollbar">
                {sidebarTab === 'workspaces' ? (
                  <div className="space-y-3 text-xs">
                    {/* Workspace Selector */}
                    <div className="p-2 rounded-xl bg-white dark:bg-[#202020] border border-stone-200 dark:border-stone-800 space-y-1.5">
                      <div className="text-[10px] font-bold text-stone-400 dark:text-stone-500 uppercase tracking-wider">
                        워크스페이스
                      </div>
                      <select
                        value={activeWorkspaceId}
                        onChange={(e) => setActiveWorkspaceId(e.target.value)}
                        className="w-full px-2.5 py-1.5 rounded-lg border border-stone-200 dark:border-stone-700 bg-stone-50 dark:bg-stone-900 text-xs font-bold text-stone-800 dark:text-stone-200 outline-none"
                      >
                        {workspaces.map((ws) => (
                          <option key={ws.id} value={ws.id}>
                            {ws.name}
                          </option>
                        ))}
                      </select>
                    </div>

                    {/* Active Workspace Collections List */}
                    {(() => {
                      const activeWs = workspaces.find((w) => w.id === activeWorkspaceId) || workspaces[0];
                      if (!activeWs) return null;

                      return (
                        <div className="space-y-2">
                          <div className="flex items-center justify-between text-[11px] font-bold text-stone-500 px-1">
                            <span>컬렉션 폴더 ({activeWs.collections.length})</span>
                          </div>

                          {/* New Collection Input */}
                          <div className="flex items-center gap-1.5">
                            <input
                              type="text"
                              value={newColNameInput}
                              onChange={(e) => setNewColNameInput(e.target.value)}
                              placeholder="새 컬렉션 이름..."
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') handleCreateCollection();
                              }}
                              className="flex-1 px-2.5 py-1 rounded-lg border border-stone-200 dark:border-stone-700 bg-white dark:bg-stone-900 text-xs outline-none"
                            />
                            <button
                              type="button"
                              onClick={handleCreateCollection}
                              className="px-2.5 py-1 bg-amber-500 hover:bg-amber-400 text-stone-950 font-bold rounded-lg text-xs shrink-0 cursor-pointer"
                            >
                              + 추가
                            </button>
                          </div>

                          {/* Collections & Requests Tree */}
                          <div className="space-y-2 pt-1">
                            {activeWs.collections.length === 0 ? (
                              <div className="p-4 text-center text-stone-400 text-xs italic">
                                등록된 컬렉션이 없습니다. 새 컬렉션을 추가해 요청을 저장하세요.
                              </div>
                            ) : (
                              activeWs.collections.map((col) => (
                                <div
                                  key={col.id}
                                  className="rounded-xl border border-stone-200 dark:border-stone-800 bg-white dark:bg-[#202020] p-2 space-y-1.5"
                                >
                                  <div className="flex items-center justify-between text-xs font-bold text-amber-700 dark:text-amber-400 pb-1 border-b border-stone-100 dark:border-stone-800">
                                    <span className="flex items-center gap-1.5 truncate">
                                      <Folder className="w-3.5 h-3.5 text-amber-500 shrink-0" />
                                      <span className="truncate">{col.name}</span>
                                    </span>
                                    <button
                                      type="button"
                                      onClick={() => handleDeleteCollection(col.id)}
                                      className="text-[10px] text-stone-400 hover:text-rose-500 shrink-0 cursor-pointer"
                                      title="컬렉션 삭제"
                                    >
                                      삭제
                                    </button>
                                  </div>

                                  <div className="space-y-1 pl-1">
                                    {col.requests.length === 0 ? (
                                      <div className="text-[10px] text-stone-400 italic py-1">
                                        보관된 요청 없음
                                      </div>
                                    ) : (
                                      col.requests.map((req) => {
                                        const methodCol = METHOD_COLORS[req.item.method];
                                        return (
                                          <div
                                            key={req.id}
                                            onClick={() => handleRestoreHistory(req.item)}
                                            className="p-1.5 rounded-lg border border-stone-100 dark:border-stone-800 hover:bg-amber-500/10 dark:hover:bg-amber-950/20 cursor-pointer transition-all flex items-center justify-between gap-1 group/req"
                                          >
                                            <div className="flex items-center gap-1.5 min-w-0">
                                              <span
                                                className={`px-1 py-0.2 rounded font-mono text-[9px] font-bold border shrink-0 ${methodCol.bg} ${methodCol.text} ${methodCol.border}`}
                                              >
                                                {req.item.method}
                                              </span>
                                              <span className="text-[11px] font-medium text-stone-800 dark:text-stone-200 truncate group-hover/req:text-amber-600 dark:group-hover/req:text-amber-400">
                                                {req.name}
                                              </span>
                                            </div>
                                            <button
                                              type="button"
                                              onClick={(e) => {
                                                e.stopPropagation();
                                                handleDeleteSavedRequest(col.id, req.id);
                                              }}
                                              className="opacity-0 group-hover/req:opacity-100 p-0.5 text-stone-400 hover:text-rose-500 shrink-0 cursor-pointer"
                                              title="요청 삭제"
                                            >
                                              <Trash2 className="w-3 h-3" />
                                            </button>
                                          </div>
                                        );
                                      })
                                    )}
                                  </div>
                                </div>
                              ))
                            )}
                          </div>
                        </div>
                      );
                    })()}
                  </div>
                ) : (
                  /* Recent History Log */
                  historyList.length === 0 ? (
                    <div className="p-4 text-center text-stone-400 text-xs italic">
                      보낸 요청 기록이 없습니다.
                    </div>
                  ) : (
                    historyList.map((item) => {
                      const col = METHOD_COLORS[item.method];
                      return (
                        <div
                          key={item.id}
                          onClick={() => handleRestoreHistory(item)}
                          className="p-2 rounded-xl border border-stone-200/80 dark:border-stone-800 bg-white dark:bg-[#202020] hover:bg-amber-500/10 dark:hover:bg-amber-950/20 cursor-pointer transition-all group"
                        >
                          <div className="flex items-center justify-between gap-1.5 mb-1">
                            <span
                              className={`px-1.5 py-0.2 rounded font-mono text-[10px] font-bold border ${col.bg} ${col.text} ${col.border}`}
                            >
                              {item.method}
                            </span>
                            {item.status !== undefined && (
                              <span
                                className={`text-[10px] font-mono font-bold ${
                                  item.status >= 200 && item.status < 300
                                    ? 'text-emerald-600 dark:text-emerald-400'
                                    : 'text-rose-600 dark:text-rose-400'
                                }`}
                              >
                                {item.status}
                              </span>
                            )}
                          </div>
                          <div className="text-xs font-mono text-stone-800 dark:text-stone-200 truncate group-hover:text-amber-600 dark:group-hover:text-amber-400">
                            {item.url}
                          </div>
                        </div>
                      );
                    })
                  )
                )}
              </div>
            </div>
          )}

          {/* Main Request Client */}
          <div className="flex-1 flex flex-col overflow-hidden p-4 space-y-3">
            {/* Top Request Bar (Method + URL + Send Button) */}
            <div className="flex items-center gap-2 shrink-0">
              {/* Method Selector */}
              <select
                value={method}
                onChange={(e) => setMethod(e.target.value as HttpMethod)}
                className={`px-3 py-2 rounded-xl font-mono text-xs font-bold border outline-none cursor-pointer shrink-0 ${METHOD_COLORS[method].bg} ${METHOD_COLORS[method].text} ${METHOD_COLORS[method].border}`}
              >
                <option value="GET">GET</option>
                <option value="POST">POST</option>
                <option value="PUT">PUT</option>
                <option value="PATCH">PATCH</option>
                <option value="DELETE">DELETE</option>
              </select>

              {/* URL Input */}
              <div className="flex-1 relative flex items-center">
                <Globe className="w-4 h-4 absolute left-3 text-stone-400 shrink-0" />
                <input
                  type="text"
                  value={url}
                  onChange={(e) => parseParamsFromUrl(e.target.value)}
                  placeholder="https://api.example.com/v1/resource..."
                  className="w-full pl-9 pr-20 py-2 rounded-xl border border-stone-200 dark:border-stone-700 bg-stone-50 dark:bg-[#222222] font-mono text-xs outline-none focus:ring-2 focus:ring-amber-500 focus:border-amber-500 transition-all"
                />
                <button
                  type="button"
                  onClick={() => parseParamsFromUrl(DEFAULT_MOCK_URL)}
                  className="absolute right-2 px-2 py-0.5 rounded bg-amber-500/10 text-amber-700 dark:text-amber-400 text-[10px] font-bold"
                  title="테스트용 Sample Mock URL 적용"
                >
                  Mock Sample
                </button>
              </div>

              {/* Server / Client Mode Toggle */}
              <button
                type="button"
                onClick={() => handleToggleServerMode(!useServerMode)}
                className={`flex items-center gap-1.5 px-3 py-2 rounded-xl border text-xs font-semibold cursor-pointer select-none shrink-0 transition-colors ${
                  useServerMode
                    ? 'bg-emerald-500/15 border-emerald-500/40 text-emerald-800 dark:text-emerald-300'
                    : 'bg-stone-50 dark:bg-[#222222] border-stone-200 dark:border-stone-700 text-stone-600 dark:text-stone-400'
                }`}
                title={useServerMode ? 'Server 모드 (REST API 백엔드 동작 중)' : 'Client 모드 (Serverless IndexedDB 동작 중)'}
              >
                {useServerMode ? (
                  <Server className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
                ) : (
                  <HardDrive className="w-3.5 h-3.5 text-amber-500 shrink-0" />
                )}
                <span>{useServerMode ? 'Server 모드' : 'Client 모드'}</span>
              </button>

              {/* CORS Proxy Toggle */}
              <label
                className={`flex items-center gap-1.5 px-3 py-2 rounded-xl border text-xs font-semibold cursor-pointer select-none shrink-0 transition-colors ${
                  useCorsProxy
                    ? 'bg-amber-500/15 border-amber-500/40 text-amber-800 dark:text-amber-300'
                    : 'bg-stone-50 dark:bg-[#222222] border-stone-200 dark:border-stone-700 text-stone-700 dark:text-stone-300'
                }`}
                title="CORS Proxy ON: 백엔드 프록시(/api/proxy)를 경유하여 외부 API의 CORS 제약을 우회합니다."
              >
                <input
                  type="checkbox"
                  checked={useCorsProxy}
                  onChange={(e) => handleToggleCorsProxy(e.target.checked)}
                  className="rounded accent-amber-500 cursor-pointer w-3.5 h-3.5"
                />
                <ShieldCheck className="w-3.5 h-3.5 text-amber-500 shrink-0" />
                <span>CORS Proxy {useCorsProxy ? 'ON' : 'OFF'}</span>
              </label>

              {/* Send / Cancel Button */}
              {isLoading ? (
                <button
                  type="button"
                  onClick={handleCancelRequest}
                  className="px-5 py-2 rounded-xl bg-rose-600 hover:bg-rose-500 text-white font-bold text-xs flex items-center gap-1.5 transition-colors cursor-pointer shrink-0 shadow-sm"
                >
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>요청 취소</span>
                </button>
              ) : (
                <button
                  type="button"
                  onClick={handleSendRequest}
                  className="px-6 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-stone-950 font-bold text-xs flex items-center gap-1.5 transition-colors cursor-pointer shrink-0 shadow-sm active:scale-98"
                >
                  <Send className="w-4 h-4" />
                  <span>Send</span>
                </button>
              )}
            </div>

            {/* Request Options Tabs (Params | Headers | Body | Auth) */}
            <div className="flex-1 flex flex-col border border-stone-200 dark:border-stone-800 rounded-2xl overflow-hidden bg-white dark:bg-[#1e1e1e]">
              <div className="px-3 py-1.5 bg-stone-100/80 dark:bg-[#242424] border-b border-stone-200 dark:border-stone-800 flex items-center gap-1 overflow-x-auto text-xs shrink-0">
                {[
                  { id: 'params' as const, label: `Params (${paramsList.filter((p) => p.enabled && p.key).length})` },
                  { id: 'headers' as const, label: `Headers (${headersList.filter((h) => h.enabled && h.key).length})` },
                  { id: 'body' as const, label: 'Body' },
                  { id: 'auth' as const, label: 'Auth' },
                ].map((tab) => (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => setActiveReqTab(tab.id)}
                    className={`px-3.5 py-1 rounded-xl font-bold transition-all ${
                      activeReqTab === tab.id
                        ? 'bg-amber-500 text-stone-950 shadow-2xs'
                        : 'text-stone-600 dark:text-stone-400 hover:text-stone-900 dark:hover:text-stone-100'
                    }`}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>

              {/* Request Options Body */}
              <div className="flex-1 p-3 overflow-y-auto custom-scrollbar">
                {activeReqTab === 'params' && (
                  <div className="space-y-2">
                    <div className="flex items-center justify-between text-[11px] font-bold text-stone-500 dark:text-stone-400">
                      <span>URL Query Parameters</span>
                      <button
                        type="button"
                        onClick={handleAddParamRow}
                        className="text-amber-600 dark:text-amber-400 flex items-center gap-1 hover:underline"
                      >
                        <Plus className="w-3 h-3" /> 행 추가
                      </button>
                    </div>

                    <div className="space-y-1.5">
                      {paramsList.map((row) => (
                        <div key={row.id} className="flex items-center gap-2">
                          <input
                            type="checkbox"
                            checked={row.enabled}
                            onChange={(e) => handleParamChange(row.id, 'enabled', e.target.checked)}
                            className="rounded accent-amber-500 cursor-pointer"
                          />
                          <input
                            type="text"
                            value={row.key}
                            onChange={(e) => handleParamChange(row.id, 'key', e.target.value)}
                            placeholder="Key (예: page, limit)"
                            className="w-1/3 px-2.5 py-1 rounded-lg border border-stone-200 dark:border-stone-700 bg-stone-50 dark:bg-stone-900 font-mono text-xs outline-none"
                          />
                          <input
                            type="text"
                            value={row.value}
                            onChange={(e) => handleParamChange(row.id, 'value', e.target.value)}
                            placeholder="Value (예: 1, 50)"
                            className="w-1/3 px-2.5 py-1 rounded-lg border border-stone-200 dark:border-stone-700 bg-stone-50 dark:bg-stone-900 font-mono text-xs outline-none"
                          />
                          <input
                            type="text"
                            value={row.description}
                            onChange={(e) => handleParamChange(row.id, 'description', e.target.value)}
                            placeholder="설명 (옵션)"
                            className="flex-1 px-2.5 py-1 rounded-lg border border-stone-200 dark:border-stone-700 bg-stone-50 dark:bg-stone-900 text-xs outline-none"
                          />
                          <button
                            type="button"
                            onClick={() => handleDeleteParamRow(row.id)}
                            className="p-1 text-stone-400 hover:text-rose-500"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {activeReqTab === 'headers' && (
                  <div className="space-y-2">
                    <div className="flex items-center justify-between text-[11px] font-bold text-stone-500 dark:text-stone-400">
                      <div className="flex items-center gap-2">
                        <span>HTTP Request Headers</span>
                        {/* Mode Switcher */}
                        <div className="flex bg-stone-200 dark:bg-stone-800 p-0.5 rounded-lg text-[10px]">
                          <button
                            type="button"
                            onClick={() => handleSwitchHeaderMode('keyvalue')}
                            className={`px-2 py-0.5 rounded transition-colors ${
                              headerMode === 'keyvalue'
                                ? 'bg-amber-500 text-stone-950 font-bold'
                                : 'text-stone-600 dark:text-stone-400'
                            }`}
                          >
                            Key-Value
                          </button>
                          <button
                            type="button"
                            onClick={() => handleSwitchHeaderMode('raw')}
                            className={`px-2 py-0.5 rounded transition-colors ${
                              headerMode === 'raw'
                                ? 'bg-amber-500 text-stone-950 font-bold'
                                : 'text-stone-600 dark:text-stone-400'
                            }`}
                          >
                            Raw Text
                          </button>
                        </div>
                      </div>

                      {headerMode === 'keyvalue' && (
                        <button
                          type="button"
                          onClick={handleAddHeaderRow}
                          className="text-amber-600 dark:text-amber-400 flex items-center gap-1 hover:underline"
                        >
                          <Plus className="w-3 h-3" /> 헤더 추가
                        </button>
                      )}
                    </div>

                    {headerMode === 'keyvalue' ? (
                      <div className="space-y-1.5">
                        {headersList.map((row) => (
                          <div key={row.id} className="flex items-center gap-2">
                            <input
                              type="checkbox"
                              checked={row.enabled}
                              onChange={(e) => handleHeaderChange(row.id, 'enabled', e.target.checked)}
                              className="rounded accent-amber-500 cursor-pointer"
                            />
                            <input
                              type="text"
                              value={row.key}
                              onChange={(e) => handleHeaderChange(row.id, 'key', e.target.value)}
                              placeholder="Header Key (예: Authorization)"
                              className="w-1/3 px-2.5 py-1 rounded-lg border border-stone-200 dark:border-stone-700 bg-stone-50 dark:bg-stone-900 font-mono text-xs outline-none"
                            />
                            <input
                              type="text"
                              value={row.value}
                              onChange={(e) => handleHeaderChange(row.id, 'value', e.target.value)}
                              placeholder="Header Value"
                              className="w-1/3 px-2.5 py-1 rounded-lg border border-stone-200 dark:border-stone-700 bg-stone-50 dark:bg-stone-900 font-mono text-xs outline-none"
                            />
                            <input
                              type="text"
                              value={row.description}
                              onChange={(e) => handleHeaderChange(row.id, 'description', e.target.value)}
                              placeholder="설명"
                              className="flex-1 px-2.5 py-1 rounded-lg border border-stone-200 dark:border-stone-700 bg-stone-50 dark:bg-stone-900 text-xs outline-none"
                            />
                            <button
                              type="button"
                              onClick={() => handleDeleteHeaderRow(row.id)}
                              className="p-1 text-stone-400 hover:text-rose-500"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="space-y-1">
                        <textarea
                          value={rawHeadersText}
                          onChange={(e) => {
                            setRawHeadersText(e.target.value);
                            parseHeadersFromRawText(e.target.value);
                          }}
                          placeholder={`Content-Type: application/json\nAuthorization: Bearer my-token\nAccept: */*`}
                          className="w-full h-36 p-3 rounded-xl border border-stone-200 dark:border-stone-700 bg-stone-50 dark:bg-stone-900 font-mono text-xs leading-relaxed outline-none focus:ring-2 focus:ring-amber-500 custom-scrollbar resize-none"
                        />
                        <div className="text-[10px] text-stone-400 italic">
                          💡 줄바꿈마다 <code>Key: Value</code> 형식으로 입력하면 자동으로 헤더 목록에 등록됩니다.
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {activeReqTab === 'body' && (
                  <div className="h-full flex flex-col space-y-2">
                    <div className="flex items-center justify-between gap-3 text-xs">
                      <div className="flex items-center gap-2 font-bold text-stone-600 dark:text-stone-300">
                        {(['none', 'raw_json'] as const).map((type) => (
                          <label key={type} className="flex items-center gap-1.5 cursor-pointer">
                            <input
                              type="radio"
                              name="bodyType"
                              checked={bodyType === type}
                              onChange={() => setBodyType(type)}
                              className="accent-amber-500 cursor-pointer"
                            />
                            <span>{type === 'none' ? 'none (본문 없음)' : 'raw (JSON)'}</span>
                          </label>
                        ))}
                      </div>

                      {bodyType === 'raw_json' && (
                        <button
                          type="button"
                          onClick={handlePrettifyJsonBody}
                          className="px-2.5 py-1 rounded-lg bg-amber-500/10 text-amber-700 dark:text-amber-400 text-[11px] font-bold flex items-center gap-1"
                        >
                          <Sparkles className="w-3 h-3 text-amber-500" />
                          Prettify JSON
                        </button>
                      )}
                    </div>

                    {bodyType === 'raw_json' ? (
                      <textarea
                        value={bodyJson}
                        onChange={(e) => setBodyJson(e.target.value)}
                        placeholder={`{\n  "key": "value"\n}`}
                        className="flex-1 w-full min-h-[140px] p-3 rounded-xl border border-stone-200 dark:border-stone-700 bg-stone-50 dark:bg-stone-900 font-mono text-xs leading-relaxed outline-none focus:ring-2 focus:ring-amber-500 custom-scrollbar resize-none"
                      />
                    ) : (
                      <div className="flex-1 flex items-center justify-center text-stone-400 italic text-xs">
                        이 요청에는 Body가 포함되지 않습니다.
                      </div>
                    )}
                  </div>
                )}

                {activeReqTab === 'auth' && (
                  <div className="space-y-3 text-xs">
                    <div className="flex items-center gap-3 font-bold text-stone-600 dark:text-stone-300">
                      {(['none', 'bearer', 'basic'] as const).map((type) => (
                        <label key={type} className="flex items-center gap-1.5 cursor-pointer">
                          <input
                            type="radio"
                            name="authType"
                            checked={authType === type}
                            onChange={() => setAuthType(type)}
                            className="accent-amber-500 cursor-pointer"
                          />
                          <span>{type === 'none' ? '인증 없음 (No Auth)' : type === 'bearer' ? 'Bearer Token' : 'Basic Auth'}</span>
                        </label>
                      ))}
                    </div>

                    {authType === 'bearer' && (
                      <div className="space-y-1">
                        <label className="text-[11px] font-bold text-stone-500">Token:</label>
                        <input
                          type="text"
                          value={authToken}
                          onChange={(e) => setAuthToken(e.target.value)}
                          placeholder="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
                          className="w-full px-3 py-1.5 rounded-xl border border-stone-200 dark:border-stone-700 bg-stone-50 dark:bg-stone-900 font-mono text-xs outline-none"
                        />
                      </div>
                    )}

                    {authType === 'basic' && (
                      <div className="grid grid-cols-2 gap-2">
                        <div className="space-y-1">
                          <label className="text-[11px] font-bold text-stone-500">Username:</label>
                          <input
                            type="text"
                            value={authUsername}
                            onChange={(e) => setAuthUsername(e.target.value)}
                            placeholder="admin"
                            className="w-full px-3 py-1.5 rounded-xl border border-stone-200 dark:border-stone-700 bg-stone-50 dark:bg-stone-900 font-mono text-xs outline-none"
                          />
                        </div>
                        <div className="space-y-1">
                          <label className="text-[11px] font-bold text-stone-500">Password:</label>
                          <input
                            type="password"
                            value={authPassword}
                            onChange={(e) => setAuthPassword(e.target.value)}
                            placeholder="••••••••"
                            className="w-full px-3 py-1.5 rounded-xl border border-stone-200 dark:border-stone-700 bg-stone-50 dark:bg-stone-900 font-mono text-xs outline-none"
                          />
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>

            {/* Response Section */}
            <div className="flex-1 flex flex-col border border-stone-200 dark:border-stone-800 rounded-2xl overflow-hidden bg-white dark:bg-[#1e1e1e]">
              {/* Response Header Status Bar */}
              <div className="px-3 py-2 bg-stone-100/80 dark:bg-[#242424] border-b border-stone-200 dark:border-stone-800 flex items-center justify-between gap-3 text-xs shrink-0">
                <div className="flex items-center gap-3">
                  <div className="flex items-center gap-1 font-bold">
                    <button
                      type="button"
                      onClick={() => setActiveResTab('body')}
                      className={`px-3 py-1 rounded-xl transition-all ${
                        activeResTab === 'body'
                          ? 'bg-amber-500 text-stone-950 shadow-2xs'
                          : 'text-stone-600 dark:text-stone-400'
                      }`}
                    >
                      Response Body
                    </button>
                    <button
                      type="button"
                      onClick={() => setActiveResTab('headers')}
                      className={`px-3 py-1 rounded-xl transition-all ${
                        activeResTab === 'headers'
                          ? 'bg-amber-500 text-stone-950 shadow-2xs'
                          : 'text-stone-600 dark:text-stone-400'
                      }`}
                    >
                      Headers ({Object.keys(resHeaders).length})
                    </button>
                    <button
                      type="button"
                      onClick={() => setActiveResTab('raw_request')}
                      className={`px-3 py-1 rounded-xl transition-all ${
                        activeResTab === 'raw_request'
                          ? 'bg-amber-500 text-stone-950 shadow-2xs'
                          : 'text-stone-600 dark:text-stone-400'
                      }`}
                    >
                      전송된 Raw Request
                    </button>
                  </div>

                  {resStatus !== null && (
                    <div className="flex items-center gap-2 font-mono font-bold text-xs">
                      <span
                        className={`px-2 py-0.5 rounded-md ${
                          resStatus >= 200 && resStatus < 300
                            ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30'
                            : 'bg-rose-500/15 text-rose-600 dark:text-rose-400 border border-rose-500/30'
                        }`}
                      >
                        Status: {resStatus} {resStatusText}
                      </span>
                      {resTimeMs !== null && <span className="text-stone-400">Time: {resTimeMs} ms</span>}
                      {resSizeBytes !== null && (
                        <span className="text-stone-400">
                          Size: {(resSizeBytes / 1024).toFixed(1)} KB
                        </span>
                      )}
                    </div>
                  )}
                </div>

                {((activeResTab === 'body' && resBodyText) ||
                  (activeResTab === 'raw_request' && resRawRequestText) ||
                  (activeResTab === 'headers' && Object.keys(resHeaders).length > 0)) && (
                  <div className="flex items-center gap-1">
                    {activeResTab === 'body' && (
                      <button
                        type="button"
                        onClick={handleDownloadResponse}
                        className="px-2.5 py-1 rounded-lg border border-stone-200 dark:border-stone-700 bg-white dark:bg-stone-800 text-stone-700 dark:text-stone-300 hover:bg-stone-100 font-semibold flex items-center gap-1 cursor-pointer"
                      >
                        <Download className="w-3 h-3 text-sky-500" />
                        <span>다운로드</span>
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={handleCopyResponseBody}
                      className="px-3 py-1 rounded-lg bg-amber-500 hover:bg-amber-400 text-stone-950 font-bold flex items-center gap-1 cursor-pointer"
                    >
                      <Copy className="w-3 h-3" />
                      <span>복사</span>
                    </button>
                  </div>
                )}
              </div>

              {/* Response Content Area */}
              <div className="flex-1 p-3 overflow-y-auto font-mono text-xs leading-relaxed custom-scrollbar">
                {activeResTab === 'body' && (
                  resBodyText ? (
                    <pre className="m-0 p-0 text-stone-800 dark:text-stone-100 whitespace-pre-wrap break-all">
                      {resBodyText}
                    </pre>
                  ) : (
                    <div className="h-full flex flex-col items-center justify-center text-stone-400 italic">
                      Send 버튼을 눌러 API 요청 결과를 확인하세요.
                    </div>
                  )
                )}

                {activeResTab === 'headers' && (
                  Object.keys(resHeaders).length > 0 ? (
                    <div className="space-y-1">
                      {Object.entries(resHeaders).map(([k, v]) => (
                        <div key={k} className="flex items-center gap-2 p-1.5 rounded bg-stone-50 dark:bg-stone-900 border border-stone-200/60 dark:border-stone-800">
                          <span className="font-bold text-amber-600 dark:text-amber-400 min-w-[160px]">{k}:</span>
                          <span className="text-stone-800 dark:text-stone-200 break-all">{v}</span>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="h-full flex items-center justify-center text-stone-400 italic">
                      반환된 Response Header가 없습니다.
                    </div>
                  )
                )}

                {activeResTab === 'raw_request' && (
                  resRawRequestText ? (
                    <div className="space-y-2">
                      <div className="flex items-center justify-between text-[11px] text-stone-400 font-bold border-b border-stone-200 dark:border-stone-800 pb-1">
                        <span>네트워크로 실제 전송된 HTTP Raw 요청 헤더 &amp; 본문</span>
                        <button
                          type="button"
                          onClick={() => copyToClipboard(resRawRequestText, '✓ Raw 요청 정보가 클립보드에 복사되었습니다.')}
                          className="px-2 py-0.5 rounded bg-amber-500/15 text-amber-700 dark:text-amber-300 font-bold hover:bg-amber-500/25 cursor-pointer"
                        >
                          Raw 복사
                        </button>
                      </div>
                      <pre className="m-0 p-3 rounded-xl bg-stone-50 dark:bg-stone-900 border border-stone-200 dark:border-stone-800 text-amber-800 dark:text-amber-300 whitespace-pre-wrap break-all leading-relaxed font-mono">
                        {resRawRequestText}
                      </pre>
                    </div>
                  ) : (
                    <div className="h-full flex items-center justify-center text-stone-400 italic">
                      전송된 Raw Request 정보가 없습니다. Send 버튼을 눌러 요청을 전송하세요.
                    </div>
                  )
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="px-5 py-2.5 border-t border-stone-200 dark:border-stone-800 bg-stone-50/80 dark:bg-stone-900/80 flex items-center justify-between text-xs text-stone-500 shrink-0">
          <span></span>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-1.5 rounded-xl bg-stone-900 dark:bg-stone-100 text-white dark:text-stone-900 font-bold text-xs cursor-pointer"
          >
            닫기
          </button>
        </div>
      </div>

      {/* Save Request Modal Dialog */}
      {isSaveModalOpen && (
        <div
          className="fixed inset-0 z-[9999999] flex items-center justify-center p-4 bg-stone-950/60 backdrop-blur-xs animate-in fade-in duration-100"
          onClick={() => setIsSaveModalOpen(false)}
        >
          <div
            className="bg-white dark:bg-stone-900 rounded-2xl shadow-2xl border border-stone-200 dark:border-stone-800 w-full max-w-md p-5 space-y-4 animate-in zoom-in-95 duration-100"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-stone-200 dark:border-stone-800 pb-2">
              <div className="flex items-center gap-2 font-bold text-stone-900 dark:text-stone-100 text-sm">
                <Bookmark className="w-4 h-4 text-amber-500" />
                <span>현재 API 요청 컬렉션에 저장</span>
              </div>
              <button
                type="button"
                onClick={() => setIsSaveModalOpen(false)}
                className="p-1 rounded-lg text-stone-400 hover:text-stone-600 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div className="space-y-1">
                <label className="font-bold text-stone-600 dark:text-stone-300">요청 이름 (Name):</label>
                <input
                  type="text"
                  value={saveReqName}
                  onChange={(e) => setSaveReqName(e.target.value)}
                  placeholder="예: 사용자 정보 조회, 주문 생성 API"
                  className="w-full px-3 py-2 rounded-xl border border-stone-200 dark:border-stone-700 bg-stone-50 dark:bg-stone-800 font-bold text-xs outline-none focus:ring-2 focus:ring-amber-500"
                />
              </div>

              <div className="space-y-1">
                <label className="font-bold text-stone-600 dark:text-stone-300">저장할 컬렉션 (Collection):</label>
                <select
                  value={saveTargetColId}
                  onChange={(e) => setSaveTargetColId(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-stone-200 dark:border-stone-700 bg-stone-50 dark:bg-stone-800 text-xs font-bold outline-none cursor-pointer"
                >
                  {workspaces
                    .find((w) => w.id === activeWorkspaceId)
                    ?.collections.map((col) => (
                      <option key={col.id} value={col.id}>
                        {col.name}
                      </option>
                    ))}
                </select>
              </div>
            </div>

            <div className="pt-2 border-t border-stone-200 dark:border-stone-800 flex justify-end gap-2 text-xs">
              <button
                type="button"
                onClick={() => setIsSaveModalOpen(false)}
                className="px-3.5 py-1.5 rounded-xl border border-stone-200 dark:border-stone-700 hover:bg-stone-100 text-stone-600 dark:text-stone-300 cursor-pointer"
              >
                취소
              </button>
              <button
                type="button"
                onClick={handleSaveCurrentRequestToCollection}
                className="px-4 py-1.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-stone-950 font-bold shadow-xs cursor-pointer"
              >
                저장 완료
              </button>
            </div>
          </div>
        </div>
      )}
    </div>,
    document.body
  );
};
