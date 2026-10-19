import { KEY_PATHS, type Database, type StoreName, type Tx } from './store.ts';

/**
 * In-memory Database used by unit tests (and as a fallback when IndexedDB is
 * unavailable, e.g. some private-browsing modes). Writes are staged on a copy
 * and committed only if the callback succeeds, mirroring IndexedDB semantics.
 */
export function createMemoryDatabase(): Database {
  let data = new Map<StoreName, Map<string, unknown>>();
  const listeners = new Set<(s: StoreName[]) => void>();
  const table = (m: Map<StoreName, Map<string, unknown>>, s: StoreName) => {
    let t = m.get(s);
    if (!t) {
      t = new Map();
      m.set(s, t);
    }
    return t;
  };
  const clone = <T>(v: T): T => (typeof structuredClone === 'function' ? structuredClone(v) : JSON.parse(JSON.stringify(v)));
  const makeTx = (m: Map<StoreName, Map<string, unknown>>, allowed: StoreName[], writable: boolean): Tx => {
    const guard = (s: StoreName, w: boolean) => {
      if (!allowed.includes(s)) throw new Error(`Store ${s} is not part of this transaction`);
      if (w && !writable) throw new Error('Read-only transaction');
    };
    return {
      async get<T>(s: StoreName, key: string) {
        guard(s, false);
        const v = table(m, s).get(key);
        return v === undefined ? undefined : clone(v as T);
      },
      async getAll<T>(s: StoreName) {
        guard(s, false);
        return [...table(m, s).values()].map((v) => clone(v as T));
      },
      async put<T>(s: StoreName, value: T) {
        guard(s, true);
        const key = (value as Record<string, unknown>)[KEY_PATHS[s]];
        if (typeof key !== 'string') throw new Error(`Missing key ${KEY_PATHS[s]} for ${s}`);
        table(m, s).set(key, clone(value));
      },
      async delete(s: StoreName, key: string) {
        guard(s, true);
        table(m, s).delete(key);
      },
      async clear(s: StoreName) {
        guard(s, true);
        table(m, s).clear();
      },
    };
  };
  return {
    read: (stores, fn) => fn(makeTx(data, stores, false)),
    async write(stores, fn) {
      const staged = new Map<StoreName, Map<string, unknown>>();
      for (const [k, v] of data) staged.set(k, new Map(v));
      const result = await fn(makeTx(staged, stores, true));
      data = staged;
      listeners.forEach((l) => l(stores));
      return result;
    },
    subscribe(l) {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    close() {
      listeners.clear();
    },
  };
}
