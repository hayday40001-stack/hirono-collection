import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { Database } from '../db/store.ts';
import { openIndexedDb, requestPersistentStorage } from '../db/idb.ts';
import { createMemoryDatabase } from '../db/memory.ts';
import { runMigrations } from '../db/migrations.ts';
import { collectionRepo } from '../repositories/collectionRepo.ts';
import { catalogRepo } from '../repositories/catalogRepo.ts';
import { imageRepo, photoRepo, settingsRepo } from '../repositories/settingsRepo.ts';
import { applyCatalog, fetchPublishedCatalog } from '../services/catalogUpdate.ts';
import type { CatalogMeta, CollectionEntry, CustomImage, Item, Series, Settings, Source, WishlistEntry } from '../domain/types.ts';
import { DEFAULT_SETTINGS } from '../domain/types.ts';

export const APP_VERSION = typeof __APP_VERSION__ === 'string' ? __APP_VERSION__ : 'dev';

function makeRepos(db: Database) {
  return {
    collection: collectionRepo(db),
    catalog: catalogRepo(db),
    settings: settingsRepo(db),
    photos: photoRepo(db),
    images: imageRepo(db),
  };
}
export type Repos = ReturnType<typeof makeRepos>;

export interface DataState {
  meta: CatalogMeta | undefined;
  items: Item[];
  series: Series[];
  sources: Source[];
  itemsById: Map<string, Item>;
  seriesById: Map<string, Series>;
  sourcesById: Map<string, Source>;
  entries: Map<string, CollectionEntry>;
  entryList: CollectionEntry[];
  wishlist: Map<string, WishlistEntry>;
  /** item_id -> image link the user pasted */
  customImages: Map<string, string>;
  settings: Settings;
}

type Boot =
  | { phase: 'loading' }
  | { phase: 'error'; message: string }
  | { phase: 'ready'; db: Database; repos: Repos; persistent: boolean; catalogError: string | null };

interface Ctx {
  db: Database;
  repos: Repos;
  data: DataState;
  /** true when IndexedDB couldn't open and data lives only in memory for this visit. */
  volatile: boolean;
  catalogError: string | null;
  retryCatalog: () => Promise<void>;
}

const AppCtx = createContext<Ctx | null>(null);

export function useApp(): Ctx {
  const c = useContext(AppCtx);
  if (!c) throw new Error('useApp outside provider');
  return c;
}
export const useData = () => useApp().data;
export const useRepos = () => useApp().repos;

async function loadData(db: Database): Promise<DataState> {
  return db.read(['meta', 'items', 'series', 'sources', 'collection', 'wishlist', 'settings', 'customImages'], async (tx) => {
    const [meta, items, series, sources, entryList, wish, settings, images] = await Promise.all([
      tx.get<CatalogMeta>('meta', 'catalog'),
      tx.getAll<Item>('items'),
      tx.getAll<Series>('series'),
      tx.getAll<Source>('sources'),
      tx.getAll<CollectionEntry>('collection'),
      tx.getAll<WishlistEntry>('wishlist'),
      tx.get<Settings>('settings', 'settings'),
      tx.getAll<CustomImage>('customImages'),
    ]);
    return {
      meta,
      items,
      series,
      sources,
      itemsById: new Map(items.map((i) => [i.id, i])),
      seriesById: new Map(series.map((s) => [s.id, s])),
      sourcesById: new Map(sources.map((s) => [s.id, s])),
      entries: new Map(entryList.map((e) => [e.item_id, e])),
      entryList,
      wishlist: new Map(wish.map((w) => [w.item_id, w])),
      customImages: new Map(images.map((i) => [i.item_id, i.url])),
      settings: { ...DEFAULT_SETTINGS, ...settings, profile: { ...DEFAULT_SETTINGS.profile, ...settings?.profile } },
    };
  });
}

async function installCatalogIfMissing(db: Database): Promise<string | null> {
  const meta = await db.read(['meta'], (tx) => tx.get<CatalogMeta>('meta', 'catalog'));
  if (meta) return null;
  const r = await fetchPublishedCatalog();
  if (!r.ok) return r.errors.join(' ');
  await applyCatalog(db, r.value.catalog, 'bundled');
  return null;
}

export function AppProvider({ children, fallback }: { children: ReactNode; fallback: (boot: Boot, retry: () => void) => ReactNode }) {
  const [boot, setBoot] = useState<Boot>({ phase: 'loading' });
  const [data, setData] = useState<DataState | null>(null);
  const [volatile, setVolatile] = useState(false);
  const reloading = useRef(false);

  const start = useCallback(async () => {
    setBoot({ phase: 'loading' });
    let db: Database;
    let isVolatile = false;
    try {
      db = await openIndexedDb();
    } catch (e) {
      console.warn('IndexedDB unavailable, using memory', e);
      db = createMemoryDatabase();
      isVolatile = true;
    }
    try {
      await runMigrations(db);
      const catalogError = await installCatalogIfMissing(db);
      const persistent = isVolatile ? false : (await requestPersistentStorage()) ?? false;
      setVolatile(isVolatile);
      setData(await loadData(db));
      setBoot({ phase: 'ready', db, repos: makeRepos(db), persistent, catalogError });
    } catch (e) {
      setBoot({ phase: 'error', message: e instanceof Error ? e.message : String(e) });
    }
  }, []);

  useEffect(() => {
    void start();
  }, [start]);

  useEffect(() => {
    if (boot.phase !== 'ready') return;
    const { db } = boot;
    let pending = false;
    const refresh = () => {
      if (reloading.current) {
        pending = true;
        return;
      }
      reloading.current = true;
      loadData(db)
        .then(setData)
        .finally(() => {
          reloading.current = false;
          if (pending) {
            pending = false;
            refresh();
          }
        });
    };
    return db.subscribe(refresh);
  }, [boot]);

  const retryCatalog = useCallback(async () => {
    if (boot.phase !== 'ready') return;
    const err = await installCatalogIfMissing(boot.db);
    setBoot({ ...boot, catalogError: err });
    setData(await loadData(boot.db));
  }, [boot]);

  const value = useMemo<Ctx | null>(
    () => (boot.phase === 'ready' && data ? { db: boot.db, repos: boot.repos, data, volatile, catalogError: boot.catalogError, retryCatalog } : null),
    [boot, data, volatile, retryCatalog],
  );

  if (!value) return <>{fallback(boot, () => void start())}</>;
  return <AppCtx.Provider value={value}>{children}</AppCtx.Provider>;
}

declare global {
  const __APP_VERSION__: string;
}
