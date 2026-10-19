import { s, ISO_DATE, ISO_DATETIME, ID, httpUrl, type Schema, type Result } from './schema.ts';
import {
  CATEGORIES,
  COLLECTION_STATUSES,
  CONDITIONS,
  EDITION_TYPES,
  PRESENCE,
  PRIORITIES,
  ROSTER_STATUSES,
  SCHEMA_VERSION,
  SOURCE_TYPES,
  VERIFICATION_STATUSES,
  type CatalogFile,
  type CollectionEntry,
  type Item,
  type Series,
  type Source,
  type SourceRef,
  type StatusEvent,
  type WishlistEntry,
} from './types.ts';

const text = (max = 2000) => s.string({ max });
const optText = (max = 2000) => s.nullable(s.string({ max }));
const date = s.nullable(s.string({ pattern: ISO_DATE }));
const datetime = s.string({ pattern: ISO_DATETIME });
const id = s.string({ pattern: ID });
const year = s.nullable(s.number({ int: true, min: 2000, max: 2100 }));
const price = s.nullable(s.number({ min: 0, max: 100_000_000 }));

/** Image paths: absolute http(s) links or files shipped with the app under images/. */
const imagePath: Schema<string> = {
  parse(v, p = '') {
    if (typeof v === 'string' && /^images\/[\w./-]+$/.test(v) && !v.includes('..')) return { ok: true, value: v };
    return httpUrl.parse(v, p);
  },
};

export const sourceSchema: Schema<Source> = s.object<Source>({
  id,
  title: text(300),
  source_type: s.enumOf(SOURCE_TYPES),
  publisher: text(200),
  url: httpUrl,
  published_at: date,
  accessed_at: s.string({ pattern: ISO_DATE }),
  notes: s.optional(text(1000), ''),
});

const sourceRef: Schema<SourceRef> = s.object<SourceRef>({ source_id: id, confirms: text(500) });

export const seriesSchema: Schema<Series> = s.object<Series>({
  id,
  slug: s.string({ pattern: ID }),
  name_en: s.string({ min: 1, max: 200 }),
  name_th: optText(200),
  release_year: year,
  release_date: date,
  series_type: s.enumOf(CATEGORIES),
  product_kind: text(120),
  description: optText(2000),
  cover_image: s.nullable(imagePath),
  verification_status: s.enumOf(VERIFICATION_STATUSES),
  roster_status: s.enumOf(ROSTER_STATUSES),
  declared_count: s.object({
    regular: s.nullable(s.number({ int: true, min: 0, max: 500 })),
    secret: s.nullable(s.number({ int: true, min: 0, max: 100 })),
  }),
  sources: s.array(sourceRef, { max: 50 }),
  conflicts: s.optional(s.array(text(1000), { max: 50 }), []),
  origin: s.optional(s.enumOf(['catalog', 'local'] as const), 'catalog'),
  archived: s.optional(s.boolean(), false),
  created_at: datetime,
  updated_at: datetime,
});

export const itemSchema: Schema<Item> = s.object<Item>({
  id,
  slug: s.string({ pattern: ID }),
  name_en: s.string({ min: 1, max: 200 }),
  name_th: optText(200),
  series_id: s.nullable(id),
  category: s.enumOf(CATEGORIES),
  subcategory: optText(120),
  release_year: year,
  release_date: date,
  edition_type: s.enumOf(EDITION_TYPES),
  rarity: optText(120),
  product_code: optText(80),
  description: optText(2000),
  images: s.optional(s.array(imagePath, { max: 20 }), []),
  verification_status: s.enumOf(VERIFICATION_STATUSES),
  sources: s.array(sourceRef, { max: 50 }),
  conflicts: s.optional(s.array(text(1000), { max: 50 }), []),
  aliases: s.optional(s.array(text(200), { max: 30 }), []),
  archived: s.optional(s.boolean(), false),
  origin: s.optional(s.enumOf(['catalog', 'local'] as const), 'catalog'),
  local_flag: s.optional(s.nullable(s.enumOf(['WRONG_INFO', 'CANCELLED'] as const)), null),
  created_at: datetime,
  updated_at: datetime,
});

const catalogFileSchema: Schema<CatalogFile> = s.object<CatalogFile>({
  schema_version: s.number({ int: true, min: 1, max: 100 }),
  catalog_version: s.string({ min: 1, max: 60 }),
  generated_at: datetime,
  last_verified_at: s.string({ pattern: ISO_DATE }),
  coverage: s.object({ total_universe_known: s.boolean(), notes: text(2000) }),
  sources: s.array(sourceSchema, { max: 5000 }),
  series: s.array(seriesSchema, { max: 5000 }),
  items: s.array(itemSchema, { max: 50000 }),
});

export interface CatalogCheck {
  catalog: CatalogFile;
  warnings: string[];
}

