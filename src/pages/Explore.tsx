import { useMemo, useState } from 'react';
import { useApp } from '../app/context.tsx';
import { pct, seriesShort } from '../app/format.ts';
import { href, navigate, useRoute } from '../app/router.tsx';
import { CATEGORY_LABEL } from '../domain/labels.ts';
import { CATEGORIES, type Category } from '../domain/types.ts';
import { DEFAULT_FILTERS, filterItems, type ItemFilters, type OwnershipFilter, type SortKey } from '../services/search.ts';
import { seriesProgress } from '../services/stats.ts';
import { Paged } from '../components/ItemTag.tsx';
import { Bar, Empty, Sheet } from '../components/ui.tsx';
import { IconGrid, IconList, IconSearchHeart } from '../components/icons.tsx';

const OWNERSHIP: [OwnershipFilter, string][] = [
  ['all', 'ทั้งหมด'],
  ['owned', 'มีแล้ว'],
  ['missing', 'ยังไม่มี'],
  ['hunting', 'กำลังตามหา'],
  ['ordered', 'สั่งซื้อแล้ว'],
  ['trade', 'ขาย/แลก'],
];
const SORTS: [SortKey, string][] = [
  ['release', 'วันวางจำหน่าย (เก่า→ใหม่)'],
  ['year_desc', 'วันวางจำหน่าย (ใหม่→เก่า)'],
  ['name', 'ชื่อ A–Z'],
  ['added', 'เพิ่มล่าสุด'],
];

export function readFilters(q: URLSearchParams): ItemFilters {
  const num = (k: string) => (q.get(k) && !Number.isNaN(Number(q.get(k))) ? Number(q.get(k)) : null);
  const cat = q.get('cat') as Category | null;
  return {
    ...DEFAULT_FILTERS,
    query: q.get('q') ?? '',
    ownership: (OWNERSHIP.find(([k]) => k === q.get('own'))?.[0] ?? 'all') as OwnershipFilter,
    category: cat && CATEGORIES.includes(cat) ? cat : 'all',
    year: num('year') ?? 'all',
    edition: q.get('ed') === 'secret' ? 'secret' : 'all',
    favorites: q.get('fav') === '1',
    verifiedOnly: q.get('ver') === '1',
    priceMin: num('pmin'),
    priceMax: num('pmax'),
    sort: (SORTS.find(([k]) => k === q.get('sort'))?.[0] ?? 'release') as SortKey,
  };
}

