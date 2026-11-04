import { wonbeeDexieDB } from '../services/storage/dexieDb';
import { fetchBridge } from '../services/httpBridge';

export async function storeNoteImage(blob: Blob, filename: string) {
  const id = `asset-${crypto.randomUUID()}`;
  await wonbeeDexieDB.saveAsset({ id, blob, filename, mime_type: blob.type, created_at: Date.now(), is_dirty: 1 });
  return { id, url: `asset://${id}` };
}
export async function discardNoteImages(ids: string[]) {
  await wonbeeDexieDB.assets.bulkDelete(ids);
}
export async function noteImageDataUrl(src: string): Promise<string | null> {
  if (/^data:image\/(png|jpe?g|gif|webp);base64,/i.test(src)) return src;
  if (!/^asset:\/\/[a-zA-Z0-9_-]+$/.test(src)) return null;
  const id = src.slice('asset://'.length);
  let blob = (await wonbeeDexieDB.getAsset(id))?.blob;
  if (!blob && localStorage.getItem('wonbee_use_server') !== 'false') {
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
