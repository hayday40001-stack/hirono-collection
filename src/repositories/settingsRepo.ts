import type { Database } from '../db/store.ts';
import { newId, nowIso } from '../db/store.ts';
import { DEFAULT_SETTINGS, type Photo, type Settings } from '../domain/types.ts';

export function settingsRepo(db: Database) {
  const get = async (): Promise<Settings> => {
    const s = await db.read(['settings'], (tx) => tx.get<Settings>('settings', 'settings'));
    return { ...DEFAULT_SETTINGS, ...s, profile: { ...DEFAULT_SETTINGS.profile, ...s?.profile } };
  };
  return {
    get,
    async update(patch: Partial<Omit<Settings, 'key'>>): Promise<Settings> {
      return db.write(['settings'], async (tx) => {
        const cur = await tx.get<Settings>('settings', 'settings');
        const next: Settings = { ...DEFAULT_SETTINGS, ...cur, ...patch, key: 'settings' };
        await tx.put('settings', next);
        return next;
      });
    },
    async markViewed(itemId: string) {
      return db.write(['settings'], async (tx) => {
        const cur = { ...DEFAULT_SETTINGS, ...(await tx.get<Settings>('settings', 'settings')) };
        if (cur.recently_viewed[0] === itemId) return;
        const recently_viewed = [itemId, ...cur.recently_viewed.filter((i) => i !== itemId)].slice(0, 12);
        await tx.put('settings', { ...cur, recently_viewed });
      });
    },
  };
}

export function photoRepo(db: Database) {
  return {
    list: () => db.read(['photos'], (tx) => tx.getAll<Photo>('photos')),
    async forItem(itemId: string) {
      return (await db.read(['photos'], (tx) => tx.getAll<Photo>('photos'))).filter((p) => p.item_id === itemId).sort((a, b) => a.created_at.localeCompare(b.created_at));
    },
    add: (itemId: string, blob: Blob, width: number, height: number) =>
      db.write(['photos'], async (tx) => {
        const p: Photo = { id: newId('ph-'), item_id: itemId, blob, width, height, created_at: nowIso() };
        await tx.put('photos', p);
        return p;
      }),
    remove: (id: string) => db.write(['photos'], (tx) => tx.delete('photos', id)),
  };
}

export type SettingsRepo = ReturnType<typeof settingsRepo>;
export type PhotoRepo = ReturnType<typeof photoRepo>;