/** Structural + referential validation. Duplicate ids are errors; likely duplicates are warnings. */
export function validateCatalogFile(input: unknown): Result<CatalogCheck> {
  const r = catalogFileSchema.parse(input);
  if (!r.ok) return r;
  const cat = r.value;
  const errors: string[] = [];
  const warnings: string[] = [];
  if (cat.schema_version > SCHEMA_VERSION) {
    errors.push(`schema_version ${cat.schema_version} is newer than this app supports (${SCHEMA_VERSION}). Update the app first.`);
  }
  const dupes = (ids: string[], label: string) => {
    const seen = new Set<string>();
    for (const i of ids) {
      if (seen.has(i)) errors.push(`Duplicate ${label} id: ${i}`);
      seen.add(i);
    }
    return seen;
  };
  const sourceIds = dupes(cat.sources.map((x) => x.id), 'source');
  const seriesIds = dupes(cat.series.map((x) => x.id), 'series');
  dupes(cat.items.map((x) => x.id), 'item');
  const checkRefs = (refs: SourceRef[], owner: string) => {
    for (const ref of refs) if (!sourceIds.has(ref.source_id)) errors.push(`${owner} cites unknown source ${ref.source_id}`);
  };
  cat.series.forEach((x) => checkRefs(x.sources, `Series ${x.id}`));
  for (const it of cat.items) {
    checkRefs(it.sources, `Item ${it.id}`);
    if (it.series_id && !seriesIds.has(it.series_id)) errors.push(`Item ${it.id} points to unknown series ${it.series_id}`);
    if (it.sources.length === 0 && it.verification_status !== 'UNVERIFIED' && it.verification_status !== 'NEEDS_REVIEW') {
      errors.push(`Item ${it.id} is marked ${it.verification_status} but has no source`);
    }
  }
  for (const se of cat.series) {
    if (se.sources.length === 0 && (se.verification_status === 'VERIFIED_OFFICIAL' || se.verification_status === 'VERIFIED_CROSS_REFERENCED')) {
      errors.push(`Series ${se.id} is marked ${se.verification_status} but has no source`);
    }
  }
  warnings.push(...findLikelyDuplicates(cat.items));
  return errors.length ? { ok: false, errors } : { ok: true, value: { catalog: cat, warnings } };
}

export function normalizeName(name: string): string {
  return name
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[×]/g, 'x')
    .replace(/['’"]/g, '')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();
}

/** Same series + same normalized name + same edition is probably the same product. Name alone is not enough. */
export function duplicateKey(it: Pick<Item, 'series_id' | 'name_en' | 'edition_type' | 'subcategory'>): string {
  return `${it.series_id ?? 'standalone'}|${normalizeName(it.name_en)}|${it.edition_type}|${normalizeName(it.subcategory ?? '')}`;
}

export function findLikelyDuplicates(items: Pick<Item, 'id' | 'series_id' | 'name_en' | 'edition_type' | 'subcategory'>[]): string[] {
  const seen = new Map<string, string>();
  const out: string[] = [];
  for (const it of items) {
    const k = duplicateKey(it);
    const prev = seen.get(k);
    if (prev) out.push(`Possible duplicate: ${it.id} looks the same as ${prev} (${it.name_en})`);
    else seen.set(k, it.id);
  }
  return out;
}

// ---------- personal data ----------

export const collectionEntrySchema: Schema<CollectionEntry> = s.object<CollectionEntry>({
  item_id: id,
  status: s.enumOf(COLLECTION_STATUSES),
  quantity: s.number({ int: true, min: 0, max: 9999 }),
  purchase_price: price,
  estimated_value: price,
  acquired_date: date,
  condition: s.nullable(s.enumOf(CONDITIONS)),
  box_status: s.optional(s.enumOf(PRESENCE), 'UNKNOWN'),
  card_status: s.optional(s.enumOf(PRESENCE), 'UNKNOWN'),
  accessories_status: s.optional(s.enumOf(PRESENCE), 'UNKNOWN'),
  store: optText(200),
  personal_notes: optText(5000),
  is_favorite: s.optional(s.boolean(), false),
  created_at: datetime,
  updated_at: datetime,
});

export const wishlistEntrySchema: Schema<WishlistEntry> = s.object<WishlistEntry>({
  item_id: id,
  target_price: price,
  last_seen_price: price,
  priority: s.enumOf(PRIORITIES),
  notes: optText(5000),
  store_url: s.nullable(httpUrl),
  created_at: datetime,
  updated_at: datetime,
});

export const statusEventSchema: Schema<StatusEvent> = s.object<StatusEvent>({
  id: s.string({ min: 1, max: 100 }),
  item_id: id,
  from_status: s.nullable(s.enumOf(COLLECTION_STATUSES)),
  to_status: s.enumOf(COLLECTION_STATUSES),
  from_quantity: s.number({ int: true, min: 0 }),
  to_quantity: s.number({ int: true, min: 0 }),
  at: datetime,
});
