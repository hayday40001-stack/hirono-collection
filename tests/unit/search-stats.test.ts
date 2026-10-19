import { test } from 'node:test';
import assert from 'node:assert/strict';
import { seededDb } from './helpers.ts';
import { collectionRepo } from '../../src/repositories/collectionRepo.ts';
import { catalogRepo } from '../../src/repositories/catalogRepo.ts';
import { DEFAULT_FILTERS, filterItems, matches, normalize } from '../../src/services/search.ts';
import { overview, seriesProgress } from '../../src/services/stats.ts';
import { csvCell, parseItemCsv } from '../../src/services/csv.ts';
import { readSnapshot } from '../../src/services/catalogUpdate.ts';

async function setup() {
  const { db } = await seededDb();
  const snap = await readSnapshot(db);
  return { db, snap, seriesById: new Map(snap.series.map((s) => [s.id, s])) };
}

test('6. search works in English and Thai', async () => {
  const { db, seriesById } = await setup();
  await catalogRepo(db).addItem({
    name_en: 'Bangkok Pop-up Badge', name_th: 'เข็มกลัดป๊อปอัพกรุงเทพ', series_id: null, category: 'OTHER', subcategory: 'Badge', release_year: 2026, release_date: null,
    edition_type: 'SINGLE', rarity: null, product_code: 'BKK-01', description: null, images: [], verification_status: 'UNVERIFIED', sources: [], conflicts: [], aliases: [],
  });
  const items = (await readSnapshot(db)).items;
  const run = (query: string) => filterItems(items, seriesById, new Map(), new Set(), { ...DEFAULT_FILTERS, query }).map((i) => i.name_en);
  assert.ok(run('never growing').includes('Never Growing Up'));
  assert.ok(run('echo knight').includes('Knight'));
  assert.ok(run('Le Petit Prince fox').includes('The Fox'));
  assert.ok(run('กรุงเทพ').includes('Bangkok Pop-up Badge'), 'Thai name');
  assert.ok(run('bkk-01').includes('Bangkok Pop-up Badge'), 'product code');
  assert.ok(run('ซีเคร็ต mime').includes('Silent'), 'Thai edition label + English series');
  assert.equal(run('zzzz-nothing').length, 0);
  assert.equal(normalize('Hirono × Snoopy'), 'hirono x snoopy');
  assert.ok(matches(normalize("Monsters' Carnival"), 'monsters carnival'));
});

test('7. filter to missing only', async () => {
  const { db, snap, seriesById } = await setup();
  const repo = collectionRepo(db);
  await repo.setStatus('hirono-echo-knight', 'OWNED');
  const entries = new Map((await repo.list()).map((e) => [e.item_id, e]));
  const echoMissing = filterItems(snap.items, seriesById, entries, new Set(), { ...DEFAULT_FILTERS, ownership: 'missing', query: 'echo' }).filter((i) => i.series_id === 'series-echo');
  assert.equal(echoMissing.length, 12);
  assert.ok(!echoMissing.some((i) => i.id === 'hirono-echo-knight'));
  const owned = filterItems(snap.items, seriesById, entries, new Set(), { ...DEFAULT_FILTERS, ownership: 'owned' });
  assert.deepEqual(owned.map((i) => i.id), ['hirono-echo-knight']);
});

test('8. completion percent uses verified items only and series completion needs a complete roster', async () => {
  const { db, snap } = await setup();
  const repo = collectionRepo(db);
  const echo = snap.items.filter((i) => i.series_id === 'series-echo');
  for (const i of echo) await repo.setStatus(i.id, 'OWNED');
  const mercy = snap.items.filter((i) => i.series_id === 'series-city-of-mercy');
  for (const i of mercy) await repo.setStatus(i.id, 'OWNED');
  const entries = await repo.list();
  const ov = overview(snap.items, snap.series, entries, [], false);
  const verified = snap.items.filter((i) => i.verification_status.startsWith('VERIFIED')).length;
  assert.equal(ov.verifiedItems, verified);
  assert.equal(ov.ownedVerifiedModels, echo.length);
  assert.equal(ov.ownedModels, echo.length + mercy.length);
  assert.ok(Math.abs((ov.percent ?? 0) - echo.length / verified) < 1e-9);
  const prog = seriesProgress(snap.series, snap.items, new Map(entries.map((e) => [e.item_id, e])));
  assert.equal(prog.find((p) => p.series.id === 'series-echo')?.complete, true);
  const m = prog.find((p) => p.series.id === 'series-city-of-mercy');
  assert.equal(m?.owned, m?.total);
  assert.equal(m?.complete, false, 'unverified roster is never complete');
  assert.equal(ov.seriesComplete, 1);
  assert.equal(ov.secretsOwned, 2);
});

test('quantity counts pieces separately from styles; value only from user input', async () => {
  const { db, snap } = await setup();
  const repo = collectionRepo(db);
  await repo.setQuantity('hirono-echo-knight', 3);
  await repo.update('hirono-echo-knight', { purchase_price: 400, estimated_value: 500 });
  await repo.setQuantity('hirono-echo-eaten', 1);
  const ov = overview(snap.items, snap.series, await repo.list(), [], false);
  assert.equal(ov.ownedModels, 2);
  assert.equal(ov.ownedPieces, 4);
  assert.equal(ov.spent.total, 1200);
  assert.equal(ov.spent.entriesWithPrice, 1);
  assert.equal(ov.value.total, 1500);
});

test('csv: formula injection is neutralised and item import validates rows', () => {
  assert.equal(csvCell('=HYPERLINK("x")'), `"'=HYPERLINK(""x"")"`);
  const { rows, errors } = parseItemCsv('name_en,category,edition_type,release_year\n"Hello, World",OTHER,SINGLE,2026\nBad,NOPE,REGULAR,\n,OTHER,REGULAR,2020');
  assert.equal(rows.length, 1);
  assert.equal(rows[0].name_en, 'Hello, World');
  assert.equal(errors.length, 2);
});

test('16. large data: 20,000 items filter in reasonable time', async () => {
  const { snap, seriesById } = await setup();
  const base = snap.items[0];
  const many = Array.from({ length: 20000 }, (_, i) => ({ ...base, id: `bulk-${i}`, name_en: `Bulk Figure ${i}` }));
  const t = performance.now();
  const r = filterItems(many, seriesById, new Map(), new Set(), { ...DEFAULT_FILTERS, query: 'figure 1999' });
  const ms = performance.now() - t;
  assert.ok(r.some((i) => i.name_en === 'Bulk Figure 1999'));
  assert.ok(ms < 1500, `took ${ms.toFixed(0)}ms`);
});
