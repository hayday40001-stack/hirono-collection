import type { DataState } from '../app/context.tsx';
import { isOwned } from '../domain/types.ts';

export function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
}

/**
 * A single, static, read-only HTML page of the owned collection. Every value
 * is escaped and the page contains no script, so it can't change anything.
 */
export function buildShareHtml(data: DataState, opts: { prices: boolean; notes: boolean }): string {
  const owned = data.entryList.filter(isOwned);
  const groups = new Map<string, { title: string; rows: string[] }>();
  for (const e of owned) {
    const it = data.itemsById.get(e.item_id);
    if (!it) continue;
    const s = it.series_id ? data.seriesById.get(it.series_id) : undefined;
    const key = s?.id ?? 'standalone';
    const g = groups.get(key) ?? { title: s?.name_en ?? 'Standalone pieces', rows: [] };
    const extra = [
      e.quantity > 1 ? `×${e.quantity}` : '',
      opts.prices && e.purchase_price !== null ? `${e.purchase_price.toLocaleString()} ${data.settings.display_currency}` : '',
      opts.notes && e.personal_notes ? e.personal_notes : '',
    ].filter(Boolean);
    g.rows.push(`<li><strong>${escapeHtml(it.name_th ?? it.name_en)}</strong>${extra.length ? ` <span>${escapeHtml(extra.join(' · '))}</span>` : ''}</li>`);
    groups.set(key, g);
  }
  const name = data.settings.profile.display_name || 'HIRONO collector';
  const bio = data.settings.profile.bio;
  const body = [...groups.values()]
    .sort((a, b) => a.title.localeCompare(b.title))
    .map((g) => `<section><h2>${escapeHtml(g.title)}</h2><ul>${g.rows.join('')}</ul></section>`)
    .join('');
  return `<!doctype html>
<html lang="th"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; img-src data:">
<title>${escapeHtml(name)} — HIRONO collection</title>
<style>body{font-family:system-ui,sans-serif;background:#f1ede4;color:#2a2725;max-width:720px;margin:0 auto;padding:32px 16px;line-height:1.6}h1{font-family:Georgia,serif;font-size:2rem;margin:0}h2{font-family:Georgia,serif;font-size:1.2rem;margin:32px 0 8px;border-bottom:1px solid #d3cbbd;padding-bottom:4px}ul{list-style:none;padding:0;margin:0}li{padding:4px 0}li span{color:#857c71;font-size:.9em}p{color:#57514b}</style>
</head><body>
<h1>${escapeHtml(name)}</h1>
${bio ? `<p>${escapeHtml(bio)}</p>` : ''}
<p>${owned.length} styles owned · exported ${new Date().toLocaleDateString('th-TH')} · read-only copy</p>
${body || '<p>No pieces yet.</p>'}
</body></html>`;
}
