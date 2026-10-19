// End-to-end tests in a real Chromium (Playwright): persistence, offline,
// service worker update, backup round-trip, search, privacy.
// Run after a build:  npm run test:e2e   (or: node tests/e2e/run.mjs)
import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { cpSync, existsSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { extname, join, resolve } from 'node:path';
import assert from 'node:assert/strict';

const root = resolve(new URL('../..', import.meta.url).pathname);
let distDir = join(root, 'dist');
const PORT = Number(process.env.E2E_PORT || 4329);
const BASE = `http://localhost:${PORT}/`;
const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.png': 'image/png' };
const server = createServer((req, res) => {
  let p = join(distDir, decodeURIComponent(new URL(req.url, 'http://x').pathname));
  if (existsSync(p) && statSync(p).isDirectory()) p = join(p, 'index.html');
  if (!existsSync(p)) return res.writeHead(404).end();
  res.writeHead(200, { 'content-type': types[extname(p)] || 'application/octet-stream', 'cache-control': 'no-cache' });
  res.end(readFileSync(p));
}).listen(PORT);

const work = mkdtempSync(join(tmpdir(), 'hirono-e2e-'));
const results = [];
const requests = [];
async function step(name, fn) {
  const t = Date.now();
  try {
    await fn();
    results.push({ name, ok: true, ms: Date.now() - t });
    console.log(`ok   ${name}`);
  } catch (e) {
    results.push({ name, ok: false, error: String(e?.message ?? e).split('\n')[0] });
    console.log(`FAIL ${name}\n     ${String(e?.message ?? e).split('\n').slice(0, 3).join('\n     ')}`);
  }
}

async function open(profile, viewport = { width: 390, height: 844 }) {
  const ctx = await chromium.launchPersistentContext(profile, { viewport, acceptDownloads: true, serviceWorkers: 'allow' });
  ctx.on('request', (r) => requests.push({ url: r.url(), method: r.method(), post: r.postData() }));
  // Fonts are optional; block them so tests don't depend on Google being reachable.
  await ctx.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.abort());
  ctx.setDefaultTimeout(15000);
  const page = ctx.pages()[0] ?? (await ctx.newPage());
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('crash', () => console.log('     [page crashed]'));
  page.on('close', () => process.env.E2E_DEBUG && console.log('     [page closed]'));
  ctx.on('close', () => process.env.E2E_DEBUG && console.log('     [context closed]'));
  return { ctx, page, errors };
}
const go = async (page, hash) => {
  await page.evaluate((h) => (location.hash = h), hash);
  await page.waitForTimeout(250);
};
const stepper = (page) => page.locator('.stepper output');

const profileA = join(work, 'profile-a');
let { ctx, page, errors } = await open(profileA);

await step('app boots and installs the bundled catalog', async () => {
  await page.goto(BASE);
  await page.getByRole('heading', { level: 1 }).first().waitFor();
  await page.waitForFunction(() => document.body.innerText.includes('รายการใน Catalog'));
  const n = await page.locator('.figures .num').first().innerText();
  assert.ok(Number(n) > 100, `catalog count ${n}`);
});

await step('1-2. add an item to the collection and set it to OWNED', async () => {
  await go(page, '#/item/hirono-echo-knight');
  await page.locator('.segmented button[data-status="OWNED"]').click();
  await page.waitForFunction(() => document.querySelector('.stepper output')?.textContent === '1');
  assert.equal(await page.locator('.segmented button[data-status="OWNED"]').getAttribute('aria-pressed'), 'true');
});

await step('3. quantity 0 is not owned', async () => {
  await page.getByRole('button', { name: 'เพิ่มจำนวน' }).click();
  await page.waitForFunction(() => document.querySelector('.stepper output')?.textContent === '2');
  await page.getByRole('button', { name: 'ลดจำนวน' }).click();
  await page.waitForFunction(() => document.querySelector('.stepper output')?.textContent === '1');
  await page.getByRole('button', { name: 'ลดจำนวน' }).click();
  await page.waitForFunction(() => document.querySelector('.stepper output')?.textContent === '0');
  assert.equal(await page.locator('.segmented button[data-status="NOT_OWNED"]').getAttribute('aria-pressed'), 'true');
  await page.locator('.segmented button[data-status="OWNED"]').click();
  await page.waitForFunction(() => document.querySelector('.stepper output')?.textContent === '1');
  await page.getByLabel(/ราคาที่ซื้อ/).fill('390');
  await page.getByRole('button', { name: 'บันทึกรายละเอียด' }).click();
  await page.getByText('บันทึกรายละเอียดแล้ว').waitFor();
});

