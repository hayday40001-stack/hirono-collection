import { useMemo } from 'react';
import { useApp } from '../app/context.tsx';
import { money, pct, seriesShort, thaiDate } from '../app/format.ts';
import { href, Link } from '../app/router.tsx';
import { CATEGORY_LABEL, ROSTER_LABEL, VERIFICATION_LABEL } from '../domain/labels.ts';
import { CATEGORIES, isOwned } from '../domain/types.ts';
import { acquisitionTimeline, coverage, overview, seriesProgress } from '../services/stats.ts';
import { Bar, Empty, useAsync } from '../components/ui.tsx';

function TimelineChart({ points }: { points: { month: string; added: number; cumulative: number }[] }) {
  const W = 640;
  const H = 220;
  const P = { l: 36, r: 12, t: 12, b: 28 };
  const max = Math.max(1, ...points.map((p) => p.cumulative));
  const maxAdded = Math.max(1, ...points.map((p) => p.added));
  const x = (i: number) => P.l + (points.length === 1 ? (W - P.l - P.r) / 2 : (i * (W - P.l - P.r)) / (points.length - 1));
  const y = (v: number) => H - P.b - (v / max) * (H - P.t - P.b);
  const line = points.map((p, i) => `${i ? 'L' : 'M'}${x(i)},${y(p.cumulative)}`).join(' ');
  const area = `${line} L${x(points.length - 1)},${H - P.b} L${x(0)},${H - P.b} Z`;
  const ticks = [0, Math.round(max / 2), max];
  const labelEvery = Math.ceil(points.length / 6);
  const bw = Math.max(4, Math.min(24, (W - P.l - P.r) / points.length / 2));
  return (
    <figure className="chart" style={{ margin: 0 }}>
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`จำนวนรุ่นที่สะสมรวมตามเวลา ล่าสุด ${points.at(-1)?.cumulative ?? 0} รุ่น`}>
        {ticks.map((t) => (
          <g key={t}>
            <line className="grid" x1={P.l} x2={W - P.r} y1={y(t)} y2={y(t)} />
            <text x={P.l - 8} y={y(t) + 4} textAnchor="end">
              {t}
            </text>
          </g>
        ))}
        {points.map((p, i) => (
          <rect key={p.month} className="bar-rect" x={x(i) - bw / 2} width={bw} y={H - P.b - (p.added / maxAdded) * 40} height={(p.added / maxAdded) * 40} opacity={0.35}>
            <title>
              {p.month}: +{p.added}
            </title>
          </rect>
        ))}
        <path className="area" d={area} />
        <path className="line" d={line} />
        {points.map((p, i) => (
          <circle key={p.month} cx={x(i)} cy={y(p.cumulative)} r={3} fill="var(--olive)">
            <title>
              {p.month}: รวม {p.cumulative} รุ่น (+{p.added})
            </title>
          </circle>
        ))}
        {points.map((p, i) =>
          i % labelEvery === 0 || i === points.length - 1 ? (
            <text key={p.month} x={x(i)} y={H - 8} textAnchor="middle">
              {p.month}
            </text>
          ) : null,
        )}
      </svg>
      <figcaption className="meta">เส้น: จำนวนรุ่นสะสมรวม, แท่งจาง: รุ่นที่ได้มาในเดือนนั้น (ใช้วันที่ได้รับ ถ้าไม่ได้กรอกจะใช้วันที่บันทึก)</figcaption>
    </figure>
  );
}

