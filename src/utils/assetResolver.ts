import { wonbeeDexieDB } from '../services/storage/dexieDb';

const assetUrlCache = new Map<string, string>();

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

  const urlMap = new Map<string, string>();
  const promises: Promise<void>[] = [];

  for (const assetUrl of assetUrls) {
    if (assetUrl.startsWith('asset://')) {
      if (assetUrlCache.has(assetUrl)) {
        urlMap.set(assetUrl, assetUrlCache.get(assetUrl)!);
        continue;
      }
      const assetId = assetUrl.replace('asset://', '');
      promises.push(
        wonbeeDexieDB.getAsset(assetId)
          .then((asset) => {
            if (asset && asset.blob) {
              const blobUrl = URL.createObjectURL(asset.blob);
              assetUrlCache.set(assetUrl, blobUrl);
              urlMap.set(assetUrl, blobUrl);
            }
          })
          .catch((err) => {
            console.warn('[AssetResolver] Failed to fetch asset for HTML view:', err);
          })
      );
    }
  }

  if (promises.length > 0) {
    await Promise.all(promises);
  }

  for (const [assetUrl, blobUrl] of urlMap.entries()) {
    resolved = resolved.replaceAll(`src="${assetUrl}"`, `src="${blobUrl}"`);
    resolved = resolved.replaceAll(`src='${assetUrl}'`, `src='${blobUrl}'`);
  }

  return resolved;
}