export function Explore() {
  const { data, repos } = useApp();
  const { query } = useRoute();
  const f = readFilters(query);
  const view = (query.get('view') as 'grid' | 'list') ?? data.settings.explore_view;
  const [more, setMore] = useState(false);

  const set = (patch: Record<string, string | number | null>) => {
    const next: Record<string, string | null> = {};
    query.forEach((v, k) => (next[k] = v));
    for (const [k, v] of Object.entries(patch)) next[k] = v === null || v === '' || v === 'all' ? null : String(v);
    navigate('/explore', next, true);
  };

  const wishIds = useMemo(() => new Set(data.wishlist.keys()), [data.wishlist]);
  const results = useMemo(() => filterItems(data.items, data.seriesById, data.entries, wishIds, f), [data, wishIds, f.query, f.ownership, f.category, f.year, f.edition, f.favorites, f.verifiedOnly, f.priceMin, f.priceMax, f.sort]); // eslint-disable-line react-hooks/exhaustive-deps
  const years = useMemo(() => [...new Set(data.items.map((i) => i.release_year).filter((y): y is number => !!y))].sort((a, b) => b - a), [data.items]);
  const progress = useMemo(() => seriesProgress(data.series, data.items, data.entries), [data]);
  const seriesShown = progress
    .filter((p) => f.category === 'all' || p.series.series_type === f.category)
    .sort((a, b) => (a.series.release_date ?? `${a.series.release_year}`).localeCompare(b.series.release_date ?? `${b.series.release_year}`));
  const browsing = !f.query && f.ownership === 'all' && f.year === 'all' && f.edition === 'all' && !f.favorites && f.priceMin === null && f.priceMax === null;
  const extraCount = [f.year !== 'all', f.edition !== 'all', f.favorites, f.verifiedOnly, f.priceMin !== null || f.priceMax !== null].filter(Boolean).length;

  return (
    <div className="page">
      <header className="page-head">
        <h1>สำรวจ Catalog</h1>
        <p className="meta">
          {data.items.filter((i) => !i.archived).length} รายการจาก {data.series.filter((s) => !s.archived).length} ซีรีส์ ข้อมูลที่ยังไม่ยืนยันจะมีกรอบเส้นประ
        </p>
      </header>

      <div className="section" style={{ gap: 'var(--s3)' }}>
        <label className="search">
          <IconSearchHeart />
          <span className="sr-only">ค้นหา</span>
          <input
            className="input"
            type="search"
            placeholder="ค้นหาชื่อรุ่น ซีรีส์ คอลแลบ ปี หรือรหัสสินค้า"
            defaultValue={f.query}
            onChange={(e) => set({ q: e.target.value })}
            enterKeyHint="search"
          />
        </label>
        <div className="chips" role="group" aria-label="หมวดหมู่">
          <button type="button" className="chip" aria-pressed={f.category === 'all'} onClick={() => set({ cat: null })}>
            ทุกหมวด
          </button>
          {CATEGORIES.map((c) => (
            <button key={c} type="button" className="chip" aria-pressed={f.category === c} onClick={() => set({ cat: c })}>
              {CATEGORY_LABEL[c].short}
            </button>
          ))}
        </div>
        <div className="chips" role="group" aria-label="สถานะการสะสม">
          {OWNERSHIP.map(([k, label]) => (
            <button key={k} type="button" className="chip" aria-pressed={f.ownership === k} onClick={() => set({ own: k })}>
              {label}
            </button>
          ))}
        </div>
        <div className="row spread">
          <span className="meta" aria-live="polite">
            พบ {results.length} รายการ
          </span>
          <div className="row">
            <button type="button" className="btn small" onClick={() => setMore(true)}>
              ตัวกรองเพิ่มเติม{extraCount ? ` (${extraCount})` : ''}
            </button>
            <button
              type="button"
              className="btn small icon"
              aria-label={view === 'grid' ? 'แสดงแบบรายการ' : 'แสดงแบบตาราง'}
              onClick={() => {
                const v = view === 'grid' ? 'list' : 'grid';
                set({ view: v });
                void repos.settings.update({ explore_view: v });
              }}
            >
              {view === 'grid' ? <IconList /> : <IconGrid />}
            </button>
          </div>
        </div>
      </div>

      {browsing && seriesShown.length > 0 && (
        <section className="section" aria-labelledby="series-h">
          <h2 id="series-h">ซีรีส์</h2>
          <div className="series-list">
            {seriesShown.map((p) => (
              <a key={p.series.id} className="series-row" href={href(`/series/${p.series.id}`)}>
                <span>
                  <h3>{seriesShort(p.series)}</h3>
                  <span className="meta">
                    {p.series.release_year ?? 'ไม่ทราบปี'}, {CATEGORY_LABEL[p.series.series_type].short}
                    {p.series.roster_status !== 'COMPLETE' && ', รายชื่อยังไม่ครบ'}
                    {p.series.verification_status === 'UNVERIFIED' && ', ยังไม่ยืนยัน'}
                  </span>
                </span>
                <span className="tally">{p.total ? `${p.owned}/${p.total}` : '—'}</span>
                <Bar value={p.percent} label={`${seriesShort(p.series)} ${pct(p.percent)}`} />
              </a>
            ))}
          </div>
        </section>
      )}

      <section className="section" aria-labelledby="items-h">
        <h2 id="items-h">{browsing ? 'ทุกรุ่น' : 'ผลลัพธ์'}</h2>
        {results.length ? (
          <Paged items={results} view={view} />
        ) : (
          <Empty
            title={data.items.length ? 'ไม่พบรายการที่ตรงกับตัวกรอง' : 'Catalog ยังว่างอยู่'}
            action={
              <button type="button" className="btn" onClick={() => navigate('/explore', {}, true)}>
                ล้างตัวกรอง
              </button>
            }
          >
            ลองคำค้นที่สั้นลง หรือค้นเป็นภาษาอังกฤษ ถ้าเป็นรุ่นที่ไม่มีใน Catalog คุณเพิ่มเองได้ในหน้า “จัดการ Catalog”
          </Empty>
        )}
      </section>

      <Sheet open={more} onClose={() => setMore(false)} title="ตัวกรองเพิ่มเติม" labelledBy="filters-title">
        <div className="form-grid two">
          <label className="field">
            <span>ปีที่วางจำหน่าย</span>
            <select className="select" value={f.year} onChange={(e) => set({ year: e.target.value })}>
              <option value="all">ทุกปี</option>
              {years.map((y) => (
                <option key={y} value={y}>
                  {y}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>เรียงตาม</span>
            <select className="select" value={f.sort} onChange={(e) => set({ sort: e.target.value })}>
              {SORTS.map(([k, l]) => (
                <option key={k} value={k}>
                  {l}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>ราคาที่ซื้อ ตั้งแต่</span>
            <input className="input" type="number" inputMode="decimal" min={0} value={f.priceMin ?? ''} onChange={(e) => set({ pmin: e.target.value })} />
          </label>
          <label className="field">
            <span>ถึง</span>
            <input className="input" type="number" inputMode="decimal" min={0} value={f.priceMax ?? ''} onChange={(e) => set({ pmax: e.target.value })} />
          </label>
        </div>
        <label className="check">
          <input type="checkbox" checked={f.edition === 'secret'} onChange={(e) => set({ ed: e.target.checked ? 'secret' : null })} />
          เฉพาะซีเคร็ตและซูเปอร์ซีเคร็ต
        </label>
        <label className="check">
          <input type="checkbox" checked={f.favorites} onChange={(e) => set({ fav: e.target.checked ? '1' : null })} />
          เฉพาะรุ่นโปรด
        </label>
        <label className="check">
          <input type="checkbox" checked={f.verifiedOnly} onChange={(e) => set({ ver: e.target.checked ? '1' : null })} />
          เฉพาะข้อมูลที่ยืนยันแล้ว
        </label>
        <div className="row">
          <button type="button" className="btn primary" onClick={() => setMore(false)}>
            ดู {results.length} รายการ
          </button>
          <button type="button" className="btn quiet" onClick={() => set({ year: null, ed: null, fav: null, ver: null, pmin: null, pmax: null, sort: null })}>
            ล้างตัวกรองเหล่านี้
          </button>
        </div>
      </Sheet>
    </div>
  );
}
