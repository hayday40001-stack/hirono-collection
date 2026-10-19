import { useMemo, useState } from 'react';
import { useApp } from '../app/context.tsx';
import { money } from '../app/format.ts';
import { href } from '../app/router.tsx';
import { PRIORITY_LABEL } from '../domain/labels.ts';
import { safeHttpUrl } from '../domain/schema.ts';
import { ItemFace } from '../components/ItemTag.tsx';
import { Empty, useAction } from '../components/ui.tsx';
import { itemSubtitle } from '../app/format.ts';

type Sort = 'priority' | 'target' | 'seen' | 'added';

export function Wishlist() {
  const { data, repos } = useApp();
  const run = useAction();
  const [sort, setSort] = useState<Sort>('priority');
  const rows = useMemo(() => {
    const list = [...data.wishlist.values()].map((w) => ({ w, it: data.itemsById.get(w.item_id) }));
    const price = (n: number | null) => (n === null ? Number.POSITIVE_INFINITY : n);
    return list.sort((a, b) => {
      if (sort === 'target') return price(a.w.target_price) - price(b.w.target_price);
      if (sort === 'seen') return price(a.w.last_seen_price) - price(b.w.last_seen_price);
      if (sort === 'added') return b.w.created_at.localeCompare(a.w.created_at);
      return a.w.priority - b.w.priority || price(a.w.target_price) - price(b.w.target_price);
    });
  }, [data, sort]);
  const budget = rows.reduce((n, r) => n + (r.w.target_price ?? 0), 0);
  const priced = rows.filter((r) => r.w.target_price !== null).length;
  const cur = data.settings.display_currency;

  return (
    <div className="page">
      <header className="page-head">
        <h1>Wishlist</h1>
        <p className="lede">
          ยังตามหา <span className="num">{rows.length}</span> รายการ
          {priced > 0 && (
            <>
              , งบที่ตั้งไว้รวม <span className="num">{money(budget, cur)}</span>
              {priced < rows.length && <span className="meta"> (จาก {priced} รายการที่ตั้งราคา)</span>}
            </>
          )}
        </p>
        <p className="meta">ราคาทั้งหมดในหน้านี้เป็นตัวเลขที่คุณกรอกเอง แอปไม่ได้ดึงราคาตลาด</p>
      </header>
      {rows.length > 0 && (
        <label className="field" style={{ maxWidth: 320 }}>
          <span>เรียงตาม</span>
          <select className="select" value={sort} onChange={(e) => setSort(e.target.value as Sort)}>
            <option value="priority">ความสำคัญ</option>
            <option value="target">ราคาสูงสุดที่ยอมจ่าย ต่ำ→สูง</option>
            <option value="seen">ราคาที่พบล่าสุด ต่ำ→สูง</option>
            <option value="added">เพิ่มล่าสุด</option>
          </select>
        </label>
      )}
      {rows.length === 0 ? (
        <Empty title="ยังไม่มีรายการที่ตามหา" action={<a className="btn" href={href('/explore', { own: 'missing' })}>ดูรุ่นที่ยังขาด</a>}>
          เปิดหน้ารุ่นที่อยากได้ แล้วกด “เพิ่มใน Wishlist” เพื่อตั้งราคาเป้าหมายและลิงก์ร้าน
        </Empty>
      ) : (
        <div className="list">
          {rows.map(({ w, it }) => {
            const url = safeHttpUrl(w.store_url);
            const deal = w.target_price !== null && w.last_seen_price !== null && w.last_seen_price <= w.target_price;
            return (
              <div key={w.item_id} className="list-row" style={{ gridTemplateColumns: '56px 1fr', alignItems: 'start' }}>
                <a className="thumb" href={href(`/item/${encodeURIComponent(w.item_id)}`)} aria-hidden tabIndex={-1}>
                  {it ? <ItemFace item={it} size="thumb" /> : '?'}
                </a>
                <div style={{ display: 'grid', gap: 6, minWidth: 0 }}>
                  <a href={href(`/item/${encodeURIComponent(w.item_id)}`)} className="tag-name" style={{ textDecoration: 'none' }}>
                    {it ? it.name_th ?? it.name_en : w.item_id}
                  </a>
                  {it && <span className="tag-sub">{itemSubtitle(it, data.seriesById.get(it.series_id ?? ''))}</span>}
                  <div className="row small">
                    <span className={`pill ${w.priority === 1 ? 'secret' : ''}`}>{PRIORITY_LABEL[w.priority]}</span>
                    <span>เป้าหมาย {money(w.target_price, cur)}</span>
                    <span className="meta">พบล่าสุด {money(w.last_seen_price, cur)}</span>
                    {deal && <span className="pill owned">ราคาที่พบไม่เกินเป้าหมาย</span>}
                  </div>
                  {w.notes && <p className="meta">{w.notes}</p>}
                  <div className="row">
                    <button type="button" className="btn small" onClick={() => run(() => repos.collection.acquire(w.item_id), 'ย้ายเข้าคลังแล้ว: มีแล้ว')} disabled={!it}>
                      ได้มาแล้ว
                    </button>
                    {url && (
                      <a className="btn small quiet" href={url} target="_blank" rel="noopener noreferrer nofollow">
                        เปิดร้านค้า
                      </a>
                    )}
                    <a className="btn small quiet" href={href(`/item/${encodeURIComponent(w.item_id)}`)}>
                      แก้ไข
                    </a>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