export function Stats() {
  const { data, repos } = useApp();
  const history = useAsync(() => repos.collection.allHistory(), [data.entryList]);
  const ov = useMemo(() => overview(data.items, data.series, data.entryList, [...data.wishlist.values()], data.meta?.coverage.total_universe_known ?? false), [data]);
  const progress = useMemo(() => seriesProgress(data.series, data.items, data.entries).filter((p) => p.total > 0), [data]);
  const timeline = useMemo(() => acquisitionTimeline(data.entryList, history.value ?? []), [data.entryList, history.value]);
  const cur = data.settings.display_currency;
  const hide = data.settings.hide_values;
  const top = data.entryList
    .filter((e) => isOwned(e) && e.estimated_value !== null)
    .sort((a, b) => (b.estimated_value ?? 0) * b.quantity - (a.estimated_value ?? 0) * a.quantity)
    .slice(0, 5);
  const recent = data.entryList
    .filter((e) => isOwned(e))
    .sort((a, b) => (b.acquired_date ?? b.updated_at).localeCompare(a.acquired_date ?? a.updated_at))
    .slice(0, 5);
  const byCat = CATEGORIES.map((c) => {
    const items = data.items.filter((i) => !i.archived && i.category === c);
    return { c, total: items.length, owned: items.filter((i) => isOwned(data.entries.get(i.id))).length };
  }).filter((x) => x.total > 0);

  return (
    <div className="page">
      <header className="page-head">
        <h1>สถิติการสะสม</h1>
        <p className="meta">คำนวณจากข้อมูลในเครื่องนี้ จำนวน “รุ่น” นับแบบไม่ซ้ำ ส่วน “ชิ้น” นับตามจำนวนที่มีจริง</p>
      </header>

      <section className="figures">
        <div>
          <span className="num">{pct(ov.percent)}</span>
          <span className="meta">ของ {ov.verifiedItems} รุ่นที่ยืนยันแล้วใน Catalog (ไม่ใช่ของทั้งหมดในตลาด)</span>
        </div>
        <div>
          <span className="num">{ov.ownedModels}</span>
          <span className="meta">รุ่นที่มี ({ov.ownedPieces} ชิ้น)</span>
        </div>
        <div>
          <span className="num">{ov.missingVerified}</span>
          <span className="meta">รุ่นที่ยังขาด</span>
        </div>
        <div>
          <span className="num">{ov.secretsOwned}</span>
          <span className="meta">ซีเคร็ตที่มี</span>
        </div>
        <div>
          <span className="num">{ov.collabsOwned}</span>
          <span className="meta">รุ่นคอลแลบที่มี</span>
        </div>
        <div>
          <span className="num">{ov.seriesComplete}</span>
          <span className="meta">ซีรีส์ที่ครบ</span>
        </div>
        <div>
          <span className="num">{hide ? '•••' : ov.spent.entriesWithPrice ? money(ov.spent.total, cur) : '—'}</span>
          <span className="meta">เงินที่ใช้ไป {ov.spent.entriesWithPrice ? `(จาก ${ov.spent.entriesWithPrice} รายการที่กรอกราคา)` : '(ยังไม่ได้กรอกราคา)'}</span>
        </div>
        <div>
          <span className="num">{hide ? '•••' : ov.value.entriesWithValue ? money(ov.value.total, cur) : '—'}</span>
          <span className="meta">มูลค่าที่คุณประเมินเอง {ov.value.entriesWithValue ? `(${ov.value.entriesWithValue} รายการ)` : ''}</span>
        </div>
      </section>

      <section className="section">
        <h2>การสะสมตามเวลา</h2>
        {timeline.length ? <TimelineChart points={timeline} /> : <Empty title="ยังไม่มีข้อมูลพอสำหรับกราฟ">บันทึกของที่มีแล้วอย่างน้อยหนึ่งรุ่น</Empty>}
      </section>

      <section className="section">
        <h2>แยกตามซีรีส์</h2>
        <div className="series-list">
          {progress.map((p) => (
            <a key={p.series.id} className="series-row" href={href(`/series/${p.series.id}`)}>
              <span>
                <h3 style={{ fontSize: 'var(--t-md)' }}>{seriesShort(p.series)}</h3>
                <span className="meta">
                  ขาด {p.total - p.owned}
                  {p.complete ? ', ครบแล้ว' : p.caveat ? `, ${p.caveat}` : ''}
                </span>
              </span>
              <span className="tally" style={{ fontSize: 'var(--t-md)' }}>
                {p.owned}/{p.total}
              </span>
              <Bar value={p.percent} label={pct(p.percent)} />
            </a>
          ))}
        </div>
      </section>

      <section className="section">
        <h2>แยกตามหมวด</h2>
        <table className="table">
          <thead>
            <tr>
              <th>หมวด</th>
              <th className="n">มี</th>
              <th className="n">ใน Catalog</th>
            </tr>
          </thead>
          <tbody>
            {byCat.map((r) => (
              <tr key={r.c}>
                <td>{CATEGORY_LABEL[r.c].th}</td>
                <td className="n">{r.owned}</td>
                <td className="n">{r.total}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <div className="form-grid two">
        <section className="section">
          <h2>มูลค่าสูงสุด (ตามที่คุณประเมิน)</h2>
          {hide ? (
            <p className="meta">ซ่อนมูลค่าอยู่ เปิดได้ที่หน้าโปรไฟล์</p>
          ) : top.length ? (
            <ol className="timeline">
              {top.map((e) => (
                <li key={e.item_id}>
                  <span className="num">{money((e.estimated_value ?? 0) * e.quantity, cur)}</span>
                  <a href={href(`/item/${e.item_id}`)}>{data.itemsById.get(e.item_id)?.name_en ?? e.item_id}</a>
                </li>
              ))}
            </ol>
          ) : (
            <p className="meta">ยังไม่มีรายการที่กรอกมูลค่าประเมิน</p>
          )}
        </section>
        <section className="section">
          <h2>ได้มาล่าสุด</h2>
          {recent.length ? (
            <ol className="timeline">
              {recent.map((e) => (
                <li key={e.item_id}>
                  <span className="meta">{thaiDate(e.acquired_date ?? e.updated_at)}</span>
                  <a href={href(`/item/${e.item_id}`)}>{data.itemsById.get(e.item_id)?.name_en ?? e.item_id}</a>
                </li>
              ))}
            </ol>
          ) : (
            <p className="meta">ยังไม่มี</p>
          )}
        </section>
      </div>
      <Link to="/coverage" className="btn" style={{ justifySelf: 'start' }}>
        ดูรายงานความครอบคลุมของ Catalog
      </Link>
    </div>
  );
}

export function Coverage() {
  const { data } = useApp();
  const c = useMemo(() => coverage(data.series, data.items), [data]);
  const meta = data.meta;
  return (
    <div className="page">
      <header className="page-head">
        <h1>ความครอบคลุมของ Catalog</h1>
        <p className="lede">
          จำนวนสินค้า HIRONO ทั้งหมดในตลาด: <strong>{meta?.coverage.total_universe_known ? 'ทราบแล้ว' : 'ยังไม่ทราบ'}</strong>
        </p>
        {meta?.coverage.notes && <p className="meta">{meta.coverage.notes}</p>}
      </header>
      <section className="figures">
        <div>
          <span className="num">{c.series}</span>
          <span className="meta">ซีรีส์ที่มีข้อมูล</span>
        </div>
        <div>
          <span className="num">{c.items}</span>
          <span className="meta">รายการสินค้า</span>
        </div>
        <div>
          <span className="num">{c.verifiedOfficial}</span>
          <span className="meta">{VERIFICATION_LABEL.VERIFIED_OFFICIAL.th}</span>
        </div>
        <div>
          <span className="num">{c.crossReferenced}</span>
          <span className="meta">{VERIFICATION_LABEL.VERIFIED_CROSS_REFERENCED.th}</span>
        </div>
        <div>
          <span className="num">{c.unverified}</span>
          <span className="meta">{VERIFICATION_LABEL.UNVERIFIED.th}</span>
        </div>
        <div>
          <span className="num">{c.needsReview}</span>
          <span className="meta">{VERIFICATION_LABEL.NEEDS_REVIEW.th}</span>
        </div>
        <div>
          <span className="num">{c.localItems}</span>
          <span className="meta">รายการที่คุณเพิ่มเองในเครื่องนี้</span>
        </div>
        <div>
          <span className="num">{c.flagged}</span>
          <span className="meta">รายการที่คุณแจ้งว่าผิด/ยกเลิก</span>
        </div>
      </section>
      <dl className="facts">
        <dt>เวอร์ชัน Catalog</dt>
        <dd>{meta?.catalog_version ?? 'ยังไม่ได้ติดตั้ง'}</dd>
        <dt>ตรวจสอบข้อมูลล่าสุด</dt>
        <dd>{thaiDate(meta?.last_verified_at)}</dd>
        <dt>ติดตั้งในเครื่องนี้เมื่อ</dt>
        <dd>{thaiDate(meta?.installed_at, true)}</dd>
        <dt>รายการที่ถูกถอดออก (เก็บไว้)</dt>
        <dd>{c.archived}</dd>
      </dl>
      <section className="section">
        <h2>ซีรีส์ที่รายชื่อรุ่นยังไม่ครบ</h2>
        {c.seriesWithIncompleteRoster.length ? (
          <ul className="sources">
            {c.seriesWithIncompleteRoster.map((s) => (
              <li key={s.id}>
                <a href={href(`/series/${s.id}`)}>{s.name_en}</a>
                <span className="meta">
                  {ROSTER_LABEL[s.roster_status]}, {VERIFICATION_LABEL[s.verification_status].th}
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="meta">ทุกซีรีส์ใน Catalog มีรายชื่อรุ่นครบตามแหล่งอ้างอิง</p>
        )}
      </section>
      <section className="section">
        <h2>แยกตามหมวด</h2>
        <table className="table">
          <thead>
            <tr>
              <th>หมวด</th>
              <th className="n">รายการ</th>
              <th className="n">ยังไม่ยืนยัน</th>
            </tr>
          </thead>
          <tbody>
            {CATEGORIES.map((cat) => {
              const r = c.categories.find((x) => x.category === cat);
              return (
                <tr key={cat}>
                  <td>{CATEGORY_LABEL[cat].th}</td>
                  <td className="n">{r?.items ?? 0}</td>
                  <td className="n">{r?.unverified ?? 0}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
        <p className="meta">หมวดที่มี 0 รายการคือหมวดที่ยังไม่ได้เก็บข้อมูล ไม่ได้แปลว่าไม่มีสินค้า เช่น Limited Edition, Event Exclusive และสินค้าอุปกรณ์เสริมจำนวนมากยังไม่ได้บันทึก</p>
      </section>
    </div>
  );
}
