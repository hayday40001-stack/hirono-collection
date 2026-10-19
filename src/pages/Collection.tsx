import { useMemo, useState } from 'react';
import { useApp } from '../app/context.tsx';
import { money, seriesShort } from '../app/format.ts';
import { navigate, useRoute } from '../app/router.tsx';
import { STATUS_LABEL } from '../domain/labels.ts';
import { COLLECTION_STATUSES, isOwned, type CollectionStatus, type Item } from '../domain/types.ts';
import { matches, normalize } from '../services/search.ts';
import { ItemRow } from '../components/ItemTag.tsx';
import { Empty, useAction, useConfirm } from '../components/ui.tsx';
import { QuickAdd } from '../components/QuickAdd.tsx';
import { IconPlus } from '../components/icons.tsx';

type Tab = 'owned' | CollectionStatus | 'fav' | 'all';

export function Collection() {
  const { data, repos } = useApp();
  const { query } = useRoute();
  const run = useAction();
  const confirm = useConfirm();
  const tab: Tab = query.get('fav') === '1' ? 'fav' : ((query.get('tab') as Tab) ?? 'owned');
  const [q, setQ] = useState('');
  const [sort, setSort] = useState<'updated' | 'name' | 'series' | 'price'>('updated');
  const [quick, setQuick] = useState(false);

  const rows = useMemo(() => {
    const list = data.entryList
      .filter((e) => {
        if (tab === 'owned') return isOwned(e);
        if (tab === 'fav') return e.is_favorite;
        if (tab === 'all') return true;
        return e.status === tab;
      })
      .map((e) => ({ e, it: data.itemsById.get(e.item_id) }))
      .filter(({ it }) => {
        if (!q) return true;
        if (!it) return false;
        const s = it.series_id ? data.seriesById.get(it.series_id) : undefined;
        return matches(normalize([it.name_en, it.name_th ?? '', s?.name_en ?? ''].join(' ')), q);
      });
    return list.sort((a, b) => {
      if (sort === 'name') return (a.it?.name_en ?? '').localeCompare(b.it?.name_en ?? '');
      if (sort === 'series') return (a.it?.series_id ?? 'zz').localeCompare(b.it?.series_id ?? 'zz') || (a.it?.name_en ?? '').localeCompare(b.it?.name_en ?? '');
      if (sort === 'price') return (b.e.purchase_price ?? -1) - (a.e.purchase_price ?? -1);
      return b.e.updated_at.localeCompare(a.e.updated_at);
    });
  }, [data, tab, q, sort]);

  const counts = useMemo(() => {
    const c: Record<string, number> = { owned: 0, fav: 0, all: data.entryList.length };
    for (const s of COLLECTION_STATUSES) c[s] = 0;
    for (const e of data.entryList) {
      if (isOwned(e)) c.owned++;
      if (e.is_favorite) c.fav++;
      c[e.status]++;
    }
    return c;
  }, [data.entryList]);

  const tabs: [Tab, string][] = [
    ['owned', `มีในมือ ${counts.owned}`],
    ['WISHLIST', `ตามหา ${counts.WISHLIST}`],
    ['ORDERED', `สั่งแล้ว ${counts.ORDERED}`],
    ['TRADE_OR_SELL', `ขาย/แลก ${counts.TRADE_OR_SELL}`],
    ['fav', `โปรด ${counts.fav}`],
    ['all', `ทุกรายการ ${counts.all}`],
  ];
  const cur = data.settings.display_currency;

  return (
    <div className="page">
      <header className="page-head">
        <div className="row spread">
          <h1>คลังของฉัน</h1>
          <button type="button" className="btn primary" onClick={() => setQuick(true)}>
            <IconPlus /> เพิ่มหลายรายการ
          </button>
        </div>
        <p className="meta">ทุกอย่างในหน้านี้เก็บไว้ในเครื่องนี้เท่านั้น ไม่มีการส่งขึ้นเซิร์ฟเวอร์</p>
      </header>
      <div className="chips" role="group" aria-label="กรองตามสถานะ">
        {tabs.map(([k, l]) => (
          <button key={k} type="button" className="chip" aria-pressed={tab === k} onClick={() => navigate('/collection', k === 'fav' ? { fav: '1' } : { tab: k }, true)}>
            {l}
          </button>
        ))}
      </div>
      <div className="form-grid two">
        <label className="field">
          <span className="sr-only">ค้นหาในคลัง</span>
          <input className="input" type="search" placeholder="ค้นหาในคลังของคุณ" value={q} onChange={(e) => setQ(e.target.value)} />
        </label>
        <label className="field">
          <span className="sr-only">เรียงตาม</span>
          <select className="select" value={sort} onChange={(e) => setSort(e.target.value as typeof sort)}>
            <option value="updated">แก้ไขล่าสุด</option>
            <option value="name">ชื่อ A–Z</option>
            <option value="series">ซีรีส์</option>
            <option value="price">ราคาที่ซื้อ สูง→ต่ำ</option>
          </select>
        </label>
      </div>

      {rows.length === 0 ? (
        <Empty
          title={data.entryList.length ? 'ไม่มีรายการในหมวดนี้' : 'คลังของคุณยังว่าง'}
          action={
            <button type="button" className="btn" onClick={() => setQuick(true)}>
              เพิ่มของสะสม
            </button>
          }
        >
          เปิดหน้ารุ่นใดก็ได้แล้วเลือกสถานะ หรือใช้ “เพิ่มหลายรายการ” เพื่อติ๊กทีละหลายรุ่น
        </Empty>
      ) : (
        <div className="list">
          {rows.map(({ e, it }) =>
            it ? (
              <div key={e.item_id} style={{ display: 'grid', gridTemplateColumns: '1fr auto', alignItems: 'center', gap: 8, borderBottom: '1px solid var(--line)' }}>
                <ItemRow
                  item={it}
                  series={it.series_id ? data.seriesById.get(it.series_id) : undefined}
                  entry={e}
                  hunting={data.wishlist.has(it.id)}
                  trailing={
                    <span style={{ display: 'grid', justifyItems: 'end', gap: 2 }}>
                      <span className={`pill ${isOwned(e) ? 'owned' : ''}`}>
                        {STATUS_LABEL[e.status].th}
                        {e.quantity > 1 ? ` ×${e.quantity}` : ''}
                      </span>
                      {!data.settings.hide_values && e.purchase_price !== null && <span className="meta">{money(e.purchase_price, cur)}</span>}
                    </span>
                  }
                />
                <QuickStatus item={it} status={e.status} />
              </div>
            ) : (
              <div key={e.item_id} className="list-row">
                <span className="thumb">?</span>
                <span>
                  <span className="tag-name">{e.item_id}</span>
                  <span className="tag-sub">ยังไม่มีใน Catalog ของเครื่องนี้ (อาจมาจาก Backup ของเครื่องอื่น) อัปเดต Catalog แล้วจะแสดงชื่อ</span>
                </span>
                <button
                  type="button"
                  className="btn small danger"
                  onClick={async () => {
                    if (await confirm({ title: 'ลบรายการนี้?', body: e.item_id, confirm: 'ลบ', danger: true })) await run(() => repos.collection.remove(e.item_id));
                  }}
                >
                  ลบ
                </button>
              </div>
            ),
          )}
        </div>
      )}
      {tab === 'owned' && rows.length > 0 && <Summary items={rows.map((r) => r.it).filter((x): x is Item => !!x)} />}
      <QuickAdd open={quick} onClose={() => setQuick(false)} />
    </div>
  );
}

