import { wonbeeDexieDB } from '../services/storage/dexieDb';
import { fetchBridge, resolveApiUrl } from '../services/httpBridge';

const assetUrlCache = new Map<string, string>();

export async function resolveAssetUrl(assetUrl: string): Promise<string> {
  if (!assetUrl.startsWith('asset://')) return assetUrl;
  const cached = assetUrlCache.get(assetUrl);
  if (cached) return cached;

  const assetId = assetUrl.slice('asset://'.length);
  try {
    const asset = await wonbeeDexieDB.getAsset(assetId);
    if (asset?.blob) {
      const isFileProtocol = typeof window !== 'undefined' && window.location.protocol.startsWith('file:');
      const useServer = typeof localStorage !== 'undefined' && !isFileProtocol && localStorage.getItem('wonbee_use_server') !== 'false';
      if (useServer) {
        try {
          const dataUrl = await new Promise<string>((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => typeof reader.result === 'string' ? resolve(reader.result) : reject(new Error('Could not read asset'));
            reader.onerror = () => reject(reader.error || new Error('Could not read asset'));
            reader.readAsDataURL(asset.blob);
          });
          const response = await fetchBridge('/api/assets', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ assetId, filename: asset.filename || assetId, blobBase64: dataUrl, mimeType: asset.mime_type || asset.blob.type || 'application/octet-stream' }),
          });
          if (response.ok) {
            const result = await response.json().catch(() => ({}));
            const storedAssetId = typeof result.url === 'string' && result.url.startsWith('asset://')
              ? result.url.slice('asset://'.length)
              : assetId;
            const serverUrl = resolveApiUrl(`/api/assets/${encodeURIComponent(storedAssetId)}`);
            assetUrlCache.set(assetUrl, serverUrl);
            return serverUrl;
          }
        } catch {
          // Keep the local copy usable while offline; it can be uploaded on a later read.
        }
      }
      const objectUrl = URL.createObjectURL(asset.blob);
      assetUrlCache.set(assetUrl, objectUrl);
      return objectUrl;
    }
  } catch (err) {
    console.warn('[AssetResolver] Local asset lookup failed:', err);
  }

  // Legacy asset:// links may have been created on another client. Resolve them
  // from the shared server asset store when server mode is enabled.
  const isFileProtocol = typeof window !== 'undefined' && window.location.protocol.startsWith('file:');
  if (typeof localStorage !== 'undefined' && !isFileProtocol && localStorage.getItem('wonbee_use_server') !== 'false') {
    const serverUrl = resolveApiUrl(`/api/assets/${encodeURIComponent(assetId)}`);
    assetUrlCache.set(assetUrl, serverUrl);
    return serverUrl;
  }
  return '';
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
  const assetRegex = /src=["'](asset:\/\/[^"']+)["']/g;
  let match;
  const assetUrls = new Set<string>();

  while ((match = assetRegex.exec(html)) !== null) {
    assetUrls.add(match[1]);
  }

  for (const assetUrl of assetUrls) {
    const resolvedUrl = await resolveAssetUrl(assetUrl);
    if (resolvedUrl !== assetUrl) {
      resolved = resolved.replaceAll(`src="${assetUrl}"`, `src="${resolvedUrl}"`);
      resolved = resolved.replaceAll(`src='${assetUrl}'`, `src='${resolvedUrl}'`);
    }
  }

  return resolved;
}