await step('4. data survives a page reload', async () => {
  await page.reload();
  await page.locator('.stepper output').waitFor();
  assert.equal(await stepper(page).innerText(), '1');
  assert.equal(await page.getByLabel(/ราคาที่ซื้อ/).inputValue(), '390');
});

await step('5. data survives closing and reopening the app', async () => {
  await ctx.close();
  ({ ctx, page, errors } = await open(profileA));
  await page.goto(`${BASE}#/item/hirono-echo-knight`);
  await page.locator('.stepper output').waitFor();
  assert.equal(await stepper(page).innerText(), '1');
});

await step('quick add marks several items owned without reopening the form', async () => {
  await go(page, '#/collection');
  await page.getByRole('button', { name: /เพิ่มหลายรายการ/ }).click();
  const dlg = page.locator('dialog.sheet[open]');
  await dlg.getByRole('searchbox').fill('mime');
  await dlg.getByLabel('เลือก Silent').check();
  await dlg.getByLabel('เลือก Poem').check();
  await dlg.getByRole('button', { name: /แล้วเพิ่มต่อ/ }).click();
  await page.getByText('บันทึก 2 รุ่นเป็น “มีแล้ว”').waitFor();
  assert.ok(await dlg.isVisible(), 'sheet stays open for the next batch');
  await dlg.getByRole('button', { name: 'ปิด', exact: true }).click();
  await page.waitForFunction(() => document.querySelectorAll('.list-row').length >= 3);
});

await step('6. search in English and Thai (incl. a Thai-named local item)', async () => {
  await go(page, '#/catalog');
  await page.getByRole('tab', { name: 'เพิ่มรายการ' }).click();
  await page.getByLabel('ชื่อภาษาอังกฤษ *').fill('Bangkok Pop-up Badge');
  await page.getByLabel('ชื่อภาษาไทย').fill('เข็มกลัดป๊อปอัพกรุงเทพ');
  await page.getByRole('button', { name: /เพิ่มรายการ แล้วเพิ่มต่อ/ }).click();
  await page.getByText(/เพิ่ม “Bangkok Pop-up Badge” แล้ว/).waitFor();
  await go(page, '#/explore?q=' + encodeURIComponent('กรุงเทพ'));
  await page.getByText('เข็มกลัดป๊อปอัพกรุงเทพ').first().waitFor();
  await go(page, '#/explore?q=never%20growing');
  await page.getByText('Never Growing Up').first().waitFor();
  await go(page, '#/explore?q=' + encodeURIComponent('ซีเคร็ต echo'));
  await page.getByText('Never Growing Up').first().waitFor();
  await go(page, '#/explore?q=zzzz');
  await page.getByText('ไม่พบรายการที่ตรงกับตัวกรอง').waitFor();
});

await step('7. filter to missing items only', async () => {
  await go(page, '#/explore?own=missing');
  const total = Number((await page.getByText(/^พบ \d+ รายการ$/).innerText()).match(/\d+/)[0]);
  await go(page, '#/explore');
  const all = Number((await page.getByText(/^พบ \d+ รายการ$/).innerText()).match(/\d+/)[0]);
  assert.equal(all - total, 3, `all=${all} missing=${total}`);
});

await step('8. completion percent on the home page matches owned/verified', async () => {
  await go(page, '#/');
  const text = await page.locator('.hero .count').innerText();
  const [owned, verified] = text.match(/\d+/g).map(Number);
  assert.equal(owned, 3);
  const meta = await page.locator('.hero .meta').innerText();
  assert.ok(meta.startsWith(`${((owned / verified) * 100).toFixed(1)}%`), meta);
});

let backupPath = '';
await step('backup: export everything', async () => {
  await go(page, '#/backup');
  const [dl] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: /สำรองทั้งหมดตอนนี้/ }).click()]);
  backupPath = join(work, 'backup.json');
  await dl.saveAs(backupPath);
  const b = JSON.parse(readFileSync(backupPath, 'utf8'));
  assert.equal(b.format, 'hirono-collection-backup');
  assert.equal(b.collection.length, 3);
  assert.equal(b.local_catalog.items.length, 1);
});

await step('13. app opens offline once installed', async () => {
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });
  await page.reload();
  await page.waitForFunction(() => !!navigator.serviceWorker.controller);
  await ctx.setOffline(true);
  await page.reload();
  await page.locator('.figures').waitFor();
  await go(page, '#/item/hirono-echo-knight');
  assert.equal(await stepper(page).innerText(), '1');
  await ctx.setOffline(false);
});

