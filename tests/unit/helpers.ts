import { readFileSync } from 'node:fs';
import { createMemoryDatabase } from '../../src/db/memory.ts';
import { applyCatalog } from '../../src/services/catalogUpdate.ts';
import { validateCatalogFile } from '../../src/domain/validators.ts';
import type { CatalogFile } from '../../src/domain/types.ts';

export function loadSeedCatalog(): CatalogFile {
  const raw = JSON.parse(readFileSync(new URL('../../public/catalog/catalog.json', import.meta.url), 'utf8'));
  const r = validateCatalogFile(raw);
  if (!r.ok) throw new Error(r.errors.join('\n'));
  return r.value.catalog;
}

export async function seededDb() {
  const db = createMemoryDatabase();
  const catalog = loadSeedCatalog();
  await applyCatalog(db, catalog, 'bundled');
  return { db, catalog };
}
