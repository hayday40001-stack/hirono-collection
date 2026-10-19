import { createContext, memo, useContext, useEffect, useState, type ReactNode } from 'react';
import { useApp } from '../app/context.tsx';
import { itemSubtitle, monogram } from '../app/format.ts';
import { href } from '../app/router.tsx';
import { EDITION_LABEL, STATUS_LABEL } from '../domain/labels.ts';
import type { CollectionEntry, Item, Photo, Series } from '../domain/types.ts';
import { isOwned, isSecretEdition, isVerified } from '../domain/types.ts';
import { IconHeartFilled } from './icons.tsx';
import { useObjectUrl } from './ui.tsx';

// First user photo per item, kept in one place so cards don't each hit IndexedDB.
const PhotoCtx = createContext<Map<string, Blob>>(new Map());
export function PhotoIndexProvider({ children }: { children: ReactNode }) {
  const { db } = useApp();
  const [index, setIndex] = useState<Map<string, Blob>>(new Map());
  useEffect(() => {
    const load = () =>
      db.read(['photos'], (tx) => tx.getAll<Photo>('photos')).then((photos) => {
        const m = new Map<string, Blob>();
        for (const p of photos.sort((a, b) => a.created_at.localeCompare(b.created_at))) if (!m.has(p.item_id)) m.set(p.item_id, p.blob);
        setIndex(m);
      });
    void load();
    return db.subscribe((stores) => {
      if (stores.includes('photos')) void load();
    });
  }, [db]);
  return <PhotoCtx.Provider value={index}>{children}</PhotoCtx.Provider>;
}
export const usePhotoIndex = () => useContext(PhotoCtx);

/** Shows, in order: the user's own photo, a catalog image, or the typographic specimen face. Never another item's picture. */
export function ItemFace({ item, size = 'card' }: { item: Item; size?: 'card' | 'thumb' | 'hero' }) {
  const photo = usePhotoIndex().get(item.id);
  const photoUrl = useObjectUrl(photo);
  const linked = useApp().data.customImages.get(item.id);
  const [broken, setBroken] = useState<string | null>(null);
  const candidates = [photoUrl, linked, item.images[0]].filter((u): u is string => !!u && u !== broken);
  const src = candidates[0];
  useEffect(() => setBroken(null), [linked]);
  const alt = src === photoUrl ? `รูปถ่ายของคุณ: ${item.name_en}` : item.name_en;
  if (src) {
    return <img src={src} alt={alt} loading="lazy" decoding="async" referrerPolicy="no-referrer" onError={() => setBroken(src)} />;
  }
  if (size === 'thumb') return <span aria-hidden>{monogram(item.name_en)}</span>;
  return (
    <div className="tag-number" aria-hidden>
      <b>{monogram(item.name_en)}</b>
      <span>{item.release_year ?? 'ไม่ทราบปี'}</span>
    </div>
  );
}

function Stamp({ entry, hunting }: { entry: CollectionEntry | undefined; hunting: boolean }) {
  if (isOwned(entry)) {
    return (
      <span className="stamp" aria-hidden>
        {entry!.status === 'TRADE_OR_SELL' ? 'ขาย/แลก' : 'มีแล้ว'}
        {entry!.quantity > 1 && <small>×{entry!.quantity}</small>}
      </span>
    );
  }
  if (entry?.status === 'ORDERED') return <span className="stamp ordered" aria-hidden>สั่งแล้ว</span>;
  if (hunting) return <span className="stamp hunting" aria-hidden>ตามหา</span>;
  return null;
}

export function statusText(entry: CollectionEntry | undefined, hunting: boolean): string {
  if (isOwned(entry)) return `${STATUS_LABEL[entry!.status].th}${entry!.quantity > 1 ? ` ${entry!.quantity} ชิ้น` : ''}`;
  if (entry?.status === 'ORDERED') return STATUS_LABEL.ORDERED.th;
  if (hunting) return STATUS_LABEL.WISHLIST.th;
  return STATUS_LABEL.NOT_OWNED.th;
}

