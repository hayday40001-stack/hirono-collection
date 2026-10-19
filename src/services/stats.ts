import type { CollectionEntry, Item, Series, StatusEvent, WishlistEntry } from '../domain/types.ts';
import { isOwned, isSecretEdition, isVerified } from '../domain/types.ts';

export interface SeriesProgress {
  series: Series;
  items: Item[];
  owned: number;
  total: number;
  /** Items in this series that are not verified yet. */
  unverified: number;
  percent: number;
  /** True only when the roster is known to be complete, every style is verified and every style is owned. */
  complete: boolean;
  /** Why "complete" can't be claimed even if everything listed is owned. */
  caveat: string | null;
}

export interface Overview {
  catalogItems: number;
  verifiedItems: number;
  unverifiedItems: number;
  ownedModels: number;
  ownedVerifiedModels: number;
  ownedPieces: number;
  missingVerified: number;
  hunting: number;
  ordered: number;
  forTrade: number;
  /** owned verified styles ÷ verified styles in this catalog. null when nothing is verified. */
  percent: number | null;
  seriesComplete: number;
  secretsOwned: number;
  limitedOwned: number;
  limitedInCatalog: number;
  collabsOwned: number;
  spent: { total: number; entriesWithPrice: number };
  value: { total: number; entriesWithValue: number };
  totalUniverseKnown: boolean;
}

export function seriesProgress(series: Series[], items: Item[], entries: Map<string, CollectionEntry>): SeriesProgress[] {
  const bySeries = new Map<string, Item[]>();
  for (const it of items) {
    if (it.archived || !it.series_id) continue;
    const list = bySeries.get(it.series_id) ?? [];
    list.push(it);
    bySeries.set(it.series_id, list);
  }
  return series
    .filter((s) => !s.archived)
    .map((s) => {
      const list = bySeries.get(s.id) ?? [];
      const owned = list.filter((i) => isOwned(entries.get(i.id))).length;
      const unverified = list.filter((i) => !isVerified(i.verification_status)).length;
      let caveat: string | null = null;
      if (s.roster_status !== 'COMPLETE') caveat = 'รายชื่อรุ่นของซีรีส์นี้ยังไม่ครบ';
      else if (!isVerified(s.verification_status)) caveat = 'ข้อมูลซีรีส์ยังไม่ได้ยืนยัน';
      else if (unverified > 0) caveat = `มี ${unverified} รุ่นที่ยังไม่ยืนยัน`;
      const complete = list.length > 0 && owned === list.length && caveat === null;
      return {
        series: s,
        items: list,
        owned,
        total: list.length,
        unverified,
        percent: list.length ? owned / list.length : 0,
        complete,
        caveat,
      };
    });
}

