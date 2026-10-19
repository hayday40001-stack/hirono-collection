import { KEY_PATHS, STORES, StorageFullError, isQuotaError, type Database, type StoreName, type Tx } from './store.ts';

export const DB_NAME = 'hirono-collection';
/**
 * IndexedDB structural version. Bump it and add a branch in `upgrade` when a
 * new object store or index is needed. Data-shape migrations live in
 * migrations.ts and run on top of this.
 */
export const IDB_VERSION = 2;

function upgrade(db: IDBDatabase, oldVersion: number) {
  if (oldVersion < 1) {
    for (const name of Object.values(STORES)) {
      if (!db.objectStoreNames.contains(name)) db.createObjectStore(name, { keyPath: KEY_PATHS[name] });
    }
  }
  if (oldVersion < 2) {
    if (!db.objectStoreNames.contains('customImages')) db.createObjectStore('customImages', { keyPath: KEY_PATHS.customImages });
  }
}

function req<T>(r: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
}

export function openIndexedDb(name = DB_NAME): Promise<Database> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('IndexedDB is not available in this browser'));
      return;
    }
    const open = indexedDB.open(name, IDB_VERSION);
    open.onupgradeneeded = (ev) => upgrade(open.result, ev.oldVersion);
    open.onblocked = () => reject(new Error('ปิดแท็บอื่นของแอปนี้ก่อน แล้วโหลดหน้าใหม่ (ฐานข้อมูลกำลังอัปเกรด)'));
    open.onerror = () => reject(open.error);
    open.onsuccess = () => resolve(wrap(open.result));
  });
}

function wrap(db: IDBDatabase): Database {
  const listeners = new Set<(s: StoreName[]) => void>();
  // Tell other tabs/windows of the installed app that data changed.
  const channel = typeof BroadcastChannel !== 'undefined' ? new BroadcastChannel('hirono-db') : null;
  if (channel) channel.onmessage = (ev) => listeners.forEach((l) => l(ev.data as StoreName[]));
  db.onversionchange = () => db.close();

  const makeTx = (t: IDBTransaction): Tx => ({
    get: <T>(s: StoreName, key: string) => req(t.objectStore(s).get(key)) as Promise<T | undefined>,
    getAll: <T>(s: StoreName) => req(t.objectStore(s).getAll()) as Promise<T[]>,
    put: async (s, value) => {
      await req(t.objectStore(s).put(value));
    },
    delete: async (s, key) => {
      await req(t.objectStore(s).delete(key));
    },
    clear: async (s) => {
      await req(t.objectStore(s).clear());
    },
  });

  async function run<T>(stores: StoreName[], mode: IDBTransactionMode, fn: (tx: Tx) => Promise<T>): Promise<T> {
    const t = db.transaction(stores, mode);
    const done = new Promise<void>((resolve, reject) => {
      t.oncomplete = () => resolve();
      t.onabort = () => reject(t.error ?? new Error('Transaction aborted'));
      t.onerror = () => reject(t.error);
    });
    let result: T;
    try {
      result = await fn(makeTx(t));
    } catch (e) {
      try {
        t.abort();
      } catch {
        /* already finished */
      }
      await done.catch(() => undefined);
      throw isQuotaError(e) ? new StorageFullError() : e;
    }
    try {
      await done;
    } catch (e) {
      throw isQuotaError(e) ? new StorageFullError() : e;
    }
    return result;
  }

  return {
    read: (stores, fn) => run(stores, 'readonly', fn),
    async write(stores, fn) {
      const r = await run(stores, 'readwrite', fn);
      listeners.forEach((l) => l(stores));
      channel?.postMessage(stores);
      return r;
    },
    subscribe(l) {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    close() {
      channel?.close();
      db.close();
    },
  };
}

/** Ask the browser not to evict our data under storage pressure (best effort). */
export async function requestPersistentStorage(): Promise<boolean | null> {
  try {
    if (navigator.storage?.persist) return await navigator.storage.persist();
  } catch {
    /* ignore */
  }
  return null;
}

export async function storageEstimate(): Promise<{ usage: number; quota: number } | null> {
  try {
    const e = await navigator.storage?.estimate?.();
    if (e && typeof e.usage === 'number' && typeof e.quota === 'number') return { usage: e.usage, quota: e.quota };
  } catch {
    /* ignore */
  }
  return null;
}
