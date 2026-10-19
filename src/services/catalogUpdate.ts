import type { Database } from '../db/store.ts';
import { newId, nowIso } from '../db/store.ts';
import type { CatalogEditEvent, CatalogFile, CatalogMeta, Item, Series, Source } from '../domain/types.ts';
import { duplicateKey, validateCatalogFile } from '../domain/validators.ts';
import type { Result } from '../domain/schema.ts';

export interface CatalogSnapshot {
  meta: CatalogMeta | undefined;
  sources: Source[];
  series: Series[];
  items: Item[];
}

export interface FieldChange {
  id: string;
  name: string;
  fields: string[];
}

export interface CatalogDiff {
  fromVersion: string | null;
  toVersion: string;
  items: { added: Item[]; changed: FieldChange[]; archived: Item[]; restored: Item[]; unchanged: number };
  series: { added: Series[]; changed: FieldChange[]; archived: Series[] };
  sources: { added: number; changed: number };
  /** Incoming rows that look like an existing row with a different id. */
  duplicates: string[];
  warnings: string[];
  /** Personal entries are never touched by a catalog update; this is how many reference archived items. */
  personalEntriesOnArchived: number;
}

const COMPARE_IGNORE = new Set(['created_at', 'updated_at', 'archived', 'local_flag']);

function changedFields(a: object, b: object): string[] {
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
  const out: string[] = [];
  for (const k of keys) {
    if (COMPARE_IGNORE.has(k)) continue;
    if (JSON.stringify((a as Record<string, unknown>)[k]) !== JSON.stringify((b as Record<string, unknown>)[k])) out.push(k);
  }
  return out;
}

export async function readSnapshot(db: Database): Promise<CatalogSnapshot> {
  return db.read(['meta', 'sources', 'series', 'items'], async (tx) => ({
    meta: await tx.get<CatalogMeta>('meta', 'catalog'),
    sources: await tx.getAll<Source>('sources'),
    series: await tx.getAll<Series>('series'),
    items: await tx.getAll<Item>('items'),
  }));
}

export function diffCatalog(current: CatalogSnapshot, incoming: CatalogFile, personalItemIds: Set<string> = new Set()): CatalogDiff {
  const curItems = new Map(current.items.map((i) => [i.id, i]));
  const curSeries = new Map(current.series.map((s) => [s.id, s]));
  const curSources = new Map(current.sources.map((s) => [s.id, s]));
  const incomingItemIds = new Set(incoming.items.map((i) => i.id));
  const incomingSeriesIds = new Set(incoming.series.map((s) => s.id));

  const diff: CatalogDiff = {
    fromVersion: current.meta?.catalog_version ?? null,
    toVersion: incoming.catalog_version,
    items: { added: [], changed: [], archived: [], restored: [], unchanged: 0 },
    series: { added: [], changed: [], archived: [] },
    sources: { added: 0, changed: 0 },
    duplicates: [],
    warnings: [],
    personalEntriesOnArchived: 0,
  };

  // Likely duplicates between incoming rows and rows already on this device (incl. local additions).
  const existingKeys = new Map(current.items.map((i) => [duplicateKey(i), i]));
  for (const it of incoming.items) {
    const cur = curItems.get(it.id);
    if (!cur) {
      const twin = existingKeys.get(duplicateKey(it));
      if (twin && !incomingItemIds.has(twin.id)) diff.duplicates.push(`“${it.name_en}” (${it.id}) looks the same as ${twin.origin === 'local' ? 'your local item' : 'existing item'} ${twin.id}`);
      diff.items.added.push(it);
    } else {
      const f = changedFields(cur, { ...it, origin: 'catalog' });
      if (cur.archived) diff.items.restored.push(it);
      else if (f.length) diff.items.changed.push({ id: it.id, name: it.name_en, fields: f });
      else diff.items.unchanged++;
    }
  }
  for (const cur of current.items) {
    if (cur.origin === 'catalog' && !cur.archived && !incomingItemIds.has(cur.id)) {
      diff.items.archived.push(cur);
      if (personalItemIds.has(cur.id)) diff.personalEntriesOnArchived++;
    }
  }
  for (const se of incoming.series) {
    const cur = curSeries.get(se.id);
    if (!cur) diff.series.added.push(se);
    else {
      const f = changedFields(cur, { ...se, origin: 'catalog' });
      if (f.length) diff.series.changed.push({ id: se.id, name: se.name_en, fields: f });
    }
  }
  for (const cur of current.series) {
    if ((cur.origin ?? 'catalog') === 'catalog' && !cur.archived && !incomingSeriesIds.has(cur.id)) diff.series.archived.push(cur);
  }
  for (const so of incoming.sources) {
    const cur = curSources.get(so.id);
    if (!cur) diff.sources.added++;
    else if (JSON.stringify(cur) !== JSON.stringify(so)) diff.sources.changed++;
  }
  return diff;
}