await step('14. service worker update keeps personal data', async () => {
  const next = join(work, 'dist-next');
  cpSync(distDir, next, { recursive: true });
  const swPath = join(next, 'sw.js');
  writeFileSync(swPath, readFileSync(swPath, 'utf8').replace(/const BUILD = '([^']+)'/, "const BUILD = '$1-next'"));
  distDir = next;
  await page.evaluate(async () => (await navigator.serviceWorker.getRegistration()).update());
  await page.getByText('มีแอปเวอร์ชันใหม่').waitFor({ timeout: 15000 });
  await Promise.all([page.waitForEvent('load'), page.getByRole('button', { name: 'อัปเดตตอนนี้' }).click()]);
  await page.waitForFunction(async () => (await caches.keys()).some((k) => k.endsWith('-next')));
  const keys = await page.evaluate(() => caches.keys());
  assert.ok(!keys.some((k) => k.startsWith('hirono-shell-') && !k.endsWith('-next')), `old shell cache removed: ${keys}`);
  assert.ok(keys.includes('hirono-catalog-v1'));
  await go(page, '#/item/hirono-echo-knight');
  await page.locator('.stepper output').waitFor();
  assert.equal(await stepper(page).innerText(), '1');
});

await ctx.close();
const profileB = join(work, 'profile-b');
({ ctx, page, errors } = await open(profileB));

await step('10. a malformed backup is rejected and nothing changes', async () => {
  await page.goto(`${BASE}#/backup`);
  const bad = join(work, 'bad.json');
  writeFileSync(bad, JSON.stringify({ format: 'hirono-collection-backup', schema_version: 1, data_version: 1, app_version: 'x', created_at: 'x', scope: 'all', collection: [{ item_id: 'x', status: 'NOPE' }] }));
  await page.getByLabel('เลือกไฟล์ Backup (.json)').setInputFiles(bad);
  await page.getByRole('alert').getByText('นำเข้าไฟล์นี้ไม่ได้').waitFor();
  await go(page, '#/collection');
  await page.getByText('คลังของคุณยังว่าง').waitFor();
});

await step('9 + 11. import a valid backup, twice, without duplicates', async () => {
  await go(page, '#/backup');
  for (let i = 0; i < 2; i++) {
    await page.getByLabel('เลือกไฟล์ Backup (.json)').setInputFiles(backupPath);
    await page.getByRole('button', { name: 'นำเข้า', exact: true }).click();
    await page.getByText(/^นำเข้าแล้ว/).waitFor();
  }
  await go(page, '#/collection');
  await page.waitForFunction(() => document.querySelectorAll('.list-row').length === 3);
  await go(page, '#/explore?q=' + encodeURIComponent('กรุงเทพ'));
  await page.getByText('เข็มกลัดป๊อปอัพกรุงเทพ').first().waitFor();
});

await step('12. catalog update check does not touch the collection', async () => {
  await go(page, '#/catalog');
  await page.getByRole('button', { name: 'ตรวจหา Catalog ใหม่' }).click();
  await page.getByText(/เวอร์ชันล่าสุดแล้ว/).waitFor();
  await go(page, '#/collection');
  await page.waitForFunction(() => document.querySelectorAll('.list-row').length === 3);
});

await step('responsive: no horizontal scroll on phone and desktop', async () => {
  for (const vp of [{ width: 360, height: 740 }, { width: 1280, height: 800 }]) {
    await page.setViewportSize(vp);
    for (const h of ['#/', '#/explore', '#/item/hirono-echo-knight', '#/collection', '#/stats', '#/backup', '#/catalog']) {
      await go(page, h);
      const over = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      assert.ok(over <= 1, `${h} at ${vp.width}px overflows by ${over}px`);
    }
  }
});

await step('17. no personal data leaves the device', async () => {
  const foreign = requests.filter((r) => !r.url.startsWith(BASE) && !/fonts\.(googleapis|gstatic)\.com/.test(r.url));
  assert.deepEqual(foreign.map((r) => r.url), []);
  const posts = requests.filter((r) => r.method !== 'GET');
  assert.deepEqual(posts.map((r) => `${r.method} ${r.url}`), []);
  const leak = requests.filter((r) => /390|Bangkok|กรุงเทพ/.test(decodeURIComponent(r.url)));
  assert.deepEqual(leak.map((r) => r.url), []);
});

await step('no uncaught page errors', async () => {
  assert.deepEqual(errors, [], errors.join('\n'));
});

await ctx.close();
server.closeAllConnections?.();
server.close();
rmSync(work, { recursive: true, force: true });
const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} e2e checks passed`);
writeFileSync(join(root, 'e2e-results.json'), JSON.stringify(results, null, 1));
process.exit(failed.length ? 1 : 0);
