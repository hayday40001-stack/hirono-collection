import type { Database } from '../db/store.ts';
import { nowIso } from '../db/store.ts';
import { httpUrl, s, type Result, type Schema } from '../domain/schema.ts';
import type { CollectionEntry, CustomImage, Item, Photo, Series, Settings, StatusEvent, WishlistEntry } from '../domain/types.ts';
import { DEFAULT_SETTINGS } from '../domain/types.ts';
import { collectionEntrySchema, itemSchema, seriesSchema, statusEventSchema, wishlistEntrySchema } from '../domain/validators.ts';
import { DATA_VERSION } from '../db/migrations.ts';

export const BACKUP_FORMAT = 'hirono-collection-backup';
export const PHOTO_BACKUP_FORMAT = 'hirono-collection-photos';
export const BACKUP_SCHEMA_VERSION = 1;

export type BackupScope = 'all' | 'collection' | 'wishlist';

export interface BackupFile {
  format: typeof BACKUP_FORMAT;
  schema_version: number;
  data_version: number;
  app_version: string;
  created_at: string;
  scope: BackupScope;
  collection: CollectionEntry[];
  wishlist: WishlistEntry[];
  status_history: StatusEvent[];
  local_catalog: { series: Series[]; items: Item[] };
  custom_images: CustomImage[];
  settings: Partial<Settings> | null;
}

const settingsSchema: Schema<Partial<Settings>> = {
  parse(v, p = '') {
    if (typeof v !== 'object' || v === null || Array.isArray(v)) return { ok: false, errors: [`${p}: expected an object`] };
    const src = v as Record<string, unknown>;
    const out: Partial<Settings> = {};
    if (src.theme === 'system' || src.theme === 'light' || src.theme === 'dark') out.theme = src.theme;
    if (typeof src.display_currency === 'string' && /^[A-Z]{3}$/.test(src.display_currency)) out.display_currency = src.display_currency;
    if (typeof src.hide_values === 'boolean') out.hide_values = src.hide_values;
    const prof = src.profile as Record<string, unknown> | undefined;
    if (prof && typeof prof === 'object') {
      out.profile = {
        display_name: typeof prof.display_name === 'string' ? prof.display_name.slice(0, 80) : '',
        bio: typeof prof.bio === 'string' ? prof.bio.slice(0, 1000) : '',
        avatar_data_url: typeof prof.avatar_data_url === 'string' && /^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(prof.avatar_data_url) ? prof.avatar_data_url : null,
      };
    }
    return { ok: true, value: out };
  },
};

const backupSchema: Schema<BackupFile> = s.object<BackupFile>({
  format: s.literal(BACKUP_FORMAT),
  schema_version: s.number({ int: true, min: 1 }),
  data_version: s.number({ int: true, min: 0 }),
  app_version: s.string({ max: 40 }),
  created_at: s.string({ max: 40 }),
  scope: s.enumOf(['all', 'collection', 'wishlist'] as const),
  collection: s.optional(s.array(collectionEntrySchema, { max: 100000 }), []),
  wishlist: s.optional(s.array(wishlistEntrySchema, { max: 100000 }), []),
  status_history: s.optional(s.array(statusEventSchema, { max: 500000 }), []),
  local_catalog: s.optional(s.object({ series: s.array(seriesSchema), items: s.array(itemSchema) }), { series: [], items: [] }),
  custom_images: s.optional(s.array(s.object<CustomImage>({ item_id: s.string({ min: 1, max: 160 }), url: httpUrl, updated_at: s.string({ max: 40 }) }), { max: 100000 }), []),
  settings: s.optional(s.nullable(settingsSchema), null),
});

export async function createBackup(db: Database, scope: BackupScope, appVersion: string): Promise<BackupFile> {
  return db.read(['collection', 'wishlist', 'statusHistory', 'items', 'series', 'settings', 'customImages'], async (tx) => {
    const wantCollection = scope === 'all' || scope === 'collection';
    const wantWishlist = scope === 'all' || scope === 'wishlist';
    const settings = await tx.get<Settings>('settings', 'settings');
    return {
      format: BACKUP_FORMAT,
      schema_version: BACKUP_SCHEMA_VERSION,
      data_version: DATA_VERSION,
      app_version: appVersion,
      created_at: nowIso(),
      scope,
      collection: wantCollection ? await tx.getAll<CollectionEntry>('collection') : [],
      wishlist: wantWishlist ? await tx.getAll<WishlistEntry>('wishlist') : [],
      status_history: wantCollection ? await tx.getAll<StatusEvent>('statusHistory') : [],
      local_catalog:
        scope === 'all'
          ? {
              series: (await tx.getAll<Series>('series')).filter((x) => x.origin === 'local'),
              items: (await tx.getAll<Item>('items')).filter((x) => x.origin === 'local'),
            }
          : { series: [], items: [] },
      custom_images: scope === 'all' ? await tx.getAll<CustomImage>('customImages') : [],
      settings: scope === 'all' && settings ? { theme: settings.theme, display_currency: settings.display_currency, hide_values: settings.hide_values, profile: settings.profile } : null,
    };
  });
}

