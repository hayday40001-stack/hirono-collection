import { useMemo, useState } from 'react';
import { useApp } from '../app/context.tsx';
import { pct, thaiDate } from '../app/format.ts';
import { CATEGORY_LABEL, ROSTER_LABEL, VERIFICATION_LABEL } from '../domain/labels.ts';
import { isOwned, isSecretEdition } from '../domain/types.ts';
import { seriesProgress } from '../services/stats.ts';
import { sortItems } from '../services/search.ts';
import { ItemGrid } from '../components/ItemTag.tsx';
import { Bar, Empty } from '../components/ui.tsx';
import { IconGrid, IconList } from '../components/icons.tsx';
import { SourceList, BackLink } from './shared.tsx';

type Show = 'all' | 'owned' | 'missing' | 'wishlist';

export function SeriesDetail({ id }: { id: string }) {
  const { data } = useApp();
  const [show, setShow] = useState<Show>('all');
  const [view, setView] = useState<'grid' | 'list'>('grid');
  const series = data.seriesById.get(id);
  const prog = useMemo(() => (series ? seriesProgress([series], data.items, data.entries)[0] : null), [series, data]);
  if (!series || !prog) {
    return <Empty title="ไม่พบซีรีส์นี้" action={<BackLink />}>ซีรีส์อาจถูกถอดออกจาก Catalog หรือลิงก์ไม่ถูกต้อง</Empty>;
  }
  const items = sortItems(prog.items, data.seriesById, data.entries, 'release');
  const shown = items.filter((it) => {
    const e = data.entries.get(it.id);
    if (show === 'owned') return isOwned(e);
    if (show === 'missing') return !isOwned(e);
    if (show === 'wishlist') return data.wishlist.has(it.id) || e?.status === 'WISHLIST';
    return true;
  });
  const regular = items.filter((i) => !isSecretEdition(i.edition_type)).length;
  const secret = items.length - regular;

  return (
    <div className="page">
      <BackLink />
      <header className="page-head">
        <h1>{series.name_en}</h1>
        {series.name_th && <p className="lede">{series.name_th}</p>}
        {series.description && <p className="meta">{series.description}</p>}
      </header>

      <div className="panel" style={{ gap: 'var(--s4)' }}>
        <div className="row spread">
          <span className="num" style={{ fontSize: 'var(--t-2xl)' }}>
            {prog.owned}/{prog.total}
          </span>
          <span className="meta">
            {prog.complete ? 'สะสมครบแล้ว' : prog.total ? `${pct(prog.percent)} ของรุ่นที่บันทึกไว้` : 'ยังไม่มีรายชื่อรุ่น'}
          </span>
        </div>
        <Bar value={prog.percent} label={`ความคืบหน้า ${pct(prog.percent)}`} />
        {prog.caveat && <p className="meta">{prog.caveat} จึงยังนับว่าสะสมครบไม่ได้แม้จะมีทุกรุ่นที่แสดงอยู่</p>}
      </div>

      <dl className="facts">
        <dt>ปีที่วางจำหน่าย</dt>
        <dd>{series.release_date ? thaiDate(series.release_date) : series.release_year ?? 'ไม่ทราบ'}</dd>
        <dt>ประเภท</dt>
        <dd>
          {CATEGORY_LABEL[series.series_type].th}, {series.product_kind}
        </dd>
        <dt>รุ่นปกติ</dt>
        <dd>
          {regular} รุ่นในฐานข้อมูล{series.declared_count.regular !== null && series.declared_count.regular !== regular ? ` (แหล่งอ้างอิงระบุ ${series.declared_count.regular})` : ''}
        </dd>
        <dt>ซีเคร็ต</dt>
        <dd>{secret} รุ่น</dd>
        <dt>รายชื่อรุ่น</dt>
        <dd>{ROSTER_LABEL[series.roster_status]}</dd>
        <dt>สถานะข้อมูล</dt>
        <dd>{VERIFICATION_LABEL[series.verification_status].th}</dd>
      </dl>

      {series.conflicts.length > 0 && (
        <div className="notice">
          <strong>หมายเหตุเรื่องข้อมูล</strong>
          <ul>
            {series.conflicts.map((c) => (
              <li key={c}>{c}</li>
            ))}
          </ul>
        </div>
      )}

      <section className="section">
        <div className="row spread">
          <div className="chips" role="group" aria-label="แสดง">
            {(
              [
                ['all', `ทั้งหมด ${items.length}`],
                ['owned', `มีแล้ว ${prog.owned}`],
                ['missing', `ยังขาด ${prog.total - prog.owned}`],
                ['wishlist', 'ตามหา'],
              ] as [Show, string][]
            ).map(([k, l]) => (
              <button key={k} type="button" className="chip" aria-pressed={show === k} onClick={() => setShow(k)}>
                {l}
              </button>
            ))}
          </div>
          <button type="button" className="btn small icon" aria-label={view === 'grid' ? 'แสดงแบบรายการ' : 'แสดงแบบตาราง'} onClick={() => setView(view === 'grid' ? 'list' : 'grid')}>
            {view === 'grid' ? <IconList /> : <IconGrid />}
          </button>
        </div>
        {shown.length ? <ItemGrid items={shown} view={view} /> : <Empty title={show === 'owned' ? 'ยังไม่มีรุ่นในซีรีส์นี้' : show === 'missing' ? 'ครบทุกรุ่นที่บันทึกไว้แล้ว' : 'ไม่มีรายการ'} />}
      </section>

      <section className="section">
        <h2>แหล่งอ้างอิง</h2>
        <SourceList refs={series.sources} />
      </section>
    </div>
  );
}