export function isNoop(d: CatalogDiff): boolean {
  return (
    d.fromVersion === d.toVersion &&
    !d.items.added.length &&
    !d.items.changed.length &&
    !d.items.archived.length &&
    !d.items.restored.length &&
    !d.series.added.length &&
    !d.series.changed.length &&
    !d.series.archived.length &&
    !d.sources.added &&
    !d.sources.changed
  );
}

/**
 * Installs a validated catalog. Adds and updates rows, archives rows that
 * disappeared (never deletes them) and leaves local additions and every
 * personal store untouched. Runs as one transaction.
 */
export async function applyCatalog(db: Database, incoming: CatalogFile, origin: CatalogMeta['origin']): Promise<CatalogDiff> {
  const personal = await db.read(['collection', 'wishlist'], async (tx) => {
    const ids = new Set<string>();
    (await tx.getAll<{ item_id: string }>('collection')).forEach((e) => ids.add(e.item_id));
    (await tx.getAll<{ item_id: string }>('wishlist')).forEach((e) => ids.add(e.item_id));
    return ids;
  });
  const snapshot = await readSnapshot(db);
  const diff = diffCatalog(snapshot, incoming, personal);
  const now = nowIso();
  await db.write(['meta', 'sources', 'series', 'items', 'catalogHistory'], async (tx) => {
    for (const so of incoming.sources) await tx.put('sources', so);
    const curSeries = new Map(snapshot.series.map((s) => [s.id, s]));
    for (const se of incoming.series) {
      await tx.put('series', { ...se, origin: 'catalog', archived: false, created_at: curSeries.get(se.id)?.created_at ?? se.created_at });
    }
    for (const se of diff.series.archived) await tx.put('series', { ...se, archived: true, updated_at: now });
    const curItems = new Map(snapshot.items.map((i) => [i.id, i]));
    for (const it of incoming.items) {
      const cur = curItems.get(it.id);
      await tx.put('items', { ...it, origin: 'catalog', archived: false, local_flag: cur?.local_flag ?? null });
    }
    for (const it of diff.items.archived) await tx.put('items', { ...it, archived: true, updated_at: now });
    const meta: CatalogMeta = {
      key: 'catalog',
      catalog_version: incoming.catalog_version,
      schema_version: incoming.schema_version,
      installed_at: now,
      last_verified_at: incoming.last_verified_at,
      origin,
      coverage: incoming.coverage,
    };
    await tx.put('meta', meta);
    const ev: CatalogEditEvent = {
      id: newId('ce-'),
      target: 'catalog',
      target_id: incoming.catalog_version,
      action: 'catalog_update',
      summary: `Catalog ${diff.fromVersion ?? '(none)'} → ${incoming.catalog_version}: +${diff.items.added.length} added, ${diff.items.changed.length} changed, ${diff.items.archived.length} archived`,
      at: now,
    };
    await tx.put('catalogHistory', ev);
  });
  return diff;
}

export function parseCatalogText(text: string): Result<{ catalog: CatalogFile; warnings: string[] }> {
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    return { ok: false, errors: ['ไฟล์ไม่ใช่ JSON ที่ถูกต้อง'] };
  }
  return validateCatalogFile(json);
}

/** Fetches the catalog shipped with the app (or published next to it). */
export async function fetchPublishedCatalog(url = 'catalog/catalog.json', fresh = false): Promise<Result<{ catalog: CatalogFile; warnings: string[] }>> {
  let res: Response;
  try {
    res = await fetch(url, { cache: fresh ? 'no-cache' : 'default' });
  } catch {
    return { ok: false, errors: ['ไม่สามารถดาวน์โหลด Catalog ได้ (ออฟไลน์อยู่หรือไม่?)'] };
  }
  if (!res.ok) return { ok: false, errors: [`ดาวน์โหลด Catalog ไม่สำเร็จ (HTTP ${res.status})`] };
  return parseCatalogText(await res.text());
}
