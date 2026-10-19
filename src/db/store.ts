// Storage abstraction. The app talks to `Database`; the browser uses the
// IndexedDB adapter (idb.ts) and the unit tests use the in-memory adapter
// (memory.ts). Both run every write inside a single atomic transaction.

export const STORES = {
  meta: 'meta', // catalog meta, schema version, import snapshots   (key: key)
  sources: 'sources', // catalog                                     (key: id)
  series: 'series', // catalog                                       (key: id)
  items: 'items', // catalog                                         (key: id)
  catalogHistory: 'catalogHistory', // catalog edit log            (key: id)
  collection: 'collection', // personal                            (key: item_id)
  statusHistory: 'statusHistory', // personal                      (key: id)
  wishlist: 'wishlist', // personal                                (key: item_id)
  photos: 'photos', // personal, blobs                             (key: id)
  settings: 'settings', // personal                                (key: key)
} as const;

export type StoreName = (typeof STORES)[keyof typeof STORES];

export const KEY_PATHS: Record<StoreName, string> = {
  meta: 'key',
  sources: 'id',
  series: 'id',
  items: 'id',
  catalogHistory: 'id',
  collection: 'item_id',
  statusHistory: 'id',
  wishlist: 'item_id',
  photos: 'id',
  settings: 'key',
};

export const CATALOG_STORES: StoreName[] = ['sources', 'series', 'items', 'catalogHistory'];
export const PERSONAL_STORES: StoreName[] = ['collection', 'statusHistory', 'wishlist', 'photos', 'settings'];

export interface Tx {
  get<T>(store: StoreName, key: string): Promise<T | undefined>;
  getAll<T>(store: StoreName): Promise<T[]>;
  put<T>(store: StoreName, value: T): Promise<void>;
  delete(store: StoreName, key: string): Promise<void>;
  clear(store: StoreName): Promise<void>;
}

export interface Database {
  read<T>(stores: StoreName[], fn: (tx: Tx) => Promise<T>): Promise<T>;
  /** Runs fn atomically. If fn throws, nothing it wrote is kept. */
  write<T>(stores: StoreName[], fn: (tx: Tx) => Promise<T>): Promise<T>;
  /** Called after every committed write with the stores it touched. */
  subscribe(listener: (stores: StoreName[]) => void): () => void;
  close(): void;
}

export class StorageFullError extends Error {
  constructor() {
    super('พื้นที่จัดเก็บในเครื่องเต็ม ลองลบรูปถ่ายที่ไม่ใช้ หรือส่งออก Backup แล้วล้างข้อมูลบางส่วน');
    this.name = 'StorageFullError';
  }
}

export function isQuotaError(e: unknown): boolean {
  return (
    typeof e === 'object' &&
    e !== null &&
    'name' in e &&
    ((e as { name: string }).name === 'QuotaExceededError' || (e as { name: string }).name === 'NS_ERROR_DOM_QUOTA_REACHED')
  );
}

export function newId(prefix = ''): string {
  const rand =
    typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID().replace(/-/g, '').slice(0, 16)
      : Math.random().toString(36).slice(2, 18);
  return `${prefix}${Date.now().toString(36)}-${rand}`;
}

export function nowIso(): string {
  return new Date().toISOString();
}
