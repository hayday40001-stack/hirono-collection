import type { Database, Tx } from '../db/store.ts';
import { newId, nowIso } from '../db/store.ts';
import type { CollectionEntry, CollectionStatus, StatusEvent, WishlistEntry } from '../domain/types.ts';
import { collectionEntrySchema, wishlistEntrySchema } from '../domain/validators.ts';
import { blankEntry, withQuantity, withStatus } from '../services/collectionLogic.ts';

export type EntryPatch = Partial<Omit<CollectionEntry, 'item_id' | 'created_at' | 'updated_at' | 'status' | 'quantity'>>;
export type WishPatch = Partial<Omit<WishlistEntry, 'item_id' | 'created_at' | 'updated_at'>>;

const STORES = ['collection', 'statusHistory', 'wishlist', 'items'] as const;

function assertValid(e: CollectionEntry): CollectionEntry {
  const r = collectionEntrySchema.parse(e);
  if (!r.ok) throw new Error(`ข้อมูลไม่ถูกต้อง: ${r.errors.join('; ')}`);
  return r.value;
}

async function ensureItem(tx: Tx, itemId: string) {
  const item = await tx.get('items', itemId);
  if (!item) throw new Error(`ไม่พบสินค้า ${itemId} ใน Catalog`);
}

/** Writes the entry and logs a status event when status or quantity changed. */
async function save(tx: Tx, before: CollectionEntry | undefined, after: CollectionEntry) {
  await tx.put('collection', assertValid(after));
  const fromStatus = before?.status ?? null;
  const fromQty = before?.quantity ?? 0;
  if (fromStatus !== after.status || fromQty !== after.quantity) {
    const ev: StatusEvent = {
      id: newId('ev-'),
      item_id: after.item_id,
      from_status: fromStatus,
      to_status: after.status,
      from_quantity: fromQty,
      to_quantity: after.quantity,
      at: after.updated_at,
    };
    await tx.put('statusHistory', ev);
  }
}

