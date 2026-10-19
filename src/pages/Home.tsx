import { useMemo, useState } from 'react';
import { useApp } from '../app/context.tsx';
import { money, pct, seriesShort, thaiDate } from '../app/format.ts';
import { href, Link } from '../app/router.tsx';
import { isOwned, isSecretEdition, isVerified } from '../domain/types.ts';
import { overview, seriesProgress } from '../services/stats.ts';
import { releaseKey } from '../services/search.ts';
import { ItemTag } from '../components/ItemTag.tsx';
import { Bar, Empty } from '../components/ui.tsx';
import { IconPlus } from '../components/icons.tsx';
import { QuickAdd } from '../components/QuickAdd.tsx';

export function Home() {
  const { data, volatile } = useApp();
  const [quick, setQuick] = useState(false);
  const ov = useMemo(
    () => overview(data.items, data.series, data.entryList, [...data.wishlist.values()], data.meta?.coverage.total_universe_known ?? false),
    [data],
  );
  const progress = useMemo(() => seriesProgress(data.series, data.items, data.entries), [data]);
  const verifiedSorted = useMemo(
    () =>
      data.items
        .filter((i) => !i.archived && isVerified(i.verification_status))
        .sort((a, b) => releaseKey(a, data.seriesById.get(a.series_id ?? '')).localeCompare(releaseKey(b, data.seriesById.get(b.series_id ?? '')))),
    [data],
  );

  const recentlyAdded = data.entryList
    .filter(isOwned)
    .sort((a, b) => (b.acquired_date ?? b.updated_at).localeCompare(a.acquired_date ?? a.updated_at))
    .slice(0, 10)
    .map((e) => data.itemsById.get(e.item_id))
    .filter((x) => !!x);
  const favorites = data.entryList
    .filter((e) => e.is_favorite)
    .map((e) => data.itemsById.get(e.item_id))
    .filter((x) => !!x);
  const viewed = data.settings.recently_viewed.map((id) => data.itemsById.get(id)).filter((x) => !!x).slice(0, 10);
  const hunting = [...data.wishlist.values()]
    .sort((a, b) => a.priority - b.priority)
    .map((w) => data.itemsById.get(w.item_id))
    .filter((x) => !!x)
    .slice(0, 10);
  const close = progress
    .filter((p) => p.owned > 0 && !p.complete && p.total > 0)
    .sort((a, b) => b.percent - a.percent)
    .slice(0, 4);

  const backupAge = data.settings.last_backup_at ? (Date.now() - new Date(data.settings.last_backup_at).getTime()) / 86400000 : null;
  const needsBackup = data.entryList.length > 0 && (backupAge === null || backupAge > 14);
  const hide = data.settings.hide_values;
  const name = data.settings.profile.display_name;

  const shelf = (items: typeof recentlyAdded) => (
    <div className="shelf">
      {items.map((it) => (
        <ItemTag key={it.id} item={it} series={data.seriesById.get(it.series_id ?? '')} entry={data.entries.get(it.id)} hunting={data.wishlist.has(it.id)} />
      ))}
    </div>
  );

  return (
    <div className="page">
      {volatile && (
        <div className="notice danger">
          เบราว์เซอร์นี้ไม่อนุญาตให้บันทึกข้อมูลในเครื่อง (อาจเป็นโหมดส่วนตัว) สิ่งที่บันทึกตอนนี้จะหายเมื่อปิดหน้า
        </div>
      )}
      <section className="hero" aria-labelledby="hero-title">
        <h1 id="hero-title">{name ? `คลังสะสมของ ${name}` : 'คลังสะสม HIRONO ของคุณ'}</h1>
        <p className="count">
          {ov.verifiedItems === 0 ? (
            'ยังไม่มีข้อมูล Catalog ในเครื่อง'
          ) : (
            <>
              คุณมี <b className="num">{ov.ownedVerifiedModels}</b> จาก <b className="num">{ov.verifiedItems}</b> รุ่นที่ยืนยันแล้วใน Catalog
              {ov.ownedModels > ov.ownedVerifiedModels && <> และอีก {ov.ownedModels - ov.ownedVerifiedModels} รุ่นที่ยังไม่ยืนยัน</>}
            </>
          )}
        </p>
        <div className="ledger" role="img" aria-label={`สะสมแล้ว ${pct(ov.percent)} ของรุ่นที่ยืนยันแล้ว`}>
          {verifiedSorted.map((it) => (
            <i key={it.id} className={`${isOwned(data.entries.get(it.id)) ? 'on' : ''} ${isSecretEdition(it.edition_type) ? 'secret' : ''}`} title={it.name_en} />
          ))}
        </div>
        <p className="meta">
          {pct(ov.percent)} ของรายการที่ยืนยันแล้ว. Catalog นี้ยังไม่ครอบคลุม HIRONO ทุกชิ้นในตลาด จึงไม่ใช่เปอร์เซ็นต์ของทั้งหมด.{' '}
          <Link to="/coverage">ดูความครอบคลุม</Link>
        </p>
        <div className="row">
          <button type="button" className="btn primary" onClick={() => setQuick(true)}>
            <IconPlus /> เพิ่มของสะสม
          </button>
          <a className="btn" href={href('/backup')}>
            สำรองข้อมูล
          </a>
        </div>
      </section>

      {needsBackup && (
        <div className="notice">
          <strong>{backupAge === null ? 'คุณยังไม่เคยสำรองข้อมูล' : `สำรองข้อมูลล่าสุดเมื่อ ${thaiDate(data.settings.last_backup_at)}`}</strong>
          <span>ข้อมูลทั้งหมดอยู่ในเครื่องนี้เท่านั้น ถ้าล้างข้อมูลเบราว์เซอร์หรือเปลี่ยนเครื่อง ข้อมูลจะหาย</span>
          <a className="btn small" href={href('/backup')} style={{ justifySelf: 'start' }}>
            สำรองตอนนี้
          </a>
        </div>
      )}

      <section className="figures" aria-label="สรุปการสะสม">
        <div>
          <span className="num">{ov.catalogItems}</span>
          <span className="meta">รายการใน Catalog ({ov.unverifiedItems} ยังไม่ยืนยัน)</span>
        </div>
        <div>
          <span className="num">{ov.ownedModels}</span>
          <span className="meta">รุ่นที่มีแล้ว, รวม {ov.ownedPieces} ชิ้น</span>
        </div>
        <div>
          <span className="num">{ov.missingVerified}</span>
          <span className="meta">รุ่นที่ยังขาด (เฉพาะที่ยืนยันแล้ว)</span>
        </div>
        <div>
          <span className="num">{ov.hunting}</span>
          <span className="meta">กำลังตามหา</span>
        </div>
        <div>
          <span className="num">{ov.seriesComplete}</span>
          <span className="meta">ซีรีส์ที่สะสมครบ</span>
        </div>
        <div>
          <span className="num">{ov.secretsOwned}</span>
          <span className="meta">ซีเคร็ตที่มี</span>
        </div>
        <div>
          <span className="num">{ov.limitedInCatalog === 0 ? '—' : ov.limitedOwned}</span>
          <span className="meta">{ov.limitedInCatalog === 0 ? 'Limited Edition: ยังไม่มีรายการที่ยืนยันใน Catalog' : 'Limited Edition ที่มี'}</span>
        </div>
        <div>
          <span className="num">{hide ? '•••' : ov.value.entriesWithValue ? money(ov.value.total, data.settings.display_currency) : '—'}</span>
          <span className="meta">{ov.value.entriesWithValue ? `มูลค่าที่คุณประเมิน (${ov.value.entriesWithValue} รายการ)` : 'มูลค่า: ยังไม่ได้กรอกราคาประเมิน'}</span>
        </div>
      </section>

      {close.length > 0 && (
        <section className="section">
          <div className="section-head">
            <h2>ใกล้ครบ</h2>
            <Link to="/explore">ดูทุกซีรีส์</Link>
          </div>
          <div className="series-list">
            {close.map((p) => (
              <a key={p.series.id} className="series-row" href={href(`/series/${p.series.id}`)}>
                <span>
                  <h3>{seriesShort(p.series)}</h3>
                  <span className="meta">
                    ขาดอีก {p.total - p.owned} รุ่น{p.caveat ? `, ${p.caveat}` : ''}
                  </span>
                </span>
                <span className="tally">
                  {p.owned}/{p.total}
                </span>
                <Bar value={p.percent} label={`${seriesShort(p.series)} ${pct(p.percent)}`} />
              </a>
            ))}
          </div>
        </section>
      )}

      <section className="section">
        <div className="section-head">
          <h2>ได้มาล่าสุด</h2>
          <Link to="/collection">ทั้งหมด</Link>
        </div>
        {recentlyAdded.length ? (
          shelf(recentlyAdded)
        ) : (
          <Empty title="ยังไม่มีของในคลัง" action={<button className="btn" onClick={() => setQuick(true)}>เพิ่มชิ้นแรก</button>}>
            เลือกรุ่นที่คุณมีจาก Catalog ได้ทีละหลายรายการ
          </Empty>
        )}
      </section>

      {hunting.length > 0 && (
        <section className="section">
          <div className="section-head">
            <h2>ยังตามหา</h2>
            <Link to="/wishlist">Wishlist</Link>
          </div>
          {shelf(hunting)}
        </section>
      )}
      {favorites.length > 0 && (
        <section className="section">
          <div className="section-head">
            <h2>รุ่นโปรด</h2>
            <Link to="/collection?fav=1">ทั้งหมด</Link>
          </div>
          {shelf(favorites)}
        </section>
      )}
      {viewed.length > 0 && (
        <section className="section">
          <div className="section-head">
            <h2>ดูล่าสุด</h2>
          </div>
          {shelf(viewed)}
        </section>
      )}
      <QuickAdd open={quick} onClose={() => setQuick(false)} />
    </div>
  );
}
