import { wonbeeDexieDB } from '../services/storage/dexieDb';
import { fetchBridge } from '../services/httpBridge';
import { STORAGE_KEYS } from '../constants/storageKeys';

function createAssetId(): string {
  const cryptoApi = globalThis.crypto;
  if (typeof cryptoApi?.randomUUID === 'function') return cryptoApi.randomUUID();
  if (typeof cryptoApi?.getRandomValues === 'function') {
    const bytes = cryptoApi.getRandomValues(new Uint8Array(16));
    return Array.from(bytes, value => value.toString(16).padStart(2, '0')).join('');
  }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`;
}

export async function storeNoteImage(blob: Blob, filename: string) {
  const id = `asset-${createAssetId()}`;
  await wonbeeDexieDB.saveAsset({ id, blob, filename, mime_type: blob.type, created_at: Date.now(), is_dirty: 1 });
  return { id, url: `asset://${id}` };
}
export async function duplicateNoteImageAssets(html: string): Promise<string> {
  const refs = [...new Set([...html.matchAll(/(?:src|data-asset-src)=["'](asset:\/\/[^"']+)["']/g)].map(match => match[1]))];
  let copied = html;
  for (const ref of refs) {
    const oldId = ref.slice('asset://'.length);
    let asset = await wonbeeDexieDB.getAsset(oldId);
    if (!asset?.blob && localStorage.getItem(STORAGE_KEYS.useServer) !== 'false') {
      try {
        const response = await fetchBridge(`/api/assets/${encodeURIComponent(oldId)}`);
        if (response.ok) {
          const blob = await response.blob();
          asset = { id: oldId, blob, filename: `copied-${oldId}`, mime_type: blob.type || 'application/octet-stream', created_at: Date.now(), is_dirty: 1 };
        }
      } catch { /* Preserve the original asset reference if it cannot be fetched. */ }
    }
    if (!asset?.blob) continue;
    const newId = `asset-${createAssetId()}`;
    await wonbeeDexieDB.saveAsset({ ...asset, id: newId, filename: asset.filename, created_at: Date.now(), is_dirty: 1 });
    copied = copied.replaceAll(ref, `asset://${newId}`);
  }
  return copied;
}
export async function discardNoteImages(ids: string[]) {
  await wonbeeDexieDB.assets.bulkDelete(ids);
}
export async function noteImageDataUrl(src: string): Promise<string | null> {
  if (/^data:image\/(png|jpe?g|gif|webp);base64,/i.test(src)) return src;
  if (!/^asset:\/\/[a-zA-Z0-9_-]+$/.test(src)) return null;
  const id = src.slice('asset://'.length);
  let blob = (await wonbeeDexieDB.getAsset(id))?.blob;
  if (!blob && localStorage.getItem(STORAGE_KEYS.useServer) !== 'false') {
    const response = await fetchBridge(`/api/assets/${encodeURIComponent(id)}`);
    if (!response.ok) throw new Error('노트의 원본 이미지가 저장소에 없습니다.');
    blob = await response.blob();
  }
  if (!blob || !/^image\/(png|jpe?g|gif|webp)$/i.test(blob.type)) throw new Error('노트의 이미지를 읽을 수 없습니다.');
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}
