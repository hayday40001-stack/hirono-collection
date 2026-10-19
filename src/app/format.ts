import type { Item, Series } from '../domain/types.ts';

export function money(n: number | null | undefined, currency = 'THB'): string {
  if (n === null || n === undefined) return '—';
  try {
    return new Intl.NumberFormat('th-TH', { style: 'currency', currency, maximumFractionDigits: 0 }).format(n);
  } catch {
    return `${n.toLocaleString('th-TH')} ${currency}`;
  }
}

export function thaiDate(iso: string | null | undefined, withTime = false): string {
  if (!iso) return '—';
  const d = new Date(iso.length === 10 ? `${iso}T00:00:00` : iso);
  if (Number.isNaN(d.getTime())) return iso;
  return withTime
    ? d.toLocaleString('th-TH', { dateStyle: 'medium', timeStyle: 'short' })
    : d.toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: 'numeric' });
}

export function pct(v: number | null): string {
  if (v === null) return '—';
  const p = v * 100;
  return `${p < 10 && p > 0 ? p.toFixed(1) : Math.round(p)}%`;
}

export function bytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

/** Typographic monogram used on tags when there is no photo: initials of the first words. */
export function monogram(name: string): string {
  const words = name
    .replace(/^(hirono|the)\s+/i, '')
    .replace(/[×x]\s+/gi, '')
    .split(/[\s-]+/)
    .filter((w) => /[\p{L}\p{N}]/u.test(w) && !/^(of|and|the|in|a)$/i.test(w));
  const letters = words.slice(0, 3).map((w) => [...w][0]);
  return (letters.join('') || '·').toUpperCase();
}

export function seriesShort(s: Series | undefined): string {
  if (!s) return '';
  return s.name_en.replace(/^HIRONO\s+/i, '').replace(/\s+Series.*$/i, '').replace(/^×\s*/, '× ');
}

export function itemSubtitle(it: Item, s: Series | undefined): string {
  const parts = [s ? seriesShort(s) : it.subcategory ?? '', it.release_year ? String(it.release_year) : ''].filter(Boolean);
  return parts.join(', ');
}

export function downloadText(filename: string, text: string, mime = 'application/json') {
  const blob = new Blob([text], { type: `${mime};charset=utf-8` });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

export function readFileText(file: File): Promise<string> {
  return file.text();
}

export function stamp(): string {
  return new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-');
}

/** Downscales a photo to at most `max` px on the long side and re-encodes as JPEG. */
export async function compressImage(file: File, max = 1600, quality = 0.85): Promise<{ blob: Blob; width: number; height: number }> {
  if (!/^image\/(jpeg|png|webp|heic|heif|gif)$/i.test(file.type) && file.type !== '') throw new Error('รองรับเฉพาะไฟล์รูปภาพ');
  const bmp = await createImageBitmap(file).catch(() => null);
  if (!bmp) throw new Error('เปิดไฟล์รูปนี้ไม่ได้ ลองถ่ายใหม่หรือแปลงเป็น JPEG');
  const scale = Math.min(1, max / Math.max(bmp.width, bmp.height));
  const w = Math.round(bmp.width * scale);
  const h = Math.round(bmp.height * scale);
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  canvas.getContext('2d')!.drawImage(bmp, 0, 0, w, h);
  bmp.close?.();
  const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, 'image/jpeg', quality));
  if (!blob) throw new Error('บีบอัดรูปไม่สำเร็จ');
  return { blob, width: w, height: h };
}
