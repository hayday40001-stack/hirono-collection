import { CATEGORY_LABEL, CONDITION_LABEL, EDITION_LABEL, STATUS_LABEL } from '../domain/labels.ts';
import { CATEGORIES, EDITION_TYPES, type Category, type CollectionEntry, type EditionType, type Item, type Series } from '../domain/types.ts';

/** RFC 4180 quoting. Cells that start with = + - @ are prefixed so spreadsheets don't run them as formulas. */
export function csvCell(v: unknown): string {
  let s = v === null || v === undefined ? '' : String(v);
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function toCsv(rows: unknown[][]): string {
  return '﻿' + rows.map((r) => r.map(csvCell).join(',')).join('\r\n');
}

export function collectionReportCsv(items: Item[], series: Map<string, Series>, entries: CollectionEntry[]): string {
  const byId = new Map(items.map((i) => [i.id, i]));
  const header = ['item_id', 'name', 'series', 'category', 'edition', 'year', 'status', 'quantity', 'purchase_price_each', 'estimated_value_each', 'acquired_date', 'condition', 'box', 'card', 'store', 'favorite', 'notes'];
  const rows = entries.map((e) => {
    const it = byId.get(e.item_id);
    return [
      e.item_id,
      it?.name_en ?? '(not in catalog)',
      it?.series_id ? series.get(it.series_id)?.name_en ?? '' : '',
      it ? CATEGORY_LABEL[it.category].en : '',
      it ? EDITION_LABEL[it.edition_type].en : '',
      it?.release_year ?? '',
      STATUS_LABEL[e.status].en,
      e.quantity,
      e.purchase_price ?? '',
      e.estimated_value ?? '',
      e.acquired_date ?? '',
      e.condition ? CONDITION_LABEL[e.condition] : '',
      e.box_status,
      e.card_status,
      e.store ?? '',
      e.is_favorite ? 'yes' : '',
      e.personal_notes ?? '',
    ];
  });
  return toCsv([header, ...rows]);
}

/** Minimal CSV parser (quotes, escaped quotes, CRLF). */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let q = false;
  const src = text.replace(/^﻿/, '');
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (q) {
      if (c === '"' && src[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (c === '"') q = false;
      else cell += c;
    } else if (c === '"') q = true;
    else if (c === ',') {
      row.push(cell);
      cell = '';
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && src[i + 1] === '\n') i++;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = '';
    } else cell += c;
  }
  if (cell || row.length) {
    row.push(cell);
    rows.push(row);
  }
  return rows.filter((r) => r.some((c) => c.trim() !== ''));
}

export interface CsvItemRow {
  name_en: string;
  name_th: string | null;
  series_id: string | null;
  category: Category;
  subcategory: string | null;
  release_year: number | null;
  edition_type: EditionType;
  product_code: string | null;
  source_url: string | null;
  notes: string | null;
}

export const ITEM_CSV_COLUMNS = ['name_en', 'name_th', 'series_id', 'category', 'subcategory', 'release_year', 'edition_type', 'product_code', 'source_url', 'notes'];

/** Parses an item import CSV (header row required). Returns rows and per-line errors. */
export function parseItemCsv(text: string): { rows: CsvItemRow[]; errors: string[] } {
  const table = parseCsv(text);
  const errors: string[] = [];
  if (!table.length) return { rows: [], errors: ['ไฟล์ว่าง'] };
  const header = table[0].map((h) => h.trim().toLowerCase());
  if (!header.includes('name_en')) return { rows: [], errors: ['ต้องมีคอลัมน์ name_en ในแถวแรก'] };
  const col = (r: string[], name: string) => {
    const i = header.indexOf(name);
    const v = i >= 0 ? (r[i] ?? '').trim() : '';
    return v === '' ? null : v;
  };
  const rows: CsvItemRow[] = [];
  table.slice(1).forEach((r, idx) => {
    const line = idx + 2;
    const name = col(r, 'name_en');
    if (!name) return errors.push(`แถว ${line}: ไม่มีชื่อ (name_en)`);
    const cat = (col(r, 'category') ?? 'OTHER').toUpperCase() as Category;
    if (!CATEGORIES.includes(cat)) return errors.push(`แถว ${line}: category “${cat}” ไม่ถูกต้อง`);
    const ed = (col(r, 'edition_type') ?? 'REGULAR').toUpperCase() as EditionType;
    if (!EDITION_TYPES.includes(ed)) return errors.push(`แถว ${line}: edition_type “${ed}” ไม่ถูกต้อง`);
    const y = col(r, 'release_year');
    const year = y ? Number(y) : null;
    if (y && (!Number.isInteger(year) || year! < 2000 || year! > 2100)) return errors.push(`แถว ${line}: ปี “${y}” ไม่ถูกต้อง`);
    rows.push({
      name_en: name.slice(0, 200),
      name_th: col(r, 'name_th'),
      series_id: col(r, 'series_id'),
      category: cat,
      subcategory: col(r, 'subcategory'),
      release_year: year,
      edition_type: ed,
      product_code: col(r, 'product_code'),
      source_url: col(r, 'source_url'),
      notes: col(r, 'notes'),
    });
  });
  return { rows, errors };
}