export function collectionRepo(db: Database) {
  const write = <T>(fn: (tx: Tx) => Promise<T>) => db.write([...STORES], fn);

  async function mutate(itemId: string, f: (e: CollectionEntry, now: string) => CollectionEntry) {
    return write(async (tx) => {
      await ensureItem(tx, itemId);
      const now = nowIso();
      const before = await tx.get<CollectionEntry>('collection', itemId);
      const after = f(before ?? blankEntry(itemId, now), now);
      await save(tx, before, after);
      return after;
    });
  }

  return {
    list: () => db.read(['collection'], (tx) => tx.getAll<CollectionEntry>('collection')),
    get: (itemId: string) => db.read(['collection'], (tx) => tx.get<CollectionEntry>('collection', itemId)),
    history: async (itemId: string) => {
      const all = await db.read(['statusHistory'], (tx) => tx.getAll<StatusEvent>('statusHistory'));
      return all.filter((e) => e.item_id === itemId).sort((a, b) => b.at.localeCompare(a.at));
    },
    allHistory: () => db.read(['statusHistory'], (tx) => tx.getAll<StatusEvent>('statusHistory')),

    setStatus: (itemId: string, status: CollectionStatus) => mutate(itemId, (e, now) => withStatus(e, status, now)),
    setQuantity: (itemId: string, quantity: number) => mutate(itemId, (e, now) => withQuantity(e, quantity, now)),
    update: (itemId: string, patch: EntryPatch) => mutate(itemId, (e, now) => ({ ...e, ...patch, updated_at: now })),
    toggleFavorite: (itemId: string) => mutate(itemId, (e, now) => ({ ...e, is_favorite: !e.is_favorite, updated_at: now })),

    /** Marks many items as owned in one transaction (used by Quick add). Items already owned are left alone. */
    async addOwnedMany(itemIds: string[]) {
      return write(async (tx) => {
        const now = nowIso();
        let added = 0;
        for (const id of new Set(itemIds)) {
          await ensureItem(tx, id);
          const before = await tx.get<CollectionEntry>('collection', id);
          if (before && before.quantity > 0 && (before.status === 'OWNED' || before.status === 'TRADE_OR_SELL')) continue;
          const after = withStatus({ ...(before ?? blankEntry(id, now)), acquired_date: before?.acquired_date ?? now.slice(0, 10) }, 'OWNED', now);
          await save(tx, before, after);
          const wish = await tx.get<WishlistEntry>('wishlist', id);
          if (wish) await tx.delete('wishlist', id);
          added++;
        }
        return added;
      });
    },

    /** Removes the personal entry and its wishlist row. Status history is kept as a record. */
    remove: (itemId: string) =>
      write(async (tx) => {
        const before = await tx.get<CollectionEntry>('collection', itemId);
        await tx.delete('collection', itemId);
        await tx.delete('wishlist', itemId);
        if (before && before.status !== 'NOT_OWNED') {
          await tx.put('statusHistory', {
            id: newId('ev-'),
            item_id: itemId,
            from_status: before.status,
            to_status: 'NOT_OWNED',
            from_quantity: before.quantity,
            to_quantity: 0,
            at: nowIso(),
          } satisfies StatusEvent);
        }
      }),

    // ---------- wishlist ----------
    wishlist: () => db.read(['wishlist'], (tx) => tx.getAll<WishlistEntry>('wishlist')),
    getWish: (itemId: string) => db.read(['wishlist'], (tx) => tx.get<WishlistEntry>('wishlist', itemId)),

    /** Adds or updates a wishlist row. If the item isn't in hand, its status becomes WISHLIST. */
    saveWish: (itemId: string, patch: WishPatch) =>
      write(async (tx) => {
        await ensureItem(tx, itemId);
        const now = nowIso();
        const prev = await tx.get<WishlistEntry>('wishlist', itemId);
        const next: WishlistEntry = {
          item_id: itemId,
          target_price: null,
          last_seen_price: null,
          priority: 2,
          notes: null,
          store_url: null,
          created_at: prev?.created_at ?? now,
          ...prev,
          ...patch,
          updated_at: now,
        };
        const r = wishlistEntrySchema.parse(next);
        if (!r.ok) throw new Error(`ข้อมูลไม่ถูกต้อง: ${r.errors.join('; ')}`);
        await tx.put('wishlist', r.value);
        const before = await tx.get<CollectionEntry>('collection', itemId);
        if (!before || before.status === 'NOT_OWNED') {
          await save(tx, before, withStatus(before ?? blankEntry(itemId, now), 'WISHLIST', now));
        }
        return r.value;
      }),

    removeWish: (itemId: string) =>
      write(async (tx) => {
        await tx.delete('wishlist', itemId);
        const before = await tx.get<CollectionEntry>('collection', itemId);
        if (before?.status === 'WISHLIST') await save(tx, before, withStatus(before, 'NOT_OWNED', nowIso()));
      }),

    /** "Got it": removes the wishlist row and records the piece as owned. */
    acquire: (itemId: string, details: { purchase_price?: number | null; acquired_date?: string | null } = {}) =>
      write(async (tx) => {
        await ensureItem(tx, itemId);
        const now = nowIso();
        const wish = await tx.get<WishlistEntry>('wishlist', itemId);
        const before = await tx.get<CollectionEntry>('collection', itemId);
        const base = before ?? blankEntry(itemId, now);
        const after = withStatus(
          {
            ...base,
            purchase_price: details.purchase_price ?? base.purchase_price ?? wish?.last_seen_price ?? null,
            acquired_date: details.acquired_date ?? base.acquired_date ?? now.slice(0, 10),
          },
          'OWNED',
          now,
        );
        await save(tx, before, after);
        if (wish) await tx.delete('wishlist', itemId);
        return after;
      }),
  };
}

export type CollectionRepo = ReturnType<typeof collectionRepo>;
