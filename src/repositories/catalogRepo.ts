import type { Database } from '../db/store.ts';
import { newId, nowIso } from '../db/store.ts';
import type { CatalogEditEvent, CatalogFile, CatalogMeta, Item, Series, Source } from '../domain/types.ts';
import { SCHEMA_VERSION } from '../domain/types.ts';
import { duplicateKey, itemSchema, seriesSchema } from '../domain/validators.ts';

export function slugify(s: string): string {
  const base = s
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[×]/g, 'x')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
  return base || 'item';
}

export type NewItemInput = Omit<Item, 'id' | 'slug' | 'origin' | 'archived' | 'created_at' | 'updated_at' | 'local_flag'> & { id?: string };
export type NewSeriesInput = Omit<Series, 'id' | 'slug' | 'origin' | 'archived' | 'created_at' | 'updated_at'> & { id?: string };

export class DuplicateItemError extends Error {
  existing: Item;
  constructor(existing: Item) {
    super(`มีรายการนี้อยู่แล้ว: ${existing.name_en} (${existing.id})`);
    this.name = 'DuplicateItemError';
    this.existing = existing;
  }
}

async function log(db: Database, ev: Omit<CatalogEditEvent, 'id' | 'at'>) {
  await db.write(['catalogHistory'], (tx) => tx.put<CatalogEditEvent>('catalogHistory', { ...ev, id: newId('ce-'), at: nowIso() }));
}

export function catalogRepo(db: Database) {
  const api = {
    meta: () => db.read(['meta'], (tx) => tx.get<CatalogMeta>('meta', 'catalog')),
    items: () => db.read(['items'], (tx) => tx.getAll<Item>('items')),
    series: () => db.read(['series'], (tx) => tx.getAll<Series>('series')),
    sources: () => db.read(['sources'], (tx) => tx.getAll<Source>('sources')),
    item: (id: string) => db.read(['items'], (tx) => tx.get<Item>('items', id)),
    history: async () => (await db.read(['catalogHistory'], (tx) => tx.getAll<CatalogEditEvent>('catalogHistory'))).sort((a, b) => b.at.localeCompare(a.at)),

    /** Adds an item on this device. Rejects likely duplicates (same series, name, edition and subcategory). */
    async addItem(input: NewItemInput, opts: { allowDuplicate?: boolean } = {}): Promise<Item> {
      const now = nowIso();
      const all = await api.items();
      if (!opts.allowDuplicate) {
        const key = duplicateKey(input);
        const twin = all.find((i) => !i.archived && duplicateKey(i) === key);
        if (twin) throw new DuplicateItemError(twin);
      }
      const slug = slugify(input.name_en);
      let id = input.id ?? `local-${slug}`;
      const ids = new Set(all.map((i) => i.id));
      while (ids.has(id)) id = `local-${slug}-${Math.random().toString(36).slice(2, 6)}`;
      const candidate: Item = { ...input, id, slug, origin: 'local', archived: false, local_flag: null, created_at: now, updated_at: now };
      const r = itemSchema.parse(candidate);
      if (!r.ok) throw new Error(r.errors.join('; '));
      await db.write(['items'], (tx) => tx.put('items', r.value));
      await log(db, { target: 'item', target_id: id, action: 'create', summary: `Added “${input.name_en}”` });
      return r.value;
    },

    async addSeries(input: NewSeriesInput): Promise<Series> {
      const now = nowIso();
      const all = await api.series();
      const slug = slugify(input.name_en);
      if (all.some((s) => s.slug === slug && !s.archived)) throw new Error(`มีซีรีส์ชื่อนี้อยู่แล้ว: ${input.name_en}`);
      let id = input.id ?? `local-series-${slug}`;
      while (all.some((s) => s.id === id)) id = `local-series-${slug}-${Math.random().toString(36).slice(2, 6)}`;
      const candidate: Series = { ...input, id, slug, origin: 'local', archived: false, created_at: now, updated_at: now };
      const r = seriesSchema.parse(candidate);
      if (!r.ok) throw new Error(r.errors.join('; '));
      await db.write(['series'], (tx) => tx.put('series', r.value));
      await log(db, { target: 'series', target_id: id, action: 'create', summary: `Added series “${input.name_en}”` });
      return r.value;
    },

    /** Edits a row added on this device. Published catalog rows are edited in the repository instead. */
    async updateLocalItem(id: string, patch: Partial<NewItemInput>): Promise<Item> {
      const cur = await api.item(id);
      if (!cur) throw new Error('ไม่พบรายการ');
      if (cur.origin !== 'local') throw new Error('รายการจาก Catalog กลางแก้ไขในเครื่องไม่ได้ ใช้ “แจ้งข้อมูลผิด” แทน');
      const next = { ...cur, ...patch, id: cur.id, slug: cur.slug, origin: 'local' as const, updated_at: nowIso() };
      const r = itemSchema.parse(next);
      if (!r.ok) throw new Error(r.errors.join('; '));
      await db.write(['items'], (tx) => tx.put('items', r.value));
      await log(db, { target: 'item', target_id: id, action: 'update', summary: `Edited ${Object.keys(patch).join(', ')}` });
      return r.value;
    },

    async setFlag(id: string, flag: Item['local_flag']) {
      const cur = await api.item(id);
      if (!cur) throw new Error('ไม่พบรายการ');
      await db.write(['items'], (tx) => tx.put('items', { ...cur, local_flag: flag ?? null }));
      await log(db, { target: 'item', target_id: id, action: 'flag', summary: flag ? `Flagged as ${flag}` : 'Flag cleared' });
    },

    async setArchived(id: string, archived: boolean) {
      const cur = await api.item(id);
      if (!cur) throw new Error('ไม่พบรายการ');
      if (cur.origin !== 'local') throw new Error('รายการจาก Catalog กลางจะถูกเก็บเข้าคลังอัตโนมัติเมื่อถูกถอดออกจาก Catalog');
      await db.write(['items'], (tx) => tx.put('items', { ...cur, archived, updated_at: nowIso() }));
      await log(db, { target: 'item', target_id: id, action: 'archive', summary: archived ? 'Archived' : 'Restored' });
    },

    /** Everything on this device in the published catalog format, ready to review and commit to the repository. */
    async exportCatalog(): Promise<CatalogFile> {
      const [meta, sources, series, items] = await Promise.all([api.meta(), api.sources(), api.series(), api.items()]);
      return {
        schema_version: SCHEMA_VERSION,
        catalog_version: meta?.catalog_version ?? '0',
        generated_at: nowIso(),
        last_verified_at: meta?.last_verified_at ?? nowIso().slice(0, 10),
        coverage: meta?.coverage ?? { total_universe_known: false, notes: '' },
        sources: sources.sort((a, b) => a.id.localeCompare(b.id)),
        series: series.filter((s) => !s.archived),
        items: items.filter((i) => !i.archived),
      };
    },
  };
  return api;
}

export type CatalogRepo = ReturnType<typeof catalogRepo>;
