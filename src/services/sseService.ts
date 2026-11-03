import { resolveApiUrl, fetchBridge } from './httpBridge';

export interface SsePayload {
  type: string;
  lastUpdated?: number;
  [key: string]: any;
}

/**
 * Robust Real-time Synchronization Service (Smart Polling / Version Check)
 * Works universally across Web Server Mode, Web Client Mode, and Tauri 2.0 Desktop Apps
 * without suffering from tauri://localhost EventSource protocol limitations or proxy dropouts.
 */
export function createSseConnection(
  serverUrl: string = '/api',
  onUpdate: (payload: SsePayload) => void,
  onError?: (err: any) => void
): () => void {
  let isCancelled = false;
  let timer: any = null;
  let lastCheckedVersion = 0;

  const pollVersion = async () => {
    if (isCancelled) return;
    try {
      const cleanServerUrl = serverUrl.replace(/\/+$/, '');
      const versionUrl = `${cleanServerUrl}/workspace/version`;
      const res = await fetchBridge(versionUrl, { cache: 'no-store' });
      if (res.status === 304) {
        return;
      }
      if (res.ok) {
        const data = await res.json();
        if (data && typeof data.lastUpdated === 'number') {
          if (lastCheckedVersion === 0) {
            lastCheckedVersion = data.lastUpdated;
          } else if (data.lastUpdated > lastCheckedVersion) {
            lastCheckedVersion = data.lastUpdated;
            onUpdate({ type: 'workspace_updated', lastUpdated: data.lastUpdated });
          }
        }
      }
    } catch (err) {
      if (!isCancelled && onError) {
        onError(err);
      }
    }
  };

  // Initial check on mount
  pollVersion();

  // Poll every 3 seconds for instant multi-PC / multi-window sync (ultra-lightweight 304 support)
  timer = setInterval(pollVersion, 3000);

  return () => {
    isCancelled = true;
    if (timer) {
      clearInterval(timer);
      timer = null;
    }
  };
}
