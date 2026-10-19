import { readFileSync } from 'node:fs';
import { validateCatalogFile } from '../src/domain/validators.ts';
const file = process.argv[2] ?? 'public/catalog/catalog.json';
const r = validateCatalogFile(JSON.parse(readFileSync(file, 'utf8')));
if (!r.ok) {
  console.error(r.errors.join('\n'));
  process.exit(1);
}
console.log(`OK: ${r.value.catalog.series.length} series, ${r.value.catalog.items.length} items, version ${r.value.catalog.catalog_version}`);
for (const w of r.value.warnings) console.warn('warning:', w);