export function overview(
  items: Item[],
  series: Series[],
  entriesList: CollectionEntry[],
  wishlist: WishlistEntry[],
  totalUniverseKnown = false,
): Overview {
  const entries = new Map(entriesList.map((e) => [e.item_id, e]));
  const live = items.filter((i) => !i.archived);
  const verified = live.filter((i) => isVerified(i.verification_status));
  const ownedItems = items.filter((i) => isOwned(entries.get(i.id)));
  const ownedVerified = verified.filter((i) => isOwned(entries.get(i.id)));
  const hunting = new Set([...wishlist.map((w) => w.item_id), ...entriesList.filter((e) => e.status === 'WISHLIST').map((e) => e.item_id)]);
  const spent = { total: 0, entriesWithPrice: 0 };
  const value = { total: 0, entriesWithValue: 0 };
  for (const e of entriesList) {
    if (!isOwned(e)) continue;
    if (e.purchase_price !== null) {
      spent.total += e.purchase_price * e.quantity;
      spent.entriesWithPrice++;
    }
    if (e.estimated_value !== null) {
      value.total += e.estimated_value * e.quantity;
      value.entriesWithValue++;
    }
  }
  return {
    catalogItems: live.length,
    verifiedItems: verified.length,
    unverifiedItems: live.length - verified.length,
    ownedModels: ownedItems.length,
    ownedVerifiedModels: ownedVerified.length,
    ownedPieces: entriesList.filter(isOwned).reduce((n, e) => n + e.quantity, 0),
    missingVerified: verified.length - ownedVerified.length,
    hunting: hunting.size,
    ordered: entriesList.filter((e) => e.status === 'ORDERED').length,
    forTrade: entriesList.filter((e) => e.status === 'TRADE_OR_SELL' && e.quantity > 0).length,
    percent: verified.length ? ownedVerified.length / verified.length : null,
    seriesComplete: seriesProgress(series, items, entries).filter((p) => p.complete).length,
    secretsOwned: ownedItems.filter((i) => isSecretEdition(i.edition_type)).length,
    limitedOwned: ownedItems.filter((i) => i.category === 'LIMITED_SPECIAL').length,
    limitedInCatalog: live.filter((i) => i.category === 'LIMITED_SPECIAL').length,
    collabsOwned: ownedItems.filter((i) => i.category === 'COLLABORATION').length,
    spent,
    value,
    totalUniverseKnown,
  };
}

/** Cumulative styles owned per month, from acquired_date or, failing that, the first time it became owned. */
export function acquisitionTimeline(entriesList: CollectionEntry[], history: StatusEvent[]): { month: string; added: number; cumulative: number }[] {
  const firstOwned = new Map<string, string>();
  for (const ev of [...history].sort((a, b) => a.at.localeCompare(b.at))) {
    if ((ev.to_status === 'OWNED' || ev.to_status === 'TRADE_OR_SELL') && ev.to_quantity > 0 && !firstOwned.has(ev.item_id)) firstOwned.set(ev.item_id, ev.at);
  }
  const months = new Map<string, number>();
  for (const e of entriesList) {
    if (!isOwned(e)) continue;
    const d = e.acquired_date ?? firstOwned.get(e.item_id) ?? e.created_at;
    const m = d.slice(0, 7);
    months.set(m, (months.get(m) ?? 0) + 1);
  }
  const sorted = [...months.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  let cum = 0;
  return sorted.map(([month, added]) => ({ month, added, cumulative: (cum += added) }));
}

export interface CoverageReport {
  series: number;
  items: number;
  verifiedOfficial: number;
  crossReferenced: number;
  unverified: number;
  needsReview: number;
  seriesWithIncompleteRoster: Series[];
  categories: { category: Item['category']; items: number; unverified: number }[];
  localItems: number;
  archived: number;
  flagged: number;
}

export function coverage(series: Series[], items: Item[]): CoverageReport {
  const live = items.filter((i) => !i.archived);
  const cats = new Map<Item['category'], { items: number; unverified: number }>();
  for (const it of live) {
    const c = cats.get(it.category) ?? { items: 0, unverified: 0 };
    c.items++;
    if (!isVerified(it.verification_status)) c.unverified++;
    cats.set(it.category, c);
  }
  return {
    series: series.filter((s) => !s.archived).length,
    items: live.length,
    verifiedOfficial: live.filter((i) => i.verification_status === 'VERIFIED_OFFICIAL').length,
    crossReferenced: live.filter((i) => i.verification_status === 'VERIFIED_CROSS_REFERENCED').length,
    unverified: live.filter((i) => i.verification_status === 'UNVERIFIED').length,
    needsReview: live.filter((i) => i.verification_status === 'NEEDS_REVIEW').length,
    seriesWithIncompleteRoster: series.filter((s) => !s.archived && s.roster_status !== 'COMPLETE'),
    categories: [...cats.entries()].map(([category, c]) => ({ category, ...c })),
    localItems: live.filter((i) => i.origin === 'local').length,
    archived: items.length - live.length,
    flagged: live.filter((i) => i.local_flag).length,
  };
}
