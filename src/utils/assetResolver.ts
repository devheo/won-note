import { wonbeeDexieDB } from '../services/storage/dexieDb';
import { resolveApiUrl } from '../services/httpBridge';
import { STORAGE_KEYS } from '../constants/storageKeys';

const assetUrlCache = new Map<string, string>();
const assetUrlInFlight = new Map<string, Promise<string>>();

export async function resolveAssetUrl(assetUrl: string): Promise<string> {
  if (!assetUrl.startsWith('asset://')) return assetUrl;
  const isFileProtocol = typeof window !== 'undefined' && window.location.protocol.startsWith('file:');
  const useServer = typeof localStorage !== 'undefined' && !isFileProtocol && localStorage.getItem(STORAGE_KEYS.useServer) !== 'false';
  const cacheKey = `${assetUrl}|${useServer ? 'server' : 'local'}`;
  const cached = assetUrlCache.get(cacheKey);
  if (cached) return cached;
  const inFlight = assetUrlInFlight.get(cacheKey);
  if (inFlight) return inFlight;

  const request = (async () => {
    const assetId = assetUrl.slice('asset://'.length);
    try {
    const asset = await wonbeeDexieDB.getAsset(assetId);
    if (asset?.blob) {
      if (useServer) {
        // Dirty assets are shown from local Blob storage and uploaded with the
        // note/table save, avoiding one upload per image-view mount.
        if (asset.is_dirty !== 0) {
          const objectUrl = URL.createObjectURL(asset.blob);
          assetUrlCache.set(cacheKey, objectUrl);
          return objectUrl;
        }
        try {
          const serverUrl = resolveApiUrl(`/api/assets/${encodeURIComponent(assetId)}`);
          assetUrlCache.set(cacheKey, serverUrl);
          return serverUrl;
        } catch {
          // Keep the local copy usable while offline; it can be uploaded on a later read.
        }
      }
      const objectUrl = URL.createObjectURL(asset.blob);
      assetUrlCache.set(cacheKey, objectUrl);
      return objectUrl;
    }
    } catch (err) {
      console.warn('[AssetResolver] Local asset lookup failed:', err);
    }

    // Legacy asset:// links may have been created on another client. Resolve them
    // from the shared server asset store when server mode is enabled.
    if (useServer) {
      const serverUrl = resolveApiUrl(`/api/assets/${encodeURIComponent(assetId)}`);
      assetUrlCache.set(cacheKey, serverUrl);
      return serverUrl;
    }
    return '';
  })();
  assetUrlInFlight.set(cacheKey, request);
  try { return await request; }
  finally { assetUrlInFlight.delete(cacheKey); }
}

/**
 * Parses HTML string containing <img src="asset://..."> and replaces asset:// URIs
 * with active temporary Blob object URLs resolved from Dexie offline asset store.
 */
export async function resolveAssetUrlsInHtml(html: string): Promise<string> {
  if (!html || typeof html !== 'string' || !html.includes('asset://')) {
    return html;
  }

  let resolved = html;
  const assetRegex = /(?:src|data-asset-src)=["'](asset:\/\/[^"']+)["']/g;
  let match;
  const assetUrls = new Set<string>();

  while ((match = assetRegex.exec(html)) !== null) {
    assetUrls.add(match[1]);
  }

  for (const assetUrl of assetUrls) {
    const resolvedUrl = await resolveAssetUrl(assetUrl);
    if (resolvedUrl !== assetUrl) {
      resolved = resolved.replaceAll(`data-asset-src="${assetUrl}"`, `src="${resolvedUrl}"`);
      resolved = resolved.replaceAll(`data-asset-src='${assetUrl}'`, `src="${resolvedUrl}"`);
      resolved = resolved.replaceAll(`src="${assetUrl}"`, `src="${resolvedUrl}"`);
      resolved = resolved.replaceAll(`src='${assetUrl}'`, `src='${resolvedUrl}'`);
    }
  }

  return resolved;
}
