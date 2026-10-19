import { test } from 'node:test';
import assert from 'node:assert/strict';
import { seededDb } from './helpers.ts';
import { collectionRepo } from '../../src/repositories/collectionRepo.ts';
import { isOwned } from '../../src/domain/types.ts';

const ECHO_KNIGHT = 'hirono-echo-knight';
const MIME_SILENT = 'hirono-mime-silent';

test('1. add an item to the collection', async () => {
  const { db } = await seededDb();
  const repo = collectionRepo(db);
  await repo.update(ECHO_KNIGHT, { personal_notes: 'got it at Siam' });
  const e = await repo.get(ECHO_KNIGHT);
  assert.equal(e?.personal_notes, 'got it at Siam');
  assert.equal(e?.status, 'NOT_OWNED');
  assert.equal((await repo.list()).length, 1);
});

test('2. setting status OWNED gives quantity 1 and logs history', async () => {
  const { db } = await seededDb();
  const repo = collectionRepo(db);
  const e = await repo.setStatus(ECHO_KNIGHT, 'OWNED');
  assert.equal(e.quantity, 1);
  assert.ok(isOwned(e));
  const h = await repo.history(ECHO_KNIGHT);
  assert.equal(h.length, 1);
  assert.equal(h[0].to_status, 'OWNED');
});

test('3. quantity 0 means not owned, even with a purchase record', async () => {
  const { db } = await seededDb();
  const repo = collectionRepo(db);
  await repo.setStatus(ECHO_KNIGHT, 'OWNED');
  await repo.update(ECHO_KNIGHT, { purchase_price: 390 });
  const e = await repo.setQuantity(ECHO_KNIGHT, 0);
  assert.equal(e.quantity, 0);
  assert.equal(e.status, 'NOT_OWNED');
  assert.equal(e.purchase_price, 390, 'purchase history is kept');
  assert.equal(isOwned(e), false);
  const back = await repo.setQuantity(ECHO_KNIGHT, 2);
  assert.equal(back.status, 'OWNED');
  assert.equal(back.quantity, 2);
});

test('status changes never create duplicate entries', async () => {
  const { db } = await seededDb();
  const repo = collectionRepo(db);
  for (const s of ['WISHLIST', 'ORDERED', 'OWNED', 'TRADE_OR_SELL', 'OWNED'] as const) await repo.setStatus(MIME_SILENT, s);
  assert.equal((await repo.list()).length, 1);
  assert.equal((await repo.history(MIME_SILENT)).length, 5);
});

test('unknown item ids are rejected', async () => {
  const { db } = await seededDb();
  await assert.rejects(() => collectionRepo(db).setStatus('hirono-does-not-exist', 'OWNED'));
});

test('invalid input is rejected and nothing is written', async () => {
  const { db } = await seededDb();
  const repo = collectionRepo(db);
  await assert.rejects(() => repo.update(ECHO_KNIGHT, { purchase_price: -5 }));
  assert.equal((await repo.list()).length, 0);
});

test('wishlist: add, then acquire moves the item to owned and removes the wish', async () => {
  const { db } = await seededDb();
  const repo = collectionRepo(db);
  await repo.saveWish(MIME_SILENT, { target_price: 3000, priority: 1, store_url: 'https://example.com/shop' });
  assert.equal((await repo.get(MIME_SILENT))?.status, 'WISHLIST');
  await repo.acquire(MIME_SILENT, { purchase_price: 2800 });
  const e = await repo.get(MIME_SILENT);
  assert.equal(e?.status, 'OWNED');
  assert.equal(e?.purchase_price, 2800);
  assert.equal(await repo.getWish(MIME_SILENT), undefined);
});

test('wishlist rejects javascript: links', async () => {
  const { db } = await seededDb();
  await assert.rejects(() => collectionRepo(db).saveWish(MIME_SILENT, { store_url: 'javascript:alert(1)' }));
});

test('quick add marks many items owned in one go and skips ones already owned', async () => {
  const { db } = await seededDb();
  const repo = collectionRepo(db);
  await repo.setStatus(ECHO_KNIGHT, 'OWNED');
  const added = await repo.addOwnedMany([ECHO_KNIGHT, MIME_SILENT, 'hirono-echo-eaten', MIME_SILENT]);
  assert.equal(added, 2);
  assert.equal((await repo.list()).length, 3);
});
