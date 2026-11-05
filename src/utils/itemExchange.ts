import JSZip from 'jszip';
import type { CalendarEvent, TableDocument, TreeItem, WonNoteDocument } from '../types';

import { FILE_LIMITS } from '../constants/limits';
import { HTML_ALLOWED_ATTRIBUTES, HTML_ALLOWED_TAGS, HTML_ALLOWED_STYLE_VALUES } from '../constants/htmlSanitizer';

export const EXCHANGE_LIMIT = FILE_LIMITS.exchangeBytes;
export interface SharedAsset {
  id: string;
  mime: string;
  bytes: Uint8Array;
}
export interface SharedItem {
  kind: 'document' | 'table';
  item: WonNoteDocument | TableDocument;
  tree: Pick<TreeItem, 'icon' | 'color'>;
  events: CalendarEvent[];
  layouts: Record<string, unknown>;
  assets: SharedAsset[];
}
export interface SharedFolder {
  kind: 'folder';
  root: TreeItem;
  tree: TreeItem[];
  documents: Record<string, WonNoteDocument>;
  tables: Record<string, TableDocument>;
  events: Record<string, CalendarEvent[]>;
  layouts: Record<string, Record<string, unknown>>;
  assets: SharedAsset[];
}
const imageRefs =
  /asset:\/\/[a-zA-Z0-9_-]+|(?:https?:\/\/[^\s"'<>]+)?\/api\/(?:images|assets)\/[a-zA-Z0-9_-]+|data:image\/(?:png|jpe?g|gif|webp);base64,[a-zA-Z0-9+/=]+/g;
const id = (prefix: string) => `${prefix}-${crypto.randomUUID()}`;
const mimeAllowed = /^image\/(png|jpeg|gif|webp)$/;
function strings(value: unknown, transform: (value: string) => string): any {
  if (typeof value === 'string') return transform(value);
  if (Array.isArray(value)) return value.map((v) => strings(v, transform));
  if (value && typeof value === 'object')
    return Object.fromEntries(
      Object.entries(value).map(([key, v]) => {
        if (['__proto__', 'constructor', 'prototype'].includes(key)) throw new Error('허용되지 않는 데이터 키입니다.');
        return [key, strings(v, transform)];
      }),
    );
  return value;
}
function validate(item: any, kind: string) {
  if (!item || typeof item.id !== 'string' || typeof item.title !== 'string')
    throw new Error('항목 ID 또는 제목이 올바르지 않습니다.');
  if (kind === 'document') {
    if (typeof item.content !== 'string') throw new Error('노트 본문이 올바르지 않습니다.');
  } else if (kind === 'table') {
    if (!Array.isArray(item.columns) || !Array.isArray(item.rows)) throw new Error('테이블 형식이 올바르지 않습니다.');
    const columns = new Set<string>(),
      rows = new Set<string>();
    for (const col of item.columns) {
      if (
        typeof col?.id !== 'string' ||
        columns.has(col.id) ||
        typeof col.name !== 'string' ||
        !['text', 'number', 'select', 'status', 'date', 'checkbox', 'richText', 'code', 'image'].includes(col.type)
      )
        throw new Error('테이블 열 정보가 올바르지 않습니다.');
      columns.add(col.id);
    }
    for (const row of item.rows) {
      if (
        typeof row?.id !== 'string' ||
        rows.has(row.id) ||
        !row.data ||
        typeof row.data !== 'object' ||
        Array.isArray(row.data)
      )
        throw new Error('테이블 행 정보가 올바르지 않습니다.');
      rows.add(row.id);
    }
  } else throw new Error('노트 또는 테이블만 전달할 수 있습니다.');
}
const cleanHtml = (html: string): string => {
  if (typeof DOMParser === 'undefined') return html.replace(/<[^>]*>/g, ' ');
  const parsed = new DOMParser().parseFromString(html, 'text/html');
  const allElements = Array.from(parsed.body.querySelectorAll('*')).reverse();
  for (const element of allElements) {
    const tag = element.tagName.toLowerCase();
    if (!HTML_ALLOWED_TAGS.has(tag)) {
      if (['script', 'style', 'iframe', 'object', 'embed', 'svg', 'math', 'template'].includes(tag)) element.remove();
      else element.replaceWith(...Array.from(element.childNodes));
      continue;
    }
    const globalAllowed = HTML_ALLOWED_ATTRIBUTES['*'];
    const tagAllowed = HTML_ALLOWED_ATTRIBUTES[tag] || [];
    for (const attribute of Array.from(element.attributes)) {
      const name = attribute.name.toLowerCase();
      if (name.startsWith('on') || (!globalAllowed.includes(name) && !tagAllowed.includes(name))) {
        element.removeAttribute(attribute.name);
        continue;
      }
      if (name === 'href' || name === 'src') {
        const value = attribute.value.trim();
        const normalizedValue = value.replace(/[\u0000-\u0020]+/g, '');
        const protocol = normalizedValue.match(/^([a-z][a-z\d+.-]*):/i)?.[1]?.toLowerCase();
        const allowed = !normalizedValue.startsWith('//') && (!protocol || (tag === 'img'
          ? protocol === 'asset' || (protocol === 'data' && /^data:image\/(png|jpe?g|gif|webp);base64,/i.test(value))
          : ['http', 'https', 'mailto'].includes(protocol)));
        if (!allowed) element.removeAttribute(attribute.name);
      }
      if (name === 'style') {
        const styleElement = element as HTMLElement;
        const styles: string[] = [];
        for (const property of Array.from(styleElement.style)) {
          const value = styleElement.style.getPropertyValue(property).trim();
          if (HTML_ALLOWED_STYLE_VALUES[property]?.test(value)) styles.push(`${property}: ${value}`);
        }
        if (styles.length) element.setAttribute('style', styles.join('; '));
        else element.removeAttribute('style');
      }
    }
    if (tag === 'a' && element.getAttribute('target') === '_blank') element.setAttribute('rel', 'noopener noreferrer');
  }
  return parsed.body.innerHTML;
};

export async function packItem(
  source: Omit<SharedItem, 'assets'>,
  readImage: (ref: string) => Promise<{ mime: string; bytes: Uint8Array }>,
): Promise<Uint8Array> {
  validate(source.item, source.kind);
  const refs = new Set<string>();
  strings(source, (text) => {
    for (const match of text.matchAll(imageRefs)) refs.add(match[0]);
    return text;
  });
  const zip = new JSZip(),
    replacements = new Map<string, string>();
  const assets: { id: string; path: string; mime: string; size: number }[] = [];
  let total = 0;
  for (const ref of refs) {
    const asset = await readImage(ref);
    if (!mimeAllowed.test(asset.mime)) throw new Error('지원하지 않는 이미지 형식이 포함되어 있습니다.');
    total += asset.bytes.length;
    if (total > EXCHANGE_LIMIT) throw new Error('교환 파일의 이미지 합계는 250MB 이하여야 합니다.');
    const assetId = `image-${assets.length + 1}`,
      path = `assets/${assetId}`;
    zip.file(path, asset.bytes, { compression: 'STORE' });
    replacements.set(ref, `asset://${assetId}`);
    assets.push({ id: assetId, path, mime: asset.mime, size: asset.bytes.length });
  }
  const payload = strings(source, (text) => text.replace(imageRefs, (ref) => replacements.get(ref) || ref));
  zip.file(
    'item.json',
    JSON.stringify({ format: 'wonnote-item', version: 1, exportedAt: Date.now(), ...payload, assets }),
  );
  const bytes = await zip.generateAsync({ type: 'uint8array', compression: 'DEFLATE', compressionOptions: { level: 3 } });
  if (bytes.length > EXCHANGE_LIMIT) throw new Error('교환 파일은 250MB 이하여야 합니다.');
  return bytes;
}

export async function packFolder(
  source: Omit<SharedFolder, 'assets'>,
  readImage: (ref: string) => Promise<{ mime: string; bytes: Uint8Array }>,
): Promise<Blob> {
  if (!source.root || source.root.type !== 'folder' || !source.tree.some((item) => item.id === source.root.id))
    throw new Error('폴더 정보가 올바르지 않습니다.');
  const ids = new Set<string>();
  for (const item of source.tree) {
    if (!item?.id || ids.has(item.id)) throw new Error('폴더 안에 중복되거나 잘못된 항목이 있습니다.');
    ids.add(item.id);
  }
  if (source.tree.some((item) => item.id !== source.root.id && (!item.parentId || !ids.has(item.parentId))))
    throw new Error('폴더에 포함된 항목의 위치 정보가 올바르지 않습니다.');
  for (const item of source.tree) {
    if (item.type === 'document') validate(source.documents[item.id], 'document');
    if (item.type === 'table') validate(source.tables[item.id], 'table');
  }
  const refs = new Set<string>();
  strings(source, (text) => { for (const match of text.matchAll(imageRefs)) refs.add(match[0]); return text; });
  const zip = new JSZip(), replacements = new Map<string, string>();
  const assets: { id: string; path: string; mime: string; size: number }[] = [];
  let total = 0;
  for (const ref of refs) {
    const asset = await readImage(ref);
    if (!mimeAllowed.test(asset.mime)) throw new Error('지원하지 않는 이미지 형식이 포함되어 있습니다.');
    total += asset.bytes.length;
    if (total > EXCHANGE_LIMIT) throw new Error('교환 파일의 이미지 합계는 250MB 이하여야 합니다.');
    const assetId = `image-${assets.length + 1}`, path = `assets/${assetId}`;
    zip.file(path, asset.bytes, { compression: 'STORE' }); replacements.set(ref, `asset://${assetId}`);
    assets.push({ id: assetId, path, mime: asset.mime, size: asset.bytes.length });
  }
  const payload = strings(source, (text) => text.replace(imageRefs, (ref) => replacements.get(ref) || ref));
  zip.file('folder.json', JSON.stringify({ format: 'wonnote-folder', version: 1, exportedAt: Date.now(), ...payload, assets }));
  const blob = await zip.generateAsync({ type: 'blob', compression: 'DEFLATE', compressionOptions: { level: 3 } });
  if (blob.size > EXCHANGE_LIMIT) throw new Error('교환 파일은 250MB 이하여야 합니다.');
  return blob;
}

export async function unpackFolder(bytes: Uint8Array): Promise<SharedFolder> {
  if (bytes.length > EXCHANGE_LIMIT) throw new Error('교환 파일은 250MB 이하여야 합니다.');
  const zip = await JSZip.loadAsync(bytes);
  let expanded = 0;
  for (const entry of Object.values(zip.files)) {
    expanded += Number((entry as any)._data?.uncompressedSize || 0);
    if (expanded > EXCHANGE_LIMIT) throw new Error('압축 해제한 교환 파일이 250MB를 초과합니다.');
  }
  const metadata = zip.file('folder.json');
  if (!metadata || Number((metadata as any)._data?.uncompressedSize || 0) > 50 * 1024 * 1024)
    throw new Error('폴더 교환 파일 정보를 읽을 수 없습니다.');
  const payload = JSON.parse(await metadata.async('string'));
  if (payload.format !== 'wonnote-folder' || payload.version !== 1 || !Array.isArray(payload.assets) || !Array.isArray(payload.tree))
    throw new Error('지원하지 않는 폴더 교환 파일 버전입니다.');
  if (!payload.root || payload.root.type !== 'folder' || !payload.tree.some((item: TreeItem) => item.id === payload.root.id))
    throw new Error('폴더 정보가 올바르지 않습니다.');
  const assets: SharedAsset[] = [], assetIds = new Set<string>();
  for (const asset of payload.assets) {
    if (!/^[\w-]+$/.test(asset.id) || assetIds.has(asset.id) || asset.path !== `assets/${asset.id}` || !mimeAllowed.test(asset.mime))
      throw new Error('이미지 목록이 올바르지 않습니다.');
    assetIds.add(asset.id);
    const entry = zip.file(asset.path);
    if (!entry) throw new Error('교환 파일에 필요한 이미지가 없습니다.');
    const content = await entry.async('uint8array');
    if (content.length !== asset.size) throw new Error('교환 파일 이미지 크기가 일치하지 않습니다.');
    assets.push({ id: asset.id, mime: asset.mime, bytes: content });
  }
  const ids = new Set<string>();
  for (const item of payload.tree as TreeItem[]) {
    if (!item?.id || ids.has(item.id) || !['folder', 'document', 'table'].includes(item.type)) throw new Error('폴더 안의 항목 정보가 올바르지 않습니다.');
    ids.add(item.id);
    if (item.id !== payload.root.id && (!item.parentId || !payload.tree.some((parent: TreeItem) => parent.id === item.parentId))) throw new Error('폴더 항목의 상위 위치가 없습니다.');
    if (item.type === 'document') validate(payload.documents?.[item.id], 'document');
    if (item.type === 'table') validate(payload.tables?.[item.id], 'table');
  }
  strings({ documents: payload.documents || {}, tables: payload.tables || {} }, (text) => {
    for (const ref of text.matchAll(/asset:\/\/([a-zA-Z0-9_-]+)/g)) if (!assetIds.has(ref[1])) throw new Error('누락된 이미지가 포함된 폴더 파일입니다.');
    return text;
  });
  return { kind: 'folder', root: payload.root, tree: payload.tree, documents: payload.documents || {}, tables: payload.tables || {}, events: payload.events || {}, layouts: payload.layouts || {}, assets };
}

export function materializeFolder(shared: SharedFolder, targetParentId: string | null = null) {
  const idMap = new Map(shared.tree.map((item) => [item.id, id(item.type === 'folder' ? 'folder' : item.type === 'table' ? 'table' : 'doc')]));
  const assetMap = new Map(shared.assets.map((asset) => [asset.id, id('asset')]));
  const rewrite = (text: string) => text.replace(/asset:\/\/([a-zA-Z0-9_-]+)/g, (_, old) => `asset://${assetMap.get(old) || old}`);
  const tree = shared.tree.map((item) => ({ ...item, id: idMap.get(item.id)!, parentId: item.id === shared.root.id ? targetParentId : item.parentId ? idMap.get(item.parentId) || null : null,
    title: item.id === shared.root.id ? `${item.title} (받은 사본)` : item.title, createdAt: Date.now(), updatedAt: Date.now() }));
  const documents = Object.fromEntries(Object.entries(shared.documents).map(([oldId, doc]) => {
    const item = strings(doc, rewrite) as WonNoteDocument; item.id = idMap.get(oldId)!; item.content = cleanHtml(item.content); return [item.id, item];
  }));
  const tables = Object.fromEntries(Object.entries(shared.tables).map(([oldId, table]) => {
    const item = strings(table, rewrite) as TableDocument;
    item.id = idMap.get(oldId)!;
    const richTextColumns = new Set(item.columns.filter(column => column.type === 'richText').map(column => column.id));
    item.rows = item.rows.map(row => ({
      ...row,
      data: Object.fromEntries(Object.entries(row.data).map(([key, value]) => [key, richTextColumns.has(key) && typeof value === 'string' ? cleanHtml(value) : value])),
      richContent: row.richContent ? cleanHtml(row.richContent) : row.richContent,
      stickers: row.stickers?.map(sticker => ({ ...sticker, content: typeof sticker.content === 'string' ? cleanHtml(sticker.content) : sticker.content })),
    }));
    return [item.id, item];
  }));
  const events: Record<string, CalendarEvent[]> = {}, layouts: Record<string, Record<string, unknown>> = {};
  for (const [oldId, newId] of idMap) if (shared.tables[oldId]) { events[newId] = (shared.events[oldId] || []).map((event) => ({ ...event, id: id('event') })); layouts[newId] = shared.layouts[oldId] || {}; }
  return { kind: 'folder' as const, root: tree.find((item) => item.id === idMap.get(shared.root.id))!, tree, documents, tables, events, layouts,
    assets: shared.assets.map((asset) => ({ ...asset, id: assetMap.get(asset.id)! })) };
}

export function sanitizeSharedFolderHtml(shared: SharedFolder, sanitize: (html: string) => string): SharedFolder {
  const documents = Object.fromEntries(Object.entries(shared.documents).map(([id, document]) => [id, { ...document, content: sanitize(document.content) }]));
  const tables = Object.fromEntries(Object.entries(shared.tables).map(([id, table]) => {
    const richTextColumns = new Set(table.columns.filter(column => column.type === 'richText').map(column => column.id));
    return [id, {
      ...table,
      rows: table.rows.map(row => ({
        ...row,
        data: Object.fromEntries(Object.entries(row.data).map(([key, value]) => [key, richTextColumns.has(key) && typeof value === 'string' ? sanitize(value) : value])),
        richContent: row.richContent ? sanitize(row.richContent) : row.richContent,
        stickers: row.stickers?.map(sticker => ({ ...sticker, content: typeof sticker.content === 'string' ? sanitize(sticker.content) : sticker.content })),
      })),
    }];
  }));
  return { ...shared, documents, tables };
}

export async function unpackItem(bytes: Uint8Array): Promise<SharedItem> {
  if (bytes.length > EXCHANGE_LIMIT) throw new Error('교환 파일은 250MB 이하여야 합니다.');
  let zip: JSZip;
  try {
    zip = await JSZip.loadAsync(bytes);
  } catch {
    throw new Error('유효한 .wonnote 교환 파일이 아닙니다.');
  }
  // Bound decompression before allocating entry contents.
  let expanded = 0;
  for (const entry of Object.values(zip.files)) {
    expanded += Number((entry as any)._data?.uncompressedSize || 0);
    if (expanded > EXCHANGE_LIMIT) throw new Error('압축 해제한 교환 파일이 250MB를 초과합니다.');
  }
  const metadata = zip.file('item.json');
  if (!metadata || Number((metadata as any)._data?.uncompressedSize || 0) > 50 * 1024 * 1024)
    throw new Error('교환 파일의 항목 정보를 읽을 수 없습니다.');
  const parsed = JSON.parse(await metadata.async('string'));
  const payload = strings(parsed, (value) => value);
  if (payload.format !== 'wonnote-item' || payload.version !== 1 || !Array.isArray(payload.assets))
    throw new Error('지원하지 않는 교환 파일 버전입니다.');
  validate(payload.item, payload.kind);
  const assets: SharedAsset[] = [],
    ids = new Set<string>();
  for (const asset of payload.assets) {
    if (
      !/^[a-zA-Z0-9_-]+$/.test(asset.id) ||
      ids.has(asset.id) ||
      asset.path !== `assets/${asset.id}` ||
      !mimeAllowed.test(asset.mime)
    )
      throw new Error('이미지 목록이 올바르지 않습니다.');
    ids.add(asset.id);
    const entry = zip.file(asset.path);
    if (!entry) throw new Error('교환 파일에 필요한 이미지가 없습니다.');
    const content = await entry.async('uint8array');
    if (content.length !== asset.size) throw new Error('교환 파일의 이미지 크기가 일치하지 않습니다.');
    assets.push({ id: asset.id, mime: asset.mime, bytes: content });
  }
  strings(payload.item, (text) => {
    for (const ref of text.matchAll(/asset:\/\/([a-zA-Z0-9_-]+)/g))
      if (!ids.has(ref[1])) throw new Error('누락된 이미지가 포함된 교환 파일입니다.');
    return text;
  });
  const events = payload.events || [];
  if (
    !Array.isArray(events) ||
    events.some(
      (event) =>
        !event ||
        typeof event.id !== 'string' ||
        typeof event.title !== 'string' ||
        typeof event.startDate !== 'string' ||
        typeof event.endDate !== 'string',
    )
  )
    throw new Error('일정 정보가 올바르지 않습니다.');
  return {
    kind: payload.kind,
    item: payload.item,
    tree: { icon: payload.tree?.icon, color: payload.tree?.color },
    events,
    layouts: payload.layouts || {},
    assets,
  };
}

export function materializeItem(shared: SharedItem, parentId: string | null = null, sanitize: (html: string) => string = cleanHtml) {
  const now = Date.now(),
    newId = id(shared.kind === 'document' ? 'doc' : 'table');
  const assetMap = new Map(shared.assets.map((asset) => [asset.id, id('asset')]));
  const rewrite = (text: string) =>
    text.replace(/asset:\/\/([a-zA-Z0-9_-]+)/g, (_, old) => `asset://${assetMap.get(old) || old}`);
  const item: any = strings(shared.item, rewrite);
  item.id = newId;
  item.title = `${item.title} (받은 사본)`;
  item.createdAt = now;
  item.updatedAt = now;
  const rowMap = new Map<string, string>();
  if (shared.kind === 'document') item.content = sanitize(item.content);
  else {
    const colMap = new Map<string, string>(item.columns.map((col) => [col.id, id('col')]));
    item.columns = item.columns.map((col) => ({ ...col, id: colMap.get(col.id) }));
    item.rows = item.rows.map((row) => {
      const rowId = id('row');
      rowMap.set(row.id, rowId);
      const data = Object.fromEntries(
        Object.entries(row.data)
          .filter(([key]) => colMap.has(key))
          .map(([key, value]) => [
            colMap.get(key)!,
            typeof value === 'string' && item.columns.find((col) => col.id === colMap.get(key))?.type === 'richText'
              ? sanitize(value)
              : value,
          ]),
      );
      return {
        ...row,
        id: rowId,
        data,
        richContent: row.richContent ? sanitize(row.richContent) : row.richContent,
        stickers: row.stickers?.map((s) => ({
          ...s,
          id: id('sticker'),
          content: typeof s.content === 'string' ? sanitize(s.content) : s.content,
        })),
        createdAt: now,
        updatedAt: now,
        is_dirty: 1,
      };
    });
  }
  const tree: TreeItem = {
    id: newId,
    parentId,
    title: item.title,
    type: shared.kind,
    ...shared.tree,
    createdAt: now,
    updatedAt: now,
  };
  return {
    kind: shared.kind,
    item: item as WonNoteDocument | TableDocument,
    tree,
    assets: shared.assets.map((asset) => ({ ...asset, id: assetMap.get(asset.id)! })),
    events: shared.events.map((event) => ({
      ...event,
      id: id('event'),
      tableRowId: event.tableRowId ? rowMap.get(event.tableRowId) : undefined,
      createdAt: now,
      updatedAt: now,
    })),
    layouts: Object.fromEntries(
      Object.entries(shared.layouts)
        .filter(([key]) => rowMap.has(key))
        .map(([key, layout]) => [rowMap.get(key)!, { ...(layout as object), rowId: rowMap.get(key)! }]),
    ),
  };
}
