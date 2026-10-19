import type { Database } from './store.ts';
import { nowIso } from './store.ts';

/**
 * Data migrations for personal data stored on the device. Each step runs
 * once, in order, inside one transaction, and bumps `data_version`.
 * Never delete user data in a migration; transform it.
 */
export const DATA_VERSION = 1;

interface SchemaMeta {
  key: 'schema';
  data_version: number;
  migrated_at: string;
}

type Migration = { to: number; run: (db: Database) => Promise<void> };

const MIGRATIONS: Migration[] = [
  // { to: 2, run: async (db) => db.write(['collection'], async (tx) => { ... }) },
];

export async function runMigrations(db: Database): Promise<number> {
  const meta = await db.read(['meta'], (tx) => tx.get<SchemaMeta>('meta', 'schema'));
  let version = meta?.data_version ?? 0;
  if (version > DATA_VERSION) {
    throw new Error('ข้อมูลในเครื่องถูกสร้างโดยแอปเวอร์ชันใหม่กว่านี้ กรุณาโหลดหน้าใหม่เพื่ออัปเดตแอป');
  }
  for (const m of MIGRATIONS) {
    if (m.to > version) {
      await m.run(db);
      version = m.to;
    }
  }
  if (!meta || meta.data_version !== DATA_VERSION) {
    await db.write(['meta'], (tx) => tx.put<SchemaMeta>('meta', { key: 'schema', data_version: DATA_VERSION, migrated_at: nowIso() }));
  }
  return DATA_VERSION;
}
