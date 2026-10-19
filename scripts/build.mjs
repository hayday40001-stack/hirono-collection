// Build: bundles the app with esbuild, copies public/, writes index.html with
// hashed asset names and generates sw.js with the exact list of files to precache.
//   node scripts/build.mjs           -> dist/
//   node scripts/build.mjs --serve   -> build, watch and serve on http://localhost:5173
import * as esbuild from 'esbuild';
import { createHash } from 'node:crypto';
import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { dirname, extname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const out = resolve(root, process.env.OUT_DIR || 'dist');
const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
const serve = process.argv.includes('--serve');

function walk(dir) {
  return readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    return statSync(p).isDirectory() ? walk(p) : [p];
  });
}

async function build() {
  rmSync(out, { recursive: true, force: true });
  mkdirSync(out, { recursive: true });
  const result = await esbuild.build({
    entryPoints: { app: join(root, 'src/main.tsx') },
    bundle: true,
    outdir: join(out, 'assets'),
    entryNames: '[name]-[hash]',
    assetNames: '[name]-[hash]',
    format: 'esm',
    splitting: false,
    minify: !serve,
    sourcemap: serve ? 'inline' : false,
    target: ['es2020', 'safari15', 'chrome100', 'firefox100'],
    jsx: 'automatic',
    metafile: true,
    legalComments: 'none',
    define: {
      __APP_VERSION__: JSON.stringify(pkg.version),
      'process.env.NODE_ENV': JSON.stringify(serve ? 'development' : 'production'),
    },
    logLevel: 'warning',
  });
  cpSync(join(root, 'public'), out, { recursive: true });

  const outputs = Object.keys(result.metafile.outputs).map((p) => relative(out, resolve(root, p)).split('\\').join('/'));
  const js = outputs.filter((p) => p.endsWith('.js'));
  const css = outputs.filter((p) => p.endsWith('.css'));
  const html = readFileSync(join(root, 'src/index.html'), 'utf8')
    .replace('<!--CSS-->', css.map((c) => `<link rel="stylesheet" href="${c}" />`).join('\n    '))
    .replace('<!--JS-->', js.map((j) => `<script type="module" src="${j}"></script>`).join('\n    '));
  writeFileSync(join(out, 'index.html'), html);

  const shell = ['index.html', 'offline.html', 'manifest.webmanifest', ...walk(join(out, 'icons')).map((p) => relative(out, p).split('\\').join('/'))];
  const stat = outputs.filter((p) => p.startsWith('assets/') && !p.endsWith('.map'));
  const hash = createHash('sha256');
  for (const f of [...shell, ...stat]) hash.update(f).update(readFileSync(join(out, f)));
  const buildId = `${pkg.version}-${hash.digest('hex').slice(0, 10)}`;
  const sw = readFileSync(join(root, 'src/sw.js'), 'utf8')
    .replace('__BUILD_ID__', buildId)
    .replace('__PRECACHE__', JSON.stringify({ shell, static: stat }));
  writeFileSync(join(out, 'sw.js'), sw);
  writeFileSync(join(out, 'version.json'), JSON.stringify({ app_version: pkg.version, build: buildId }));
  // GitHub Pages: serve files as-is.
  writeFileSync(join(out, '.nojekyll'), '');
  const size = stat.reduce((n, f) => n + statSync(join(out, f)).size, 0);
  console.log(`built ${buildId}: ${stat.join(', ')} (${(size / 1024).toFixed(0)} KB)`);
  return buildId;
}

await build();

if (serve) {
  const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.png': 'image/png', '.svg': 'image/svg+xml' };
  const port = Number(process.env.PORT || 5173);
  createServer((req, res) => {
    const url = new URL(req.url, 'http://x');
    let p = join(out, decodeURIComponent(url.pathname));
    if (!p.startsWith(out)) return res.writeHead(403).end();
    if (existsSync(p) && statSync(p).isDirectory()) p = join(p, 'index.html');
    if (!existsSync(p)) return res.writeHead(404).end('not found');
    res.writeHead(200, { 'content-type': types[extname(p)] || 'application/octet-stream', 'cache-control': 'no-cache' });
    res.end(readFileSync(p));
  }).listen(port, () => console.log(`serving http://localhost:${port}/?nosw (service worker disabled with ?nosw)`));
  const { watch } = await import('node:fs');
  let timer;
  for (const d of ['src', 'public']) {
    watch(join(root, d), { recursive: true }, () => {
      clearTimeout(timer);
      timer = setTimeout(() => build().catch((e) => console.error(e.message)), 150);
    });
  }
}