export function parseBackup(text: string): Result<BackupFile> {
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    return { ok: false, errors: ['ไฟล์นี้ไม่ใช่ JSON ที่ถูกต้อง'] };
  }
  if (typeof json === 'object' && json && (json as { format?: unknown }).format === PHOTO_BACKUP_FORMAT) {
    return { ok: false, errors: ['นี่คือไฟล์สำรองรูปภาพ ให้นำเข้าที่ส่วน “รูปถ่าย” แทน'] };
  }
  if (typeof json !== 'object' || json === null || (json as { format?: unknown }).format !== BACKUP_FORMAT) {
    return { ok: false, errors: ['ไฟล์นี้ไม่ใช่ไฟล์ Backup ของ HIRONO Collection'] };
  }
  const r = backupSchema.parse(json);
  if (!r.ok) return { ok: false, errors: r.errors.slice(0, 20) };
  if (r.value.schema_version > BACKUP_SCHEMA_VERSION || r.value.data_version > DATA_VERSION) {
    return { ok: false, errors: ['ไฟล์นี้สร้างจากแอปเวอร์ชันใหม่กว่า กรุณาอัปเดตแอปก่อนนำเข้า'] };
  }
  const errors: string[] = [];
  const dup = (ids: string[], label: string) => {
    const seen = new Set<string>();
    for (const id of ids) {
      if (seen.has(id)) errors.push(`พบ ${label} ซ้ำในไฟล์: ${id}`);
      seen.add(id);
    }
  };
  dup(r.value.collection.map((e) => e.item_id), 'รายการ Collection');
  dup(r.value.wishlist.map((e) => e.item_id), 'รายการ Wishlist');
  dup(r.value.status_history.map((e) => e.id), 'ประวัติ');
  dup(r.value.local_catalog.items.map((e) => e.id), 'สินค้าที่เพิ่มเอง');
  if (r.value.local_catalog.items.some((i) => i.origin !== 'local')) errors.push('local_catalog มีรายการที่ไม่ได้มาจากเครื่องผู้ใช้');
  return errors.length ? { ok: false, errors: errors.slice(0, 20) } : r;
}

export type ImportMode = 'merge' | 'replace';

export interface ImportCounts {
  add: number;
  update: number;
  skip: number;
}

export interface ImportPreview {
  mode: ImportMode;
  collection: ImportCounts;
  wishlist: ImportCounts;
  history: ImportCounts;
  localItems: ImportCounts;
  /** Entries in the file whose item is not in this device's catalog yet. They are kept and appear after a catalog update. */
  unknownItems: number;
  /** Current rows that a replace would remove. */
  willRemove: number;
}

function countMerge<T>(incoming: T[], current: Map<string, T>, key: (t: T) => string, updatedAt?: (t: T) => string): ImportCounts {
  const c: ImportCounts = { add: 0, update: 0, skip: 0 };
  for (const row of incoming) {
    const cur = current.get(key(row));
    if (!cur) c.add++;
    else if (updatedAt && updatedAt(row) > updatedAt(cur)) c.update++;
    else c.skip++;
  }
  return c;
}

async function loadPersonal(db: Database) {
  return db.read(['collection', 'wishlist', 'statusHistory', 'items', 'series', 'settings'], async (tx) => ({
    collection: await tx.getAll<CollectionEntry>('collection'),
    wishlist: await tx.getAll<WishlistEntry>('wishlist'),
    history: await tx.getAll<StatusEvent>('statusHistory'),
    items: await tx.getAll<Item>('items'),
    series: await tx.getAll<Series>('series'),
    settings: await tx.get<Settings>('settings', 'settings'),
  }));
}

