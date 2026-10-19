import { CATEGORY_LABEL, EDITION_LABEL, STATUS_LABEL, VERIFICATION_LABEL } from '../domain/labels.ts';
import type { Category, CollectionEntry, EditionType, Item, Series } from '../domain/types.ts';
import { isOwned, isSecretEdition, isVerified } from '../domain/types.ts';

/** Lower-cases, folds accents and width, and keeps Thai characters intact. */
export function normalize(text: string): string {
  return text
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .normalize('NFC')
    .toLowerCase()
    .replace(/[×]/g, 'x')
    .replace(/['’"]/g, '')
    .replace(/[^\p{L}\p{M}\p{N}]+/gu, ' ')
    .trim();
}

export function searchText(item: Item, series: Series | undefined, entry: CollectionEntry | undefined): string {
  const status = entry?.status ?? 'NOT_OWNED';
  const parts = [
    item.name_en,
    item.name_th ?? '',
    ...item.aliases,
    series?.name_en ?? '',
    series?.name_th ?? '',
    item.subcategory ?? '',
    item.product_code ?? '',
    item.release_year ? String(item.release_year) : '',
    CATEGORY_LABEL[item.category].th,
    CATEGORY_LABEL[item.category].en,
    EDITION_LABEL[item.edition_type].th,
    EDITION_LABEL[item.edition_type].en,
    VERIFICATION_LABEL[item.verification_status].th,
    STATUS_LABEL[status].th,
    STATUS_LABEL[status].en,
    'hirono ฮิโรโนะ',
  ];
  return normalize(parts.join(' '));
}

/** Every word in the query has to appear somewhere (Thai has no spaces, so substring match). */
export function matches(haystack: string, query: string): boolean {
  const q = normalize(query);
  if (!q) return true;
  return q.split(' ').every((tok) => haystack.includes(tok));
}

export type OwnershipFilter = 'all' | 'owned' | 'missing' | 'hunting' | 'ordered' | 'trade';
export type SortKey = 'release' | 'name' | 'year_desc' | 'added';

export interface ItemFilters {
  query: string;
  ownership: OwnershipFilter;
  category: Category | 'all';
  year: number | 'all';
  edition: 'all' | 'secret';
  favorites: boolean;
  verifiedOnly: boolean;
  priceMin: number | null;
  priceMax: number | null;
  sort: SortKey;
}

export const DEFAULT_FILTERS: ItemFilters = {
  query: '',
  ownership: 'all',
  category: 'all',
  year: 'all',
  edition: 'all',
  favorites: false,
  verifiedOnly: false,
  priceMin: null,
  priceMax: null,
  sort: 'release',
};

const EDITION_ORDER: Record<EditionType, number> = { REGULAR: 0, SPECIAL: 1, SINGLE: 1, SECRET: 2, SUPER_SECRET: 3 };

export function filterItems(
  items: Item[],
  seriesById: Map<string, Series>,
  entries: Map<string, CollectionEntry>,
  wishIds: Set<string>,
  f: ItemFilters,
): Item[] {
  const out = items.filter((it) => {
    if (it.archived && !isOwned(entries.get(it.id))) return false;
    const e = entries.get(it.id);
    if (f.category !== 'all' && it.category !== f.category) return false;
    if (f.year !== 'all' && it.release_year !== f.year) return false;
    if (f.edition === 'secret' && !isSecretEdition(it.edition_type)) return false;
    if (f.favorites && !e?.is_favorite) return false;
    if (f.verifiedOnly && !isVerified(it.verification_status)) return false;
    switch (f.ownership) {
      case 'owned':
        if (!isOwned(e)) return false;
        break;
      case 'missing':
        if (isOwned(e)) return false;
        break;
      case 'hunting':
        if (!(wishIds.has(it.id) || e?.status === 'WISHLIST')) return false;
        break;
      case 'ordered':
        if (e?.status !== 'ORDERED') return false;
        break;
      case 'trade':
        if (e?.status !== 'TRADE_OR_SELL') return false;
        break;
    }
    if (f.priceMin !== null || f.priceMax !== null) {
      const p = e?.purchase_price;
      if (p === null || p === undefined) return false;
      if (f.priceMin !== null && p < f.priceMin) return false;
      if (f.priceMax !== null && p > f.priceMax) return false;
    }
    if (f.query && !matches(searchText(it, it.series_id ? seriesById.get(it.series_id) : undefined, e), f.query)) return false;
    return true;
  });
  return sortItems(out, seriesById, entries, f.sort);
}

export function releaseKey(it: Item, s?: Series): string {
  return it.release_date ?? s?.release_date ?? (it.release_year ? `${it.release_year}-99` : '9999');
}

export function sortItems(items: Item[], seriesById: Map<string, Series>, entries: Map<string, CollectionEntry>, sort: SortKey): Item[] {
  const sname = (i: Item) => (i.series_id ? seriesById.get(i.series_id)?.name_en ?? '' : '');
  const copy = [...items];
  switch (sort) {
    case 'name':
      return copy.sort((a, b) => a.name_en.localeCompare(b.name_en));
    case 'year_desc':
      return copy.sort((a, b) => releaseKey(b, seriesById.get(b.series_id ?? '')).localeCompare(releaseKey(a, seriesById.get(a.series_id ?? ''))));
    case 'added':
      return copy.sort((a, b) => (entries.get(b.id)?.created_at ?? b.created_at).localeCompare(entries.get(a.id)?.created_at ?? a.created_at));
    case 'release':
    default:
      return copy.sort(
        (a, b) =>
          releaseKey(a, seriesById.get(a.series_id ?? '')).localeCompare(releaseKey(b, seriesById.get(b.series_id ?? ''))) ||
          sname(a).localeCompare(sname(b)) ||
          EDITION_ORDER[a.edition_type] - EDITION_ORDER[b.edition_type],
      );
  }
}