export const ItemTag = memo(function ItemTag({ item, series, entry, hunting }: { item: Item; series?: Series; entry?: CollectionEntry; hunting: boolean }) {
  const verified = isVerified(item.verification_status);
  return (
    <a className="tag" href={href(`/item/${encodeURIComponent(item.id)}`)} data-verified={verified} data-owned={isOwned(entry)} aria-label={`${item.name_en}, ${statusText(entry, hunting)}`}>
      <div className="tag-face">
        <ItemFace item={item} />
        <Stamp entry={entry} hunting={hunting} />
        {isSecretEdition(item.edition_type) && <span className="edition">{EDITION_LABEL[item.edition_type].th}</span>}
        {entry?.is_favorite && <IconHeartFilled className="fav-mark" />}
      </div>
      <div className="tag-body">
        <span className="tag-name">{item.name_th ?? item.name_en}</span>
        {item.name_th && <span className="tag-sub">{item.name_en}</span>}
        <span className="tag-sub">{itemSubtitle(item, series)}</span>
        {!verified && <span className="tag-sub">ยังไม่ยืนยันข้อมูล</span>}
      </div>
    </a>
  );
});

export const ItemRow = memo(function ItemRow({ item, series, entry, hunting, trailing }: { item: Item; series?: Series; entry?: CollectionEntry; hunting: boolean; trailing?: ReactNode }) {
  const owned = isOwned(entry);
  return (
    <a className="list-row" href={href(`/item/${encodeURIComponent(item.id)}`)}>
      <span className="thumb" data-owned={owned}>
        <ItemFace item={item} size="thumb" />
      </span>
      <span style={{ display: 'grid', gap: 2, minWidth: 0 }}>
        <span className="tag-name">{item.name_th ?? item.name_en}</span>
        <span className="tag-sub">
          {itemSubtitle(item, series)}
          {isSecretEdition(item.edition_type) ? `, ${EDITION_LABEL[item.edition_type].th}` : ''}
          {!isVerified(item.verification_status) ? ', ยังไม่ยืนยัน' : ''}
        </span>
      </span>
      {trailing ?? <span className={`pill ${owned ? 'owned' : ''}`}>{statusText(entry, hunting)}</span>}
    </a>
  );
});

export function ItemGrid({ items, view }: { items: Item[]; view: 'grid' | 'list' }) {
  const { data } = useApp();
  if (view === 'list') {
    return (
      <div className="list">
        {items.map((it) => (
          <ItemRow key={it.id} item={it} series={it.series_id ? data.seriesById.get(it.series_id) : undefined} entry={data.entries.get(it.id)} hunting={data.wishlist.has(it.id)} />
        ))}
      </div>
    );
  }
  return (
    <div className="tags">
      {items.map((it) => (
        <ItemTag key={it.id} item={it} series={it.series_id ? data.seriesById.get(it.series_id) : undefined} entry={data.entries.get(it.id)} hunting={data.wishlist.has(it.id)} />
      ))}
    </div>
  );
}

/** Renders a long list in pages so big catalogs stay smooth on phones. */
export function Paged({ items, view, pageSize = 48 }: { items: Item[]; view: 'grid' | 'list'; pageSize?: number }) {
  const [shown, setShown] = useState(pageSize);
  useEffect(() => setShown(pageSize), [items, pageSize]);
  return (
    <>
      <ItemGrid items={items.slice(0, shown)} view={view} />
      {shown < items.length && (
        <div className="row" style={{ justifyContent: 'center' }}>
          <button type="button" className="btn" onClick={() => setShown((s) => s + pageSize)}>
            แสดงเพิ่มอีก {Math.min(pageSize, items.length - shown)} รายการ (เหลือ {items.length - shown})
          </button>
        </div>
      )}
    </>
  );
}