export async function previewImport(db: Database, b: BackupFile, mode: ImportMode): Promise<ImportPreview> {
  const cur = await loadPersonal(db);
  const itemIds = new Set([...cur.items.map((i) => i.id), ...b.local_catalog.items.map((i) => i.id)]);
  const unknownItems = new Set([...b.collection, ...b.wishlist].map((e) => e.item_id).filter((id) => !itemIds.has(id))).size;
  const touchesCollection = b.scope !== 'wishlist';
  const touchesWishlist = b.scope !== 'collection';
  if (mode === 'replace') {
    return {
      mode,
      collection: { add: b.collection.length, update: 0, skip: 0 },
      wishlist: { add: b.wishlist.length, update: 0, skip: 0 },
      history: { add: b.status_history.length, update: 0, skip: 0 },
      localItems: countMerge(b.local_catalog.items, new Map(cur.items.map((i) => [i.id, i])), (i) => i.id),
      unknownItems,
      willRemove: (touchesCollection ? cur.collection.length : 0) + (touchesWishlist ? cur.wishlist.length : 0),
    };
  }
  return {
    mode,
    collection: countMerge(b.collection, new Map(cur.collection.map((e) => [e.item_id, e])), (e) => e.item_id, (e) => e.updated_at),
    wishlist: countMerge(b.wishlist, new Map(cur.wishlist.map((e) => [e.item_id, e])), (e) => e.item_id, (e) => e.updated_at),
    history: countMerge(b.status_history, new Map(cur.history.map((e) => [e.id, e])), (e) => e.id),
    localItems: countMerge(b.local_catalog.items, new Map(cur.items.map((i) => [i.id, i])), (i) => i.id),
    unknownItems,
    willRemove: 0,
  };
}

interface Snapshot {
  key: 'pre_import_snapshot';
  created_at: string;
  collection: CollectionEntry[];
  wishlist: WishlistEntry[];
  history: StatusEvent[];
  localItems: Item[];
  localSeries: Series[];
  settings: Settings | null;
}

const PERSONAL = ['collection', 'wishlist', 'statusHistory', 'items', 'series', 'settings', 'meta', 'customImages'] as const;

/**
 * Applies an already-validated backup in one transaction. A copy of the data
 * it replaces is stored first so the import can be undone.
 */
export async function applyImport(db: Database, b: BackupFile, mode: ImportMode): Promise<ImportPreview> {
  const preview = await previewImport(db, b, mode);
  const cur = await loadPersonal(db);
  await db.write([...PERSONAL], async (tx) => {
    const snap: Snapshot = {
      key: 'pre_import_snapshot',
      created_at: nowIso(),
      collection: cur.collection,
      wishlist: cur.wishlist,
      history: cur.history,
      localItems: cur.items.filter((i) => i.origin === 'local'),
      localSeries: cur.series.filter((x) => x.origin === 'local'),
      settings: cur.settings ?? null,
    };
    await tx.put('meta', snap);

    const touchesCollection = b.scope !== 'wishlist';
    const touchesWishlist = b.scope !== 'collection';
    if (mode === 'replace') {
      if (touchesCollection) {
        await tx.clear('collection');
        await tx.clear('statusHistory');
      }
      if (touchesWishlist) await tx.clear('wishlist');
    }
    const curCol = new Map(cur.collection.map((e) => [e.item_id, e]));
    const curWish = new Map(cur.wishlist.map((e) => [e.item_id, e]));
    const curHist = new Set(cur.history.map((e) => e.id));
    const curItems = new Set(cur.items.map((e) => e.id));
    const curSeries = new Set(cur.series.map((e) => e.id));

    for (const e of b.collection) {
      const c = curCol.get(e.item_id);
      if (mode === 'replace' || !c || e.updated_at > c.updated_at) await tx.put('collection', e);
    }
    for (const e of b.wishlist) {
      const c = curWish.get(e.item_id);
      if (mode === 'replace' || !c || e.updated_at > c.updated_at) await tx.put('wishlist', e);
    }
    for (const e of b.status_history) if (mode === 'replace' || !curHist.has(e.id)) await tx.put('statusHistory', e);
    for (const se of b.local_catalog.series) if (!curSeries.has(se.id)) await tx.put('series', se);
    for (const it of b.local_catalog.items) if (!curItems.has(it.id)) await tx.put('items', it);
    for (const im of b.custom_images) {
      const cur = await tx.get<CustomImage>('customImages', im.item_id);
      if (!cur || im.updated_at > cur.updated_at) await tx.put('customImages', im);
    }
    if (b.settings && (mode === 'replace' || !cur.settings)) {
      await tx.put('settings', { ...DEFAULT_SETTINGS, ...cur.settings, ...b.settings, key: 'settings' });
    }
  });
  return preview;
}

export async function hasUndoSnapshot(db: Database): Promise<string | null> {
  const s = await db.read(['meta'], (tx) => tx.get<Snapshot>('meta', 'pre_import_snapshot'));
  return s?.created_at ?? null;
}

