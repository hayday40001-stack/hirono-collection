import { useMemo, useState } from 'react';
import { useApp } from '../app/context.tsx';
import { itemSubtitle } from '../app/format.ts';
import { isOwned } from '../domain/types.ts';
import { DEFAULT_FILTERS, filterItems } from '../services/search.ts';
import { IconSearchHeart } from './icons.tsx';
import { ItemFace } from './ItemTag.tsx';
import { Sheet, useAction, useToast } from './ui.tsx';

/**
 * Add many pieces without reopening a form: search, tap every style you have,
 * save once. Already-owned styles are shown but can't be selected again.
 */
export function QuickAdd({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { data, repos } = useApp();
  const run = useAction();
  const toast = useToast();
  const [q, setQ] = useState('');
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const results = useMemo(
    () => filterItems(data.items.filter((i) => !i.archived), data.seriesById, data.entries, new Set(data.wishlist.keys()), { ...DEFAULT_FILTERS, query: q }).slice(0, 60),
    [q, data],
  );
  const toggle = (id: string) =>
    setPicked((p) => {
      const n = new Set(p);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  const save = async (close: boolean) => {
    const ids = [...picked];
    const added = await run(() => repos.collection.addOwnedMany(ids));
    if (added === undefined) return;
    toast(`บันทึก ${added} รุ่นเป็น “มีแล้ว”`);
    setPicked(new Set());
    if (close) onClose();
  };
  return (
    <Sheet open={open} onClose={onClose} title="เพิ่มของสะสม" labelledBy="quick-add-title">
      <p className="meta">แตะทุกรุ่นที่คุณมี แล้วกดบันทึกครั้งเดียว รายละเอียดอย่างราคาหรือสภาพ เพิ่มทีหลังได้ในหน้าของแต่ละรุ่น</p>
      <label className="search">
        <IconSearchHeart />
        <span className="sr-only">ค้นหา</span>
        <input className="input" type="search" placeholder="ชื่อรุ่น ชื่อซีรีส์ หรือปี" value={q} onChange={(e) => setQ(e.target.value)} autoFocus />
      </label>
      <div className="list" role="group" aria-label="ผลการค้นหา">
        {results.map((it) => {
          const owned = isOwned(data.entries.get(it.id));
          const on = picked.has(it.id);
          return (
            <label key={it.id} className="list-row" style={{ cursor: owned ? 'default' : 'pointer', opacity: owned ? 0.6 : 1 }}>
              <span className="thumb">
                <ItemFace item={it} size="thumb" />
              </span>
              <span style={{ display: 'grid', gap: 2 }}>
                <span className="tag-name">{it.name_th ?? it.name_en}</span>
                <span className="tag-sub">{itemSubtitle(it, data.seriesById.get(it.series_id ?? ''))}</span>
              </span>
              {owned ? (
                <span className="pill owned">มีแล้ว</span>
              ) : (
                <input type="checkbox" checked={on} onChange={() => toggle(it.id)} style={{ width: 24, height: 24, accentColor: 'var(--olive)' }} aria-label={`เลือก ${it.name_en}`} />
              )}
            </label>
          );
        })}
        {results.length === 0 && <p className="meta" style={{ padding: '16px 0' }}>ไม่พบรายการที่ตรงกับ “{q}” ถ้าเป็นรุ่นที่ยังไม่มีใน Catalog เพิ่มเองได้ที่ “จัดการ Catalog”</p>}
      </div>
      <div className="row" style={{ position: 'sticky', bottom: 0, background: 'var(--paper)', padding: '8px 0' }}>
        <button type="button" className="btn primary" disabled={!picked.size} onClick={() => save(false)}>
          บันทึก {picked.size || ''} รุ่น แล้วเพิ่มต่อ
        </button>
        <button type="button" className="btn" disabled={!picked.size} onClick={() => save(true)}>
          บันทึกและปิด
        </button>
      </div>
    </Sheet>
  );
}
