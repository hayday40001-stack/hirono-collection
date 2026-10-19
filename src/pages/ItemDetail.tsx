import { useEffect, useRef, useState } from 'react';
import { useApp } from '../app/context.tsx';
import { compressImage, money, thaiDate } from '../app/format.ts';
import { href } from '../app/router.tsx';
import { CATEGORY_LABEL, CONDITION_LABEL, EDITION_LABEL, PRESENCE_LABEL, PRIORITY_LABEL, STATUS_LABEL, VERIFICATION_LABEL } from '../domain/labels.ts';
import { safeHttpUrl } from '../domain/schema.ts';
import { COLLECTION_STATUSES, CONDITIONS, PRESENCE, isOwned, isSecretEdition, type CollectionEntry, type Item, type Photo, type Priority, type WishlistEntry } from '../domain/types.ts';
import { ItemFace } from '../components/ItemTag.tsx';
import { Empty, Lightbox, useAction, useAsync, useConfirm, useObjectUrl, useToast } from '../components/ui.tsx';
import { IconCamera, IconHeart, IconHeartFilled } from '../components/icons.tsx';
import { BackLink, SourceList } from './shared.tsx';
import type { EntryPatch } from '../repositories/collectionRepo.ts';

function numOrNull(v: string): number | null {
  if (v.trim() === '') return null;
  const n = Number(v.replace(/,/g, ''));
  return Number.isFinite(n) && n >= 0 ? n : NaN;
}

export function ItemDetail({ id }: { id: string }) {
  const { data, repos } = useApp();
  const item = data.itemsById.get(id);
  useEffect(() => {
    if (item) void repos.settings.markViewed(item.id);
  }, [item?.id]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!item) return <Empty title="ไม่พบรายการนี้" action={<BackLink />}>อาจถูกถอดออกจาก Catalog หรือยังไม่ได้อัปเดต Catalog ในเครื่องนี้</Empty>;
  return <ItemView key={item.id} item={item} />;
}

