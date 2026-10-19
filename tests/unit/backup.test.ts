import { test } from 'node:test';
import assert from 'node:assert/strict';
import { seededDb } from './helpers.ts';
import { collectionRepo } from '../../src/repositories/collectionRepo.ts';
import { applyImport, createBackup, parseBackup, previewImport, undoLastImport } from '../../src/services/backup.ts';

test('9. a valid backup round-trips into an empty device', async () => {
  const a = await seededDb();
  const ra = collectionRepo(a.db);
  await ra.setStatus('hirono-echo-knight', 'OWNED');
  await ra.update('hirono-echo-knight', { purchase_price: 390, estimated_value: 450 });
  await ra.saveWish('hirono-mime-silent', { target_price: 3000 });
  const text = JSON.stringify(await createBackup(a.db, 'all', 'test'));

  const b = await seededDb();
  const parsed = parseBackup(text);
  assert.ok(parsed.ok);
  if (!parsed.ok) return;
  const preview = await previewImport(b.db, parsed.value, 'merge');
  assert.equal(preview.collection.add, 2);
  assert.equal(preview.wishlist.add, 1);
  await applyImport(b.db, parsed.value, 'merge');
  const rb = collectionRepo(b.db);
  assert.equal((await rb.get('hirono-echo-knight'))?.estimated_value, 450);
  assert.equal((await rb.wishlist()).length, 1);
});

test('10. malformed backups are rejected before anything is written', async () => {
  const { db } = await seededDb();
  const repo = collectionRepo(db);
  await repo.setStatus('hirono-echo-knight', 'OWNED');
  for (const bad of [
    'not json',
    '{"hello":1}',
    JSON.stringify({ format: 'hirono-collection-backup', schema_version: 1, data_version: 1, app_version: 'x', created_at: 'x', scope: 'all', collection: [{ item_id: 'hirono-echo-knight', status: 'MAYBE', quantity: -1 }] }),
    JSON.stringify({ format: 'hirono-collection-backup', schema_version: 99, data_version: 1, app_version: 'x', created_at: 'x', scope: 'all' }),
  ]) {
    assert.equal(parseBackup(bad).ok, false, bad.slice(0, 40));
  }
  assert.equal((await repo.list()).length, 1, 'existing data untouched');
});

test('11. merge keeps one entry per item and the newer edit wins', async () => {
  const { db } = await seededDb();
  const repo = collectionRepo(db);
  await repo.setStatus('hirono-echo-knight', 'OWNED');
  const backup = await createBackup(db, 'all', 'test');
  await repo.update('hirono-echo-knight', { personal_notes: 'newer note on device' });

  const preview = await previewImport(db, backup, 'merge');
  assert.equal(preview.collection.skip, 1);
  await applyImport(db, backup, 'merge');
  await applyImport(db, backup, 'merge');
  const list = await repo.list();
  assert.equal(list.length, 1);
  assert.equal(list[0].personal_notes, 'newer note on device');
});

test('replace can be undone', async () => {
  const { db } = await seededDb();
  const repo = collectionRepo(db);
  await repo.setStatus('hirono-echo-knight', 'OWNED');
  const empty = await createBackup(db, 'all', 'test');
  empty.collection = [];
  empty.status_history = [];
  const preview = await previewImport(db, empty, 'replace');
  assert.equal(preview.willRemove, 1);
  await applyImport(db, empty, 'replace');
  assert.equal((await repo.list()).length, 0);
  assert.equal(await undoLastImport(db), true);
  assert.equal((await repo.list()).length, 1);
});

test('duplicate ids inside a backup file are rejected', async () => {
  const { db } = await seededDb();
  await collectionRepo(db).setStatus('hirono-echo-knight', 'OWNED');
  const b = await createBackup(db, 'all', 'test');
  b.collection.push({ ...b.collection[0] });
  assert.equal(parseBackup(JSON.stringify(b)).ok, false);
});
