import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadSeedCatalog, seededDb } from './helpers.ts';
import { validateCatalogFile } from '../../src/domain/validators.ts';
import { applyCatalog, diffCatalog, readSnapshot } from '../../src/services/catalogUpdate.ts';
import { collectionRepo } from '../../src/repositories/collectionRepo.ts';
import { catalogRepo, DuplicateItemError } from '../../src/repositories/catalogRepo.ts';
import { isVerified } from '../../src/domain/types.ts';

test('seed catalog is valid, every verified row cites a source', () => {
  const cat = loadSeedCatalog();
  assert.ok(cat.items.length > 100);
  for (const it of cat.items) if (isVerified(it.verification_status)) assert.ok(it.sources.length > 0, it.id);
  assert.equal(cat.coverage.total_universe_known, false, 'the seed must not claim to be complete');
});

test('validation rejects duplicate ids and dangling references', () => {
  const cat = loadSeedCatalog();
  const broken = structuredClone(cat);
  broken.items.push({ ...broken.items[0] });
  broken.items[1] = { ...broken.items[1], series_id: 'series-nope' };
  const r = validateCatalogFile(broken);
  assert.equal(r.ok, false);
  if (!r.ok) {
    assert.ok(r.errors.some((e) => e.includes('Duplicate item id')));
    assert.ok(r.errors.some((e) => e.includes('unknown series')));
  }
});

test('12. catalog update adds, changes and archives without touching the collection', async () => {
  const { db, catalog } = await seededDb();
  const col = collectionRepo(db);
  const removedId = catalog.items[0].id;
  await col.setStatus(removedId, 'OWNED');
  await col.update(removedId, { purchase_price: 500, personal_notes: 'keep me' });
  await col.saveWish('hirono-echo-knight', { target_price: 400 });

  const next = structuredClone(catalog);
  next.catalog_version = 'test-2';
  next.items = next.items.filter((i) => i.id !== removedId);
  next.items[0] = { ...next.items[0], description: 'updated description' };
  next.items.push({ ...next.items[1], id: 'hirono-new-test-item', slug: 'new-test-item', name_en: 'New Test Item' });

  const diff = diffCatalog(await readSnapshot(db), next, new Set([removedId]));
  assert.equal(diff.items.added.length, 1);
  assert.equal(diff.items.changed.length, 1);
  assert.equal(diff.items.archived.length, 1);
  assert.equal(diff.personalEntriesOnArchived, 1);

  await applyCatalog(db, next, 'file');
  const archived = (await readSnapshot(db)).items.find((i) => i.id === removedId);
  assert.equal(archived?.archived, true, 'removed rows are archived, not deleted');
  const entry = await col.get(removedId);
  assert.equal(entry?.status, 'OWNED');
  assert.equal(entry?.personal_notes, 'keep me');
  assert.equal((await col.wishlist()).length, 1);
});

test('local items: duplicates are blocked, local rows survive a catalog update', async () => {
  const { db, catalog } = await seededDb();
  const repo = catalogRepo(db);
  const base = catalog.items.find((i) => i.id === 'hirono-echo-knight')!;
  await assert.rejects(
    () => repo.addItem({ ...base, id: undefined, name_en: ' knight ', sources: [] }),
    (e) => e instanceof DuplicateItemError,
  );
  const mine = await repo.addItem({
    name_en: 'Fan Event Pin',
    name_th: 'เข็มกลัดงานแฟนมีต',
    series_id: null,
    category: 'OTHER',
    subcategory: 'Pin',
    release_year: 2026,
    release_date: null,
    edition_type: 'SINGLE',
    rarity: null,
    product_code: null,
    description: null,
    images: [],
    verification_status: 'UNVERIFIED',
    sources: [],
    conflicts: [],
    aliases: [],
  });
  assert.equal(mine.origin, 'local');
  await applyCatalog(db, { ...catalog, catalog_version: 'v-next' }, 'remote');
  const after = await repo.item(mine.id);
  assert.equal(after?.archived, false);
});
