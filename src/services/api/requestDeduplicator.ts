/**
 * In-Flight Request Deduplication Engine
 * Reuses identical pending Promises for concurrent / StrictMode requests.
 * Prevents duplicated network traffic on fast refreshes and simultaneous component loads.
 */

const inFlightMap = new Map<string, Promise<any>>();

export interface DeduplicateOptions extends RequestInit {
  bypassDeduplication?: boolean;
}

export async function deduplicatedFetchJson<T = any>(
  url: string,
  options?: DeduplicateOptions
): Promise<T> {
  const method = (options?.method || 'GET').toUpperCase();

  // Deduplicate only idempotent queries (GET)
  if (method !== 'GET' || options?.bypassDeduplication) {
    const res = await fetch(url, options);
    if (!res.ok) {
      const errJson = await res.json().catch(() => ({}));
      throw new Error(errJson.error || `HTTP ${res.status}`);
    }
    return (await res.json()) as T;
  }

  const key = `${method}:${url}`;

  // If an identical request is already running, return the existing Promise
  if (inFlightMap.has(key)) {
    return inFlightMap.get(key) as Promise<T>;
  }

  const promise = (async () => {
    try {
      const res = await fetch(url, options);
      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}));
        throw new Error(errJson.error || `HTTP ${res.status}`);
      }
      return (await res.json()) as T;
    } finally {
      // Release in-flight lock as soon as the request settles
      inFlightMap.delete(key);
    }
  })();

  inFlightMap.set(key, promise);
  return promise;
}

export function clearInFlightRequests(): void {
  inFlightMap.clear();
}