function ItemView({ item }: { item: Item }) {
  const { data, repos } = useApp();
  const run = useAction();
  const confirm = useConfirm();
  const entry = data.entries.get(item.id);
  const wish = data.wishlist.get(item.id);
  const series = item.series_id ? data.seriesById.get(item.series_id) : undefined;
  const owned = isOwned(entry);

  const setStatus = async (s: (typeof COLLECTION_STATUSES)[number]) => {
    if (entry && entry.quantity > 0 && (s === 'NOT_OWNED' || s === 'WISHLIST' || s === 'ORDERED')) {
      const ok = await confirm({
        title: 'เปลี่ยนเป็นไม่มีในมือ?',
        body: `ตอนนี้บันทึกว่ามี ${entry.quantity} ชิ้น ถ้าเปลี่ยนเป็น “${STATUS_LABEL[s].th}” จำนวนจะเป็น 0 ข้อมูลราคาและหมายเหตุยังอยู่ครบ`,
        confirm: 'เปลี่ยนสถานะ',
      });
      if (!ok) return;
    }
    if (s === 'WISHLIST' && !wish) await run(() => repos.collection.saveWish(item.id, {}), 'เพิ่มใน Wishlist แล้ว');
    else await run(() => repos.collection.setStatus(item.id, s), `บันทึกเป็น “${STATUS_LABEL[s].th}”`);
  };

  return (
    <div className="page">
      <BackLink />
      <div className="detail">
        <Media item={item} />
        <div className="page" style={{ gap: 'var(--s5)' }}>
          <header className="page-head">
            <div className="row">
              {isSecretEdition(item.edition_type) && <span className="pill secret">{EDITION_LABEL[item.edition_type].th}</span>}
              <span className={`pill ${item.verification_status.startsWith('VERIFIED') ? '' : 'warn'}`} title={VERIFICATION_LABEL[item.verification_status].hint}>
                {VERIFICATION_LABEL[item.verification_status].th}
              </span>
              {item.origin === 'local' && <span className="pill">เพิ่มเองในเครื่องนี้</span>}
              {item.archived && <span className="pill warn">ถูกถอดออกจาก Catalog</span>}
              {item.local_flag && <span className="pill warn">{item.local_flag === 'WRONG_INFO' ? 'แจ้งว่าข้อมูลผิด' : 'แจ้งว่ายกเลิก'}</span>}
            </div>
            <h1>{item.name_th ?? item.name_en}</h1>
            {item.name_th && <p className="lede">{item.name_en}</p>}
            {series && (
              <a href={href(`/series/${series.id}`)} className="meta">
                {series.name_en}
              </a>
            )}
          </header>

          <section className="section" aria-labelledby="status-h">
            <div className="row spread">
              <h2 id="status-h" style={{ fontSize: 'var(--t-lg)' }}>
                สถานะในคลังของคุณ
              </h2>
              <button
                type="button"
                className="btn quiet small"
                aria-pressed={!!entry?.is_favorite}
                onClick={() => run(() => repos.collection.toggleFavorite(item.id))}
              >
                {entry?.is_favorite ? <IconHeartFilled style={{ color: 'var(--burgundy)' }} /> : <IconHeart />}
                {entry?.is_favorite ? 'รุ่นโปรด' : 'เพิ่มเป็นรุ่นโปรด'}
              </button>
            </div>
            <div className="segmented" role="group" aria-label="สถานะ" style={{ ['--n' as string]: 5 }}>
              {COLLECTION_STATUSES.map((s) => (
                <button key={s} type="button" data-status={s} aria-pressed={(entry?.status ?? 'NOT_OWNED') === s} onClick={() => setStatus(s)}>
                  {STATUS_LABEL[s].th}
                </button>
              ))}
            </div>
            <div className="row">
              <span className="meta">จำนวนที่มีในมือ</span>
              <div className="stepper">
                <button type="button" aria-label="ลดจำนวน" onClick={() => run(() => repos.collection.setQuantity(item.id, (entry?.quantity ?? 0) - 1))} disabled={!entry?.quantity}>
                  −
                </button>
                <output aria-live="polite">{entry?.quantity ?? 0}</output>
                <button type="button" aria-label="เพิ่มจำนวน" onClick={() => run(() => repos.collection.setQuantity(item.id, (entry?.quantity ?? 0) + 1))}>
                  +
                </button>
              </div>
              {entry && entry.quantity === 0 && entry.purchase_price !== null && <span className="meta">เคยซื้อไว้ แต่ตอนนี้ไม่มีในมือ</span>}
            </div>
          </section>

          {(owned || entry) && <EntryForm item={item} entry={entry} />}
          <WishPanel item={item} wish={wish} owned={owned} />

          <section className="section">
            <h2 style={{ fontSize: 'var(--t-lg)' }}>ข้อมูลสินค้า</h2>
            <dl className="facts">
              <dt>หมวดหมู่</dt>
              <dd>
                {CATEGORY_LABEL[item.category].th}
                {item.subcategory ? `, ${item.subcategory}` : ''}
              </dd>
              <dt>รุ่น</dt>
              <dd>{EDITION_LABEL[item.edition_type].th}</dd>
              <dt>วางจำหน่าย</dt>
              <dd>{item.release_date ? thaiDate(item.release_date) : item.release_year ?? 'ไม่ทราบ'}</dd>
              <dt>รหัสสินค้า</dt>
              <dd>{item.product_code ?? 'ยังไม่มีข้อมูลที่ยืนยัน'}</dd>
              {item.rarity && (
                <>
                  <dt>ความหายาก</dt>
                  <dd>{item.rarity}</dd>
                </>
              )}
            </dl>
            {item.description && <p className="meta">{item.description}</p>}
            {item.conflicts.length > 0 && (
              <div className="notice">
                <strong>หมายเหตุเรื่องข้อมูล</strong>
                <ul>
                  {item.conflicts.map((c) => (
                    <li key={c}>{c}</li>
                  ))}
                </ul>
              </div>
            )}
            {!item.images.length && <p className="meta">ยังไม่มีรูปสินค้าที่ได้รับอนุญาตใน Catalog คุณเพิ่มรูปถ่ายของคุณเองได้</p>}
          </section>

          <section className="section">
            <h2 style={{ fontSize: 'var(--t-lg)' }}>แหล่งอ้างอิง</h2>
            <SourceList refs={item.sources} />
            <FlagRow item={item} />
          </section>

          <History itemId={item.id} />
          {item.origin === 'local' && <LocalEdit item={item} />}

          {entry && (
            <button
              type="button"
              className="btn danger small"
              style={{ justifySelf: 'start' }}
              onClick={async () => {
                const ok = await confirm({
                  title: 'ลบออกจากคลังของคุณ?',
                  body: 'ข้อมูลส่วนตัวของรุ่นนี้ (จำนวน ราคา สภาพ หมายเหตุ และ Wishlist) จะถูกลบ ส่วนรูปถ่ายและประวัติยังอยู่ การลบนี้ย้อนกลับไม่ได้ เว้นแต่คุณมีไฟล์ Backup',
                  confirm: 'ลบข้อมูล',
                  danger: true,
                });
                if (ok) await run(() => repos.collection.remove(item.id), 'ลบออกจากคลังแล้ว');
              }}
            >
              ลบข้อมูลส่วนตัวของรุ่นนี้
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function Media({ item }: { item: Item }) {
  const { db, repos } = useApp();
  const run = useAction();
  const confirm = useConfirm();
  const [rev, setRev] = useState(0);
  useEffect(() => db.subscribe((s) => s.includes('photos') && setRev((r) => r + 1)), [db]);
  const photos = useAsync(() => repos.photos.forItem(item.id), [item.id, rev]);
  const [open, setOpen] = useState<{ src: string; alt: string } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const toast = useToast();

  const onFiles = async (files: FileList | null) => {
    if (!files?.length) return;
    for (const f of Array.from(files).slice(0, 10)) {
      const r = await run(async () => {
        const img = await compressImage(f);
        return repos.photos.add(item.id, img.blob, img.width, img.height);
      });
      if (!r) break;
    }
    toast('เพิ่มรูปแล้ว');
    if (fileRef.current) fileRef.current.value = '';
  };

  return (
    <div className="detail-media">
      <div className="tag-face" style={{ cursor: item.images[0] ? 'zoom-in' : 'default' }} onClick={() => item.images[0] && setOpen({ src: item.images[0], alt: item.name_en })}>
        <ItemFace item={item} size="hero" />
      </div>
      {photos.value && photos.value.length > 0 && (
        <div className="photo-strip">
          {photos.value.map((p) => (
            <PhotoThumb
              key={p.id}
              photo={p}
              name={item.name_en}
              onOpen={setOpen}
              onDelete={async () => {
                if (await confirm({ title: 'ลบรูปนี้?', body: 'รูปจะถูกลบจากเครื่องนี้ ถ้ายังไม่ได้สำรองรูปไว้จะกู้คืนไม่ได้', confirm: 'ลบรูป', danger: true })) {
                  await run(() => repos.photos.remove(p.id), 'ลบรูปแล้ว');
                }
              }}
            />
          ))}
        </div>
      )}
      <label className="btn small" style={{ justifySelf: 'start' }}>
        <IconCamera /> เพิ่มรูปถ่ายของคุณ
        <input ref={fileRef} type="file" accept="image/*" multiple hidden onChange={(e) => onFiles(e.target.files)} />
      </label>
      {open && <Lightbox src={open.src} alt={open.alt} onClose={() => setOpen(null)} />}
    </div>
  );
}

function PhotoThumb({ photo, name, onOpen, onDelete }: { photo: Photo; name: string; onOpen: (x: { src: string; alt: string }) => void; onDelete: () => void }) {
  const url = useObjectUrl(photo.blob);
  if (!url) return null;
  return (
    <div style={{ position: 'relative' }}>
      <button type="button" onClick={() => onOpen({ src: url, alt: `รูปถ่ายของคุณ: ${name}` })} aria-label="ดูรูปขนาดใหญ่">
        <img src={url} alt="" loading="lazy" />
      </button>
      <button type="button" className="btn small quiet" style={{ minHeight: 28, fontSize: 12, padding: '0 4px' }} onClick={onDelete}>
        ลบ
      </button>
    </div>
  );
}

function EntryForm({ item, entry }: { item: Item; entry: CollectionEntry | undefined }) {
  const { repos, data } = useApp();
  const run = useAction();
  const e = entry;
  const [form, setForm] = useState(() => ({
    purchase_price: e?.purchase_price?.toString() ?? '',
    estimated_value: e?.estimated_value?.toString() ?? '',
    acquired_date: e?.acquired_date ?? '',
    condition: e?.condition ?? '',
    box_status: e?.box_status ?? 'UNKNOWN',
    card_status: e?.card_status ?? 'UNKNOWN',
    accessories_status: e?.accessories_status ?? 'UNKNOWN',
    store: e?.store ?? '',
    personal_notes: e?.personal_notes ?? '',
  }));
  const [dirty, setDirty] = useState(false);
  const set = (k: keyof typeof form, v: string) => {
    setForm((f) => ({ ...f, [k]: v }));
    setDirty(true);
  };
  const pp = numOrNull(form.purchase_price);
  const ev = numOrNull(form.estimated_value);
  const invalid = Number.isNaN(pp) || Number.isNaN(ev);
  const save = async () => {
    const patch: EntryPatch = {
      purchase_price: pp,
      estimated_value: ev,
      acquired_date: form.acquired_date || null,
      condition: (form.condition || null) as EntryPatch['condition'],
      box_status: form.box_status as EntryPatch['box_status'],
      card_status: form.card_status as EntryPatch['card_status'],
      accessories_status: form.accessories_status as EntryPatch['accessories_status'],
      store: form.store.trim() || null,
      personal_notes: form.personal_notes.trim() || null,
    };
    const r = await run(() => repos.collection.update(item.id, patch), 'บันทึกรายละเอียดแล้ว');
    if (r) setDirty(false);
  };
  const cur = data.settings.display_currency;
  return (
    <form
      className="section panel"
      onSubmit={(ev) => {
        ev.preventDefault();
        if (!invalid) void save();
      }}
    >
      <h2 style={{ fontSize: 'var(--t-lg)' }}>รายละเอียดของชิ้นนี้</h2>
      <div className="form-grid two">
        <label className="field">
          <span>ราคาที่ซื้อ (ต่อชิ้น, {cur})</span>
          <input className="input" inputMode="decimal" value={form.purchase_price} aria-invalid={Number.isNaN(pp)} onChange={(x) => set('purchase_price', x.target.value)} />
          {Number.isNaN(pp) && <small style={{ color: 'var(--burgundy)' }}>ใส่ตัวเลขที่ไม่ติดลบ</small>}
        </label>
        <label className="field">
          <span>มูลค่าที่คุณประเมิน (ต่อชิ้น)</span>
          <input className="input" inputMode="decimal" value={form.estimated_value} aria-invalid={Number.isNaN(ev)} onChange={(x) => set('estimated_value', x.target.value)} />
          <small>แอปไม่ดึงราคาตลาดให้ ใส่ตัวเลขที่คุณประเมินเอง</small>
        </label>
        <label className="field">
          <span>วันที่ได้รับ</span>
          <input className="input" type="date" value={form.acquired_date} onChange={(x) => set('acquired_date', x.target.value)} />
        </label>
        <label className="field">
          <span>สภาพสินค้า</span>
          <select className="select" value={form.condition} onChange={(x) => set('condition', x.target.value)}>
            <option value="">ไม่ระบุ</option>
            {CONDITIONS.map((c) => (
              <option key={c} value={c}>
                {CONDITION_LABEL[c]}
              </option>
            ))}
          </select>
        </label>
        {(['box_status', 'card_status', 'accessories_status'] as const).map((k) => (
          <label key={k} className="field">
            <span>{k === 'box_status' ? 'กล่อง' : k === 'card_status' ? 'การ์ด' : 'อุปกรณ์ครบ'}</span>
            <select className="select" value={form[k]} onChange={(x) => set(k, x.target.value)}>
              {PRESENCE.map((p) => (
                <option key={p} value={p}>
                  {PRESENCE_LABEL[p]}
                </option>
              ))}
            </select>
          </label>
        ))}
        <label className="field">
          <span>ร้านหรือแหล่งที่ซื้อ</span>
          <input className="input" value={form.store} maxLength={200} onChange={(x) => set('store', x.target.value)} />
        </label>
      </div>
      <label className="field">
        <span>หมายเหตุส่วนตัว</span>
        <textarea className="textarea" value={form.personal_notes} maxLength={5000} onChange={(x) => set('personal_notes', x.target.value)} />
      </label>
      <div className="row">
        <button type="submit" className="btn primary" disabled={!dirty || invalid}>
          บันทึกรายละเอียด
        </button>
        {e?.purchase_price !== null && e?.purchase_price !== undefined && e.quantity > 1 && (
          <span className="meta">รวม {money(e.purchase_price * e.quantity, cur)} สำหรับ {e.quantity} ชิ้น</span>
        )}
      </div>
    </form>
  );
}

function WishPanel({ item, wish, owned }: { item: Item; wish: WishlistEntry | undefined; owned: boolean }) {
  const { repos, data } = useApp();
  const run = useAction();
  const confirm = useConfirm();
  const [form, setForm] = useState(() => ({
    target_price: wish?.target_price?.toString() ?? '',
    last_seen_price: wish?.last_seen_price?.toString() ?? '',
    priority: String(wish?.priority ?? 2),
    store_url: wish?.store_url ?? '',
    notes: wish?.notes ?? '',
  }));
  useEffect(() => {
    setForm({
      target_price: wish?.target_price?.toString() ?? '',
      last_seen_price: wish?.last_seen_price?.toString() ?? '',
      priority: String(wish?.priority ?? 2),
      store_url: wish?.store_url ?? '',
      notes: wish?.notes ?? '',
    });
  }, [wish?.updated_at]); // eslint-disable-line react-hooks/exhaustive-deps
  const tp = numOrNull(form.target_price);
  const lp = numOrNull(form.last_seen_price);
  const urlBad = form.store_url.trim() !== '' && !safeHttpUrl(form.store_url);
  const invalid = Number.isNaN(tp) || Number.isNaN(lp) || urlBad;
  if (!wish) {
    return (
      <div className="row">
        <button type="button" className="btn" onClick={() => run(() => repos.collection.saveWish(item.id, {}), 'เพิ่มใน Wishlist แล้ว')}>
          {owned ? 'อยากได้เพิ่มอีกชิ้น' : 'เพิ่มใน Wishlist'}
        </button>
      </div>
    );
  }
  return (
    <form
      className="section panel"
      onSubmit={(e) => {
        e.preventDefault();
        if (invalid) return;
        void run(
          () =>
            repos.collection.saveWish(item.id, {
              target_price: tp,
              last_seen_price: lp,
              priority: Number(form.priority) as Priority,
              store_url: form.store_url.trim() || null,
              notes: form.notes.trim() || null,
            }),
          'บันทึก Wishlist แล้ว',
        );
      }}
    >
      <h2 style={{ fontSize: 'var(--t-lg)' }}>Wishlist</h2>
      <div className="form-grid two">
        <label className="field">
          <span>ราคาสูงสุดที่ยอมจ่าย ({data.settings.display_currency})</span>
          <input className="input" inputMode="decimal" value={form.target_price} onChange={(e) => setForm({ ...form, target_price: e.target.value })} aria-invalid={Number.isNaN(tp)} />
        </label>
        <label className="field">
          <span>ราคาที่พบล่าสุด</span>
          <input className="input" inputMode="decimal" value={form.last_seen_price} onChange={(e) => setForm({ ...form, last_seen_price: e.target.value })} aria-invalid={Number.isNaN(lp)} />
        </label>
        <label className="field">
          <span>ความสำคัญ</span>
          <select className="select" value={form.priority} onChange={(e) => setForm({ ...form, priority: e.target.value })}>
            {([1, 2, 3] as const).map((p) => (
              <option key={p} value={p}>
                {PRIORITY_LABEL[p]}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          <span>ลิงก์ร้านค้า</span>
          <input className="input" type="url" inputMode="url" placeholder="https://" value={form.store_url} onChange={(e) => setForm({ ...form, store_url: e.target.value })} aria-invalid={urlBad} />
          {urlBad && <small style={{ color: 'var(--burgundy)' }}>ต้องเป็นลิงก์ที่ขึ้นต้นด้วย https:// หรือ http://</small>}
        </label>
      </div>
      <label className="field">
        <span>หมายเหตุ</span>
        <textarea className="textarea" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} maxLength={5000} />
      </label>
      <div className="row">
        <button type="submit" className="btn primary" disabled={invalid}>
          บันทึก Wishlist
        </button>
        <button type="button" className="btn" onClick={() => run(() => repos.collection.acquire(item.id), 'ย้ายเข้าคลังแล้ว: มีแล้ว')}>
          ได้มาแล้ว
        </button>
        <button
          type="button"
          className="btn quiet"
          onClick={async () => {
            if (await confirm({ title: 'เอาออกจาก Wishlist?', body: 'ราคาเป้าหมาย ลิงก์ และหมายเหตุของ Wishlist นี้จะถูกลบ', confirm: 'เอาออก', danger: true })) {
              await run(() => repos.collection.removeWish(item.id), 'เอาออกจาก Wishlist แล้ว');
            }
          }}
        >
          เอาออก
        </button>
      </div>
    </form>
  );
}

/** Rows added on this device can be edited or archived here. Published catalog rows can't. */
function LocalEdit({ item }: { item: Item }) {
  const { repos } = useApp();
  const run = useAction();
  const confirm = useConfirm();
  const [f, setF] = useState({
    name_en: item.name_en,
    name_th: item.name_th ?? '',
    product_code: item.product_code ?? '',
    release_year: item.release_year?.toString() ?? '',
    description: item.description ?? '',
  });
  const yearBad = f.release_year !== '' && !/^20\d{2}$/.test(f.release_year);
  return (
    <details className="panel">
      <summary>แก้ไขรายการที่คุณเพิ่มเอง</summary>
      <form
        className="form-grid"
        onSubmit={(e) => {
          e.preventDefault();
          if (!f.name_en.trim() || yearBad) return;
          void run(
            () =>
              repos.catalog.updateLocalItem(item.id, {
                name_en: f.name_en.trim(),
                name_th: f.name_th.trim() || null,
                product_code: f.product_code.trim() || null,
                release_year: f.release_year ? Number(f.release_year) : null,
                description: f.description.trim() || null,
              }),
            'บันทึกการแก้ไขแล้ว',
          );
        }}
      >
        <div className="form-grid two">
          <label className="field">
            <span>ชื่อภาษาอังกฤษ</span>
            <input className="input" required maxLength={200} value={f.name_en} onChange={(e) => setF({ ...f, name_en: e.target.value })} />
          </label>
          <label className="field">
            <span>ชื่อภาษาไทย</span>
            <input className="input" maxLength={200} value={f.name_th} onChange={(e) => setF({ ...f, name_th: e.target.value })} />
          </label>
          <label className="field">
            <span>รหัสสินค้า</span>
            <input className="input" maxLength={80} value={f.product_code} onChange={(e) => setF({ ...f, product_code: e.target.value })} />
          </label>
          <label className="field">
            <span>ปีที่วางจำหน่าย</span>
            <input className="input" inputMode="numeric" value={f.release_year} aria-invalid={yearBad} onChange={(e) => setF({ ...f, release_year: e.target.value })} />
          </label>
        </div>
        <label className="field">
          <span>รายละเอียด</span>
          <textarea className="textarea" maxLength={2000} value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} />
        </label>
        <div className="row">
          <button type="submit" className="btn primary" disabled={!f.name_en.trim() || yearBad}>
            บันทึกการแก้ไข
          </button>
          <button
            type="button"
            className="btn danger"
            onClick={async () => {
              const archive = !item.archived;
              if (archive && !(await confirm({ title: 'เก็บรายการนี้เข้าคลัง?', body: 'รายการจะถูกซ่อนจาก Catalog แต่ข้อมูลในคลังของคุณยังอยู่ และกู้คืนได้ภายหลัง', confirm: 'เก็บเข้าคลัง', danger: true }))) return;
              await run(() => repos.catalog.setArchived(item.id, archive), archive ? 'เก็บเข้าคลังแล้ว' : 'กู้คืนแล้ว');
            }}
          >
            {item.archived ? 'กู้คืนรายการ' : 'เก็บรายการเข้าคลัง'}
          </button>
        </div>
      </form>
    </details>
  );
}

function FlagRow({ item }: { item: Item }) {
  const { repos } = useApp();
  const run = useAction();
  return (
    <div className="row">
      <span className="meta">ข้อมูลไม่ถูกต้อง?</span>
      {item.local_flag ? (
        <button type="button" className="btn small quiet" onClick={() => run(() => repos.catalog.setFlag(item.id, null), 'ล้างเครื่องหมายแล้ว')}>
          ล้างเครื่องหมาย
        </button>
      ) : (
        <>
          <button type="button" className="btn small quiet" onClick={() => run(() => repos.catalog.setFlag(item.id, 'WRONG_INFO'), 'ทำเครื่องหมายว่าข้อมูลผิดแล้ว')}>
            ข้อมูลผิด
          </button>
          <button type="button" className="btn small quiet" onClick={() => run(() => repos.catalog.setFlag(item.id, 'CANCELLED'), 'ทำเครื่องหมายว่ายกเลิกแล้ว')}>
            สินค้าถูกยกเลิก
          </button>
        </>
      )}
    </div>
  );
}

function History({ itemId }: { itemId: string }) {
  const { repos, data } = useApp();
  const h = useAsync(() => repos.collection.history(itemId), [itemId, data.entries.get(itemId)?.updated_at]);
  if (!h.value?.length) return null;
  return (
    <section className="section">
      <h2 style={{ fontSize: 'var(--t-lg)' }}>ประวัติการเปลี่ยนสถานะ</h2>
      <ol className="timeline">
        {h.value.map((ev) => (
          <li key={ev.id}>
            <span className="meta">{thaiDate(ev.at)}</span>
            <span>
              {ev.from_status ? STATUS_LABEL[ev.from_status].th : 'เริ่มบันทึก'} → {STATUS_LABEL[ev.to_status].th}
              {ev.from_quantity !== ev.to_quantity && ` (${ev.from_quantity} → ${ev.to_quantity} ชิ้น)`}
            </span>
          </li>
        ))}
      </ol>
    </section>
  );
}
