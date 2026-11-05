import { isTauri } from '../utils/platformBridge';
import { STORAGE_KEYS } from '../constants/storageKeys';

/**
 * Resolves relative API paths (/api/...) into absolute URLs when running under Tauri Desktop Mode.
 * Prevents tauri://localhost/api/... 404 / MIME errors by directing requests to target backend server.
 */
export function resolveApiUrl(url: string): string {
  if (!url) return url;
  if (url.startsWith('http://') || url.startsWith('https://') || url.startsWith('data:') || url.startsWith('blob:')) {
    return url;
  }

  let domain = '';

  // 1. Check if user configured server URL in localStorage (e.g. http://10.131.171.98:3000/api)
  const savedUrl = typeof localStorage !== 'undefined' ? localStorage.getItem(STORAGE_KEYS.serverUrl) : null;
  if (savedUrl && (savedUrl.startsWith('http://') || savedUrl.startsWith('https://'))) {
    domain = savedUrl.replace(/\/api\/?$/, '').replace(/\/+$/, '');
  }

  // 2. Check current active browser window location origin (e.g. http://10.131.171.98:3000 from devUrl)
  if (!domain && typeof window !== 'undefined' && window.location) {
    const origin = window.location.origin;
    if (origin && origin !== 'null' && !origin.startsWith('tauri://') && !origin.startsWith('file://')) {
      domain = origin;
    }
  }

  // 3. Default fallback if still unresolved
  if (!domain) {
    domain = 'http://localhost:3000';
  }
  const path = url.startsWith('/') ? url : `/${url}`;
  return `${domain}${path}`;
}

/**
 * Unified HTTP Fetch Network Bridge
 * - tauri_app: Resolves URL to absolute server endpoint and uses @tauri-apps/plugin-http (cURL-style direct HTTP request, bypassing browser CORS & Sec-Fetch-* limits).
 * - client_web / server: Uses standard window.fetch().
 */
export async function fetchBridge(url: string, options?: RequestInit): Promise<Response> {
  const targetUrl = resolveApiUrl(url);

  if (isTauri()) {
    try {
      const http = await import(/* @vite-ignore */ '@tauri-apps/plugin-http');
      return await http.fetch(targetUrl, options as any);
    } catch (err: any) {
      console.warn('[HttpBridge] Tauri http.fetch failed, falling back to window.fetch:', err);
    }
  }

  // Include the HttpOnly session only for this app or its configured server API.
  let credentials = options?.credentials || 'same-origin';
  try {
    const targetOrigin = new URL(targetUrl, window.location.href).origin;
    const configured = typeof localStorage !== 'undefined' ? localStorage.getItem(STORAGE_KEYS.serverUrl) : null;
    const configuredOrigin = configured ? new URL(configured, window.location.href).origin : window.location.origin;
    if (targetOrigin === window.location.origin || targetOrigin === configuredOrigin) credentials = options?.credentials || 'include';
  } catch { /* retain the same-origin default for malformed or non-web URLs */ }
  return window.fetch(targetUrl, { ...options, credentials });
}

/**
 * Helper to fetch text content via Unified HTTP Bridge.
 */
export async function fetchTextBridge(url: string, options?: RequestInit): Promise<string> {
  const response = await fetchBridge(url, options);
  if (!response.ok) {
    throw new Error(`HTTP Error ${response.status}: ${response.statusText}`);
  }
  return response.text();
}

/**
 * Helper to fetch JSON data via Unified HTTP Bridge.
 */
export async function fetchJsonBridge<T = any>(url: string, options?: RequestInit): Promise<T> {
  const response = await fetchBridge(url, options);
  if (!response.ok) {
    throw new Error(`HTTP Error ${response.status}: ${response.statusText}`);
  }
  return response.json();
}
