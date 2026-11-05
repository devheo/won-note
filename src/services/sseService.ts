import { resolveApiUrl, fetchBridge } from './httpBridge';

export interface SsePayload {
  type: string;
  lastUpdated?: number;
  [key: string]: any;
}

const VERSION_POLL_INTERVAL_MS = 3_000;
const VERSION_POLL_MAX_INTERVAL_MS = 30_000;

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
  let timer: ReturnType<typeof setTimeout> | null = null;
  let isRequestInFlight = false;
  let wakeRequested = false;
  let consecutiveFailures = 0;
  let lastCheckedVersion = 0;
  let lastEtag: string | null = null;

  const pollVersion = async () => {
    if (isCancelled) return;
    if (isRequestInFlight) {
      wakeRequested = true;
      return;
    }

    isRequestInFlight = true;
    let nextDelay = VERSION_POLL_INTERVAL_MS;
    try {
      const cleanServerUrl = serverUrl.replace(/\/+$/, '');
      const versionUrl = `${cleanServerUrl}/workspace/version`;
      const headers: Record<string, string> = {};
      if (lastEtag) headers['If-None-Match'] = lastEtag;
      const res = await fetchBridge(versionUrl, { cache: 'no-store', headers });
      if (res.status === 304) {
        consecutiveFailures = 0;
      } else if (res.ok) {
        consecutiveFailures = 0;
        lastEtag = res.headers.get('ETag') || lastEtag;
        const data = await res.json();
        if (data && typeof data.lastUpdated === 'number') {
          if (lastCheckedVersion === 0) {
            lastCheckedVersion = data.lastUpdated;
          } else if (data.lastUpdated > lastCheckedVersion) {
            lastCheckedVersion = data.lastUpdated;
            onUpdate({ type: 'workspace_updated', lastUpdated: data.lastUpdated });
          }
        }
      } else if (res.status >= 500) {
        consecutiveFailures += 1;
        nextDelay = getRetryDelay(consecutiveFailures);
      }
    } catch (err) {
      consecutiveFailures += 1;
      nextDelay = getRetryDelay(consecutiveFailures);
      if (!isCancelled && onError && consecutiveFailures === 1) {
        onError(err);
      }
    } finally {
      isRequestInFlight = false;
      if (!isCancelled) {
        const delay = wakeRequested ? 0 : nextDelay;
        wakeRequested = false;
        timer = setTimeout(pollVersion, delay);
      }
    }
  };

  const getRetryDelay = (failures: number) =>
    Math.min(VERSION_POLL_MAX_INTERVAL_MS, VERSION_POLL_INTERVAL_MS * 2 ** Math.min(failures, 4));

  const wakePolling = () => {
    if (isCancelled) return;
    if (isRequestInFlight) {
      wakeRequested = true;
      return;
    }
    if (timer) clearTimeout(timer);
    timer = setTimeout(pollVersion, 0);
  };

  const handleVisibilityChange = () => {
    if (document.visibilityState === 'visible') wakePolling();
  };

  // Initial check on mount
  pollVersion();
  window.addEventListener('online', wakePolling);
  window.addEventListener('focus', wakePolling);
  document.addEventListener('visibilitychange', handleVisibilityChange);

  return () => {
    isCancelled = true;
    if (timer !== null) {
      clearTimeout(timer);
      timer = null;
    }
    window.removeEventListener('online', wakePolling);
    window.removeEventListener('focus', wakePolling);
    document.removeEventListener('visibilitychange', handleVisibilityChange);
  };
}
