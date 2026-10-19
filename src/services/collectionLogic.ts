import type { CollectionEntry, CollectionStatus } from '../domain/types.ts';
import { isOwned } from '../domain/types.ts';

export function blankEntry(item_id: string, now: string): CollectionEntry {
  return {
    item_id,
    status: 'NOT_OWNED',
    quantity: 0,
    purchase_price: null,
    estimated_value: null,
    acquired_date: null,
    condition: null,
    box_status: 'UNKNOWN',
    card_status: 'UNKNOWN',
    accessories_status: 'UNKNOWN',
    store: null,
    personal_notes: null,
    is_favorite: false,
    created_at: now,
    updated_at: now,
  };
}

const IN_HAND: CollectionStatus[] = ['OWNED', 'TRADE_OR_SELL'];

/**
 * Status rules:
 * - OWNED / TRADE_OR_SELL always means at least one piece in hand.
 * - NOT_OWNED / WISHLIST / ORDERED means nothing in hand, so quantity becomes 0.
 * Purchase details are kept either way, so history is not lost.
 */
export function withStatus(entry: CollectionEntry, status: CollectionStatus, now: string): CollectionEntry {
  const quantity = IN_HAND.includes(status) ? Math.max(1, entry.quantity) : 0;
  return { ...entry, status, quantity, updated_at: now };
}

/**
 * Quantity rules:
 * - 0 pieces is never "owned", even if the item was bought before: status falls back to NOT_OWNED.
 * - More than 0 pieces on an entry that wasn't in hand makes it OWNED.
 */
export function withQuantity(entry: CollectionEntry, quantity: number, now: string): CollectionEntry {
  const q = Math.max(0, Math.min(9999, Math.floor(Number.isFinite(quantity) ? quantity : 0)));
  let status = entry.status;
  if (q === 0 && IN_HAND.includes(status)) status = 'NOT_OWNED';
  if (q > 0 && !IN_HAND.includes(status)) status = 'OWNED';
  return { ...entry, quantity: q, status, updated_at: now };
}

/** True when an entry carries nothing worth keeping and can be removed. */
export function isEmptyEntry(e: CollectionEntry): boolean {
  return (
    e.status === 'NOT_OWNED' &&
    e.quantity === 0 &&
    !e.is_favorite &&
    e.purchase_price === null &&
    e.estimated_value === null &&
    !e.personal_notes &&
    !e.store &&
    !e.acquired_date &&
    !e.condition
  );
}

export { isOwned };