function QuickStatus({ item, status }: { item: Item; status: CollectionStatus }) {
  const { repos } = useApp();
  const run = useAction();
  return (
    <label>
      <span className="sr-only">เปลี่ยนสถานะ {item.name_en}</span>
      <select
        className="select"
        style={{ minHeight: 36, padding: '0 8px', fontSize: 14, width: 'auto' }}
        value={status}
        onChange={(e) => run(() => repos.collection.setStatus(item.id, e.target.value as CollectionStatus), 'อัปเดตสถานะแล้ว')}
      >
        {COLLECTION_STATUSES.map((s) => (
          <option key={s} value={s}>
            {STATUS_LABEL[s].th}
          </option>
        ))}
      </select>
    </label>
  );
}

function Summary({ items }: { items: Item[] }) {
  const { data } = useApp();
  const bySeries = new Map<string, number>();
  for (const it of items) {
    const k = it.series_id ? seriesShort(data.seriesById.get(it.series_id)) : 'ชิ้นเดี่ยว';
    bySeries.set(k, (bySeries.get(k) ?? 0) + 1);
  }
  return (
    <p className="meta">
      {[...bySeries.entries()]
        .sort((a, b) => b[1] - a[1])
        .map(([k, n]) => `${k} ${n}`)
        .join(', ')}
    </p>
  );
}