/** Restores personal data to how it was just before the last import. */
export async function undoLastImport(db: Database): Promise<boolean> {
  return db.write([...PERSONAL], async (tx) => {
    const snap = await tx.get<Snapshot>('meta', 'pre_import_snapshot');
    if (!snap) return false;
    await tx.clear('collection');
    await tx.clear('wishlist');
    await tx.clear('statusHistory');
    for (const e of snap.collection) await tx.put('collection', e);
    for (const e of snap.wishlist) await tx.put('wishlist', e);
    for (const e of snap.history) await tx.put('statusHistory', e);
    const keepLocal = new Set(snap.localItems.map((i) => i.id));
    for (const it of await tx.getAll<Item>('items')) if (it.origin === 'local' && !keepLocal.has(it.id)) await tx.delete('items', it.id);
    for (const it of snap.localItems) await tx.put('items', it);
    const keepSeries = new Set(snap.localSeries.map((i) => i.id));
    for (const se of await tx.getAll<Series>('series')) if (se.origin === 'local' && !keepSeries.has(se.id)) await tx.delete('series', se.id);
    for (const se of snap.localSeries) await tx.put('series', se);
    if (snap.settings) await tx.put('settings', snap.settings);
    await tx.delete('meta', 'pre_import_snapshot');
    return true;
  });
}

// ---------- photos ----------

export interface PhotoBackupFile {
  format: typeof PHOTO_BACKUP_FORMAT;
  schema_version: number;
  created_at: string;
  photos: { id: string; item_id: string; width: number; height: number; created_at: string; mime: string; data: string }[];
}

async function blobToBase64(b: Blob): Promise<string> {
  const buf = new Uint8Array(await b.arrayBuffer());
  let bin = '';
  for (let i = 0; i < buf.length; i += 0x8000) bin += String.fromCharCode(...buf.subarray(i, i + 0x8000));
  return btoa(bin);
}

function base64ToBlob(data: string, mime: string): Blob {
  const bin = atob(data);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return new Blob([out], { type: mime });
}

export async function photoBackupSize(db: Database): Promise<{ count: number; bytes: number }> {
  const photos = await db.read(['photos'], (tx) => tx.getAll<Photo>('photos'));
  // base64 adds about a third on top of the raw image size
  return { count: photos.length, bytes: Math.round(photos.reduce((n, p) => n + p.blob.size, 0) * 1.34) };
}

export async function createPhotoBackup(db: Database): Promise<PhotoBackupFile> {
  const photos = await db.read(['photos'], (tx) => tx.getAll<Photo>('photos'));
  return {
    format: PHOTO_BACKUP_FORMAT,
    schema_version: 1,
    created_at: nowIso(),
    photos: await Promise.all(
      photos.map(async (p) => ({ id: p.id, item_id: p.item_id, width: p.width, height: p.height, created_at: p.created_at, mime: p.blob.type || 'image/jpeg', data: await blobToBase64(p.blob) })),
    ),
  };
}

export async function importPhotoBackup(db: Database, text: string): Promise<Result<{ added: number; skipped: number }>> {
  let json: PhotoBackupFile;
  try {
    json = JSON.parse(text);
  } catch {
    return { ok: false, errors: ['ไฟล์นี้ไม่ใช่ JSON ที่ถูกต้อง'] };
  }
  if (json?.format !== PHOTO_BACKUP_FORMAT || !Array.isArray(json.photos)) return { ok: false, errors: ['ไฟล์นี้ไม่ใช่ไฟล์สำรองรูปภาพ'] };
  const valid = json.photos.filter(
    (p) => typeof p.id === 'string' && typeof p.item_id === 'string' && typeof p.data === 'string' && /^image\/(jpeg|png|webp)$/.test(p.mime) && /^[A-Za-z0-9+/=]*$/.test(p.data),
  );
  if (valid.length !== json.photos.length) return { ok: false, errors: [`มีรูป ${json.photos.length - valid.length} รายการที่ไม่ถูกต้อง ไฟล์อาจเสียหาย`] };
  const existing = new Set((await db.read(['photos'], (tx) => tx.getAll<Photo>('photos'))).map((p) => p.id));
  let added = 0;
  await db.write(['photos'], async (tx) => {
    for (const p of valid) {
      if (existing.has(p.id)) continue;
      await tx.put<Photo>('photos', { id: p.id, item_id: p.item_id, width: p.width, height: p.height, created_at: p.created_at, blob: base64ToBlob(p.data, p.mime) });
      added++;
    }
  });
  return { ok: true, value: { added, skipped: valid.length - added } };
}
