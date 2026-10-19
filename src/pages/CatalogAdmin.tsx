import { useMemo, useState } from 'react';
import { useApp } from '../app/context.tsx';
import { downloadText, stamp, thaiDate } from '../app/format.ts';
import { href } from '../app/router.tsx';
import { CATEGORY_LABEL, EDITION_LABEL, VERIFICATION_LABEL } from '../domain/labels.ts';
import { safeHttpUrl } from '../domain/schema.ts';
import { CATEGORIES, EDITION_TYPES, VERIFICATION_STATUSES, type CatalogFile, type Category, type EditionType, type Item, type VerificationStatus } from '../domain/types.ts';
import { findLikelyDuplicates } from '../domain/validators.ts';
import { applyCatalog, diffCatalog, fetchPublishedCatalog, isNoop, parseCatalogText, readSnapshot, type CatalogDiff } from '../services/catalogUpdate.ts';
import { ITEM_CSV_COLUMNS, parseItemCsv, toCsv, type CsvItemRow } from '../services/csv.ts';
import { DuplicateItemError } from '../repositories/catalogRepo.ts';
import { useAction, useAsync, useConfirm, useToast } from '../components/ui.tsx';
import { BackLink } from './shared.tsx';

type Tab = 'update' | 'add' | 'import' | 'review' | 'history';

export function CatalogAdmin() {
  const [tab, setTab] = useState<Tab>('update');
  return (
    <div className="page">
      <BackLink />
      <header className="page-head">
        <h1>จัดการ Catalog</h1>
        <p className="meta">
          Catalog กลางเผยแพร่เป็นไฟล์ JSON ใน GitHub repository ผู้ที่มีสิทธิ์แก้ repository เท่านั้นที่แก้ Catalog กลางได้ สิ่งที่คุณเพิ่มหรือแก้ในหน้านี้มีผลเฉพาะเครื่องนี้ และส่งออกเป็นไฟล์เพื่อเสนอให้ผู้ดูแลตรวจได้
        </p>
      </header>
      <div className="chips" role="tablist">
        {(
          [
            ['update', 'อัปเดต Catalog'],
            ['add', 'เพิ่มรายการ'],
            ['import', 'นำเข้า/ส่งออก'],
            ['review', 'รอตรวจสอบ'],
            ['history', 'ประวัติการแก้ไข'],
          ] as [Tab, string][]
        ).map(([k, l]) => (
          <button key={k} type="button" role="tab" className="chip" aria-pressed={tab === k} aria-selected={tab === k} onClick={() => setTab(k)}>
            {l}
          </button>
        ))}
      </div>
      {tab === 'update' && <UpdateTab />}
      {tab === 'add' && <AddTab />}
      {tab === 'import' && <ImportTab />}
      {tab === 'review' && <ReviewTab />}
      {tab === 'history' && <HistoryTab />}
    </div>
  );
}

function DiffView({ diff, warnings }: { diff: CatalogDiff; warnings: string[] }) {
  return (
    <div className="panel">
      <strong>
        {diff.fromVersion ?? '(ยังไม่มี)'} → {diff.toVersion}
      </strong>
      <table className="table">
        <tbody>
          <tr>
            <td>รายการใหม่</td>
            <td className="n">{diff.items.added.length}</td>
          </tr>
          <tr>
            <td>รายการที่ข้อมูลเปลี่ยน</td>
            <td className="n">{diff.items.changed.length}</td>
          </tr>
          <tr>
            <td>รายการที่ถูกถอดออก (จะเก็บเข้าคลัง ไม่ลบ)</td>
            <td className="n">{diff.items.archived.length}</td>
          </tr>
          <tr>
            <td>รายการที่กลับมา</td>
            <td className="n">{diff.items.restored.length}</td>
          </tr>
          <tr>
            <td>ซีรีส์ใหม่ / เปลี่ยน</td>
            <td className="n">
              {diff.series.added.length} / {diff.series.changed.length}
            </td>
          </tr>
          <tr>
            <td>แหล่งอ้างอิงใหม่ / เปลี่ยน</td>
            <td className="n">
              {diff.sources.added} / {diff.sources.changed}
            </td>
          </tr>
        </tbody>
      </table>
      {diff.items.added.length > 0 && (
        <details>
          <summary>ดูรายการใหม่</summary>
          <p className="meta">{diff.items.added.map((i) => i.name_en).join(', ')}</p>
        </details>
      )}
      {diff.items.changed.length > 0 && (
        <details>
          <summary>ดูรายการที่เปลี่ยน</summary>
          <ul className="meta">
            {diff.items.changed.slice(0, 100).map((c) => (
              <li key={c.id}>
                {c.name}: {c.fields.join(', ')}
              </li>
            ))}
          </ul>
        </details>
      )}
      {diff.personalEntriesOnArchived > 0 && <p className="meta">{diff.personalEntriesOnArchived} รายการที่ถูกถอดออกอยู่ในคลังหรือ Wishlist ของคุณ ข้อมูลส่วนตัวจะยังอยู่ครบ</p>}
      {[...diff.duplicates, ...warnings].length > 0 && (
        <div className="notice">
          <strong>รายการที่อาจซ้ำ</strong>
          <ul>
            {[...diff.duplicates, ...warnings].slice(0, 30).map((w) => (
              <li key={w}>{w}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function UpdateTab() {
  const { db, data } = useApp();
  const run = useAction();
  const toast = useToast();
  const [state, setState] = useState<{ catalog: CatalogFile; diff: CatalogDiff; warnings: string[]; origin: 'remote' | 'file' } | null>(null);
  const [errors, setErrors] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);

  const prepare = async (r: Awaited<ReturnType<typeof fetchPublishedCatalog>>, origin: 'remote' | 'file') => {
    setState(null);
    if (!r.ok) {
      setErrors(r.errors.slice(0, 20));
      return;
    }
    setErrors([]);
    const personal = new Set([...data.entries.keys(), ...data.wishlist.keys()]);
    const diff = diffCatalog(await readSnapshot(db), r.value.catalog, personal);
    if (isNoop(diff)) {
      toast(`Catalog ในเครื่องเป็นเวอร์ชันล่าสุดแล้ว (${diff.toVersion})`);
      return;
    }
    setState({ catalog: r.value.catalog, diff, warnings: r.value.warnings, origin });
  };

  return (
    <section className="section">
      <dl className="facts">
        <dt>เวอร์ชันในเครื่อง</dt>
        <dd>{data.meta?.catalog_version ?? 'ยังไม่ได้ติดตั้ง'}</dd>
        <dt>ติดตั้งเมื่อ</dt>
        <dd>{thaiDate(data.meta?.installed_at, true)}</dd>
      </dl>
      <p className="meta">การอัปเดตเป็นทางเลือก แอปใช้งาน Catalog เดิมแบบออฟไลน์ได้ตลอด และการอัปเดตจะไม่แตะต้องคลัง Wishlist หรือรูปถ่ายของคุณ</p>
      <div className="row">
        <button
          type="button"
          className="btn primary"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            await prepare(await fetchPublishedCatalog('catalog/catalog.json', true), 'remote');
            setBusy(false);
          }}
        >
          {busy ? 'กำลังตรวจสอบ…' : 'ตรวจหา Catalog ใหม่'}
        </button>
        <label className="btn">
          นำเข้าจากไฟล์ JSON
          <input type="file" accept="application/json,.json" hidden onChange={async (e) => e.target.files?.[0] && prepare(parseCatalogText(await e.target.files[0].text()), 'file')} />
        </label>
      </div>
      {errors.length > 0 && (
        <div className="notice danger" role="alert">
          <strong>ใช้ไฟล์ Catalog นี้ไม่ได้ ข้อมูลในเครื่องไม่ถูกแก้ไข</strong>
          <ul>
            {errors.map((e) => (
              <li key={e}>{e}</li>
            ))}
          </ul>
        </div>
      )}
      {state && (
        <>
          <DiffView diff={state.diff} warnings={state.warnings} />
          <div className="row">
            <button
              type="button"
              className="btn primary"
              onClick={async () => {
                const r = await run(() => applyCatalog(db, state.catalog, state.origin));
                if (r) {
                  toast(`อัปเดต Catalog เป็น ${state.catalog.catalog_version} แล้ว`);
                  setState(null);
                }
              }}
            >
              ติดตั้ง Catalog นี้
            </button>
            <button type="button" className="btn" onClick={() => setState(null)}>
              ยกเลิก
            </button>
          </div>
        </>
      )}
    </section>
  );
}

const blankItem = {
  name_en: '',
  name_th: '',
  series_id: '',
  category: 'OTHER' as Category,
  subcategory: '',
  release_year: '',
  release_date: '',
  edition_type: 'REGULAR' as EditionType,
  product_code: '',
  description: '',
  source_url: '',
  source_note: '',
};

function AddTab() {
  const { data, repos } = useApp();
  const run = useAction();
  const toast = useToast();
  const confirm = useConfirm();
  const [f, setF] = useState(blankItem);
  const [seriesName, setSeriesName] = useState('');
  const seriesOptions = useMemo(() => [...data.series].filter((s) => !s.archived).sort((a, b) => a.name_en.localeCompare(b.name_en)), [data.series]);
  const yearBad = f.release_year !== '' && !/^(20\d{2}|2100)$/.test(f.release_year);
  const urlBad = f.source_url !== '' && !safeHttpUrl(f.source_url);

  const submit = async (allowDuplicate = false): Promise<void> => {
    const series = data.seriesById.get(f.series_id);
    try {
      const it = await repos.catalog.addItem(
        {
          name_en: f.name_en.trim(),
          name_th: f.name_th.trim() || null,
          series_id: f.series_id || null,
          category: series?.series_type ?? f.category,
          subcategory: f.subcategory.trim() || null,
          release_year: f.release_year ? Number(f.release_year) : series?.release_year ?? null,
          release_date: f.release_date || null,
          edition_type: f.edition_type,
          rarity: null,
          product_code: f.product_code.trim() || null,
          description: f.description.trim() || null,
          images: [],
          verification_status: 'UNVERIFIED',
          sources: [],
          conflicts: f.source_url ? [`Source given by user: ${f.source_url}${f.source_note ? ` (${f.source_note})` : ''}`] : [],
          aliases: [],
        },
        { allowDuplicate },
      );
      toast(`เพิ่ม “${it.name_en}” แล้ว (ยังไม่ยืนยัน)`);
      setF({ ...blankItem, series_id: f.series_id, category: f.category, release_year: f.release_year });
    } catch (e) {
      if (e instanceof DuplicateItemError) {
        const ok = await confirm({
          title: 'อาจเป็นรายการซ้ำ',
          body: (
            <>
              มี <a href={href(`/item/${e.existing.id}`)}>{e.existing.name_en}</a> ในซีรีส์และรุ่นเดียวกันอยู่แล้ว ถ้าเป็นคนละสินค้าจริง (เช่น คนละขนาดหรือคนละล็อตผลิต) ให้ระบุหมวดย่อยให้ต่างกัน หรือยืนยันเพื่อเพิ่มต่อ
            </>
          ),
          confirm: 'เพิ่มต่อ',
        });
        if (ok) return submit(true);
      } else toast(e instanceof Error ? e.message : String(e), { tone: 'error' });
    }
  };

  return (
    <section className="section">
      <p className="meta">รายการที่เพิ่มเองจะถูกตั้งเป็น “ยังไม่ยืนยัน” เสมอ และไม่ถูกนับในเปอร์เซ็นต์ความคืบหน้า จนกว่าจะเข้า Catalog กลางพร้อมแหล่งอ้างอิง</p>
      <form
        className="panel form-grid"
        onSubmit={(e) => {
          e.preventDefault();
          if (!f.name_en.trim() || yearBad || urlBad) return;
          void submit();
        }}
      >
        <div className="form-grid two">
          <label className="field">
            <span>ชื่อภาษาอังกฤษ *</span>
            <input className="input" required maxLength={200} value={f.name_en} onChange={(e) => setF({ ...f, name_en: e.target.value })} />
          </label>
          <label className="field">
            <span>ชื่อภาษาไทย</span>
            <input className="input" maxLength={200} value={f.name_th} onChange={(e) => setF({ ...f, name_th: e.target.value })} />
          </label>
          <label className="field">
            <span>ซีรีส์</span>
            <select className="select" value={f.series_id} onChange={(e) => setF({ ...f, series_id: e.target.value })}>
              <option value="">ไม่อยู่ในซีรีส์ (ชิ้นเดี่ยว)</option>
              {seriesOptions.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name_en}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>หมวดหมู่ {f.series_id && '(ใช้ตามซีรีส์)'}</span>
            <select className="select" value={f.category} disabled={!!f.series_id} onChange={(e) => setF({ ...f, category: e.target.value as Category })}>
              {CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {CATEGORY_LABEL[c].th}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>รุ่น</span>
            <select className="select" value={f.edition_type} onChange={(e) => setF({ ...f, edition_type: e.target.value as EditionType })}>
              {EDITION_TYPES.map((x) => (
                <option key={x} value={x}>
                  {EDITION_LABEL[x].th}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>หมวดย่อย (เช่น ขนาด, พวงกุญแจ)</span>
            <input className="input" maxLength={120} value={f.subcategory} onChange={(e) => setF({ ...f, subcategory: e.target.value })} />
          </label>
          <label className="field">
            <span>ปีที่วางจำหน่าย</span>
            <input className="input" inputMode="numeric" value={f.release_year} aria-invalid={yearBad} onChange={(e) => setF({ ...f, release_year: e.target.value })} />
          </label>
          <label className="field">
            <span>รหัสสินค้า</span>
            <input className="input" maxLength={80} value={f.product_code} onChange={(e) => setF({ ...f, product_code: e.target.value })} />
          </label>
          <label className="field">
            <span>ลิงก์แหล่งอ้างอิง</span>
            <input className="input" type="url" placeholder="https://" value={f.source_url} aria-invalid={urlBad} onChange={(e) => setF({ ...f, source_url: e.target.value })} />
          </label>
          <label className="field">
            <span>แหล่งนี้ยืนยันอะไร</span>
            <input className="input" maxLength={200} value={f.source_note} onChange={(e) => setF({ ...f, source_note: e.target.value })} />
          </label>
        </div>
        <label className="field">
          <span>รายละเอียด</span>
          <textarea className="textarea" maxLength={2000} value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} />
        </label>
        <div className="row">
          <button type="submit" className="btn primary" disabled={!f.name_en.trim() || yearBad || urlBad}>
            เพิ่มรายการ แล้วเพิ่มต่อ
          </button>
        </div>
      </form>

      <form
        className="panel"
        onSubmit={async (e) => {
          e.preventDefault();
          const name = seriesName.trim();
          if (!name) return;
          const s = await run(
            () =>
              repos.catalog.addSeries({
                name_en: name,
                name_th: null,
                release_year: null,
                release_date: null,
                series_type: f.category,
                product_kind: 'Blind box figures',
                description: null,
                cover_image: null,
                verification_status: 'UNVERIFIED',
                roster_status: 'UNKNOWN',
                declared_count: { regular: null, secret: null },
                sources: [],
                conflicts: [],
              }),
            `เพิ่มซีรีส์ “${name}” แล้ว`,
          );
          if (s) {
            setSeriesName('');
            setF({ ...f, series_id: s.id });
          }
        }}
      >
        <label className="field">
          <span>เพิ่มซีรีส์ใหม่ (หมวด: {CATEGORY_LABEL[f.category].th})</span>
          <input className="input" value={seriesName} maxLength={200} onChange={(e) => setSeriesName(e.target.value)} placeholder="เช่น Hirono … Series" />
        </label>
        <button type="submit" className="btn" style={{ justifySelf: 'start' }} disabled={!seriesName.trim()}>
          เพิ่มซีรีส์
        </button>
      </form>
    </section>
  );
}

function ImportTab() {
  const { data, repos } = useApp();
  const run = useAction();
  const toast = useToast();
  const [rows, setRows] = useState<CsvItemRow[] | null>(null);
  const [errors, setErrors] = useState<string[]>([]);

  const onFile = async (file: File) => {
    const text = await file.text();
    if (file.name.toLowerCase().endsWith('.json')) {
      try {
        const arr = JSON.parse(text);
        const list = Array.isArray(arr) ? arr : arr.items;
        if (!Array.isArray(list)) throw new Error();
        const csv = toCsv([ITEM_CSV_COLUMNS, ...list.map((o: Record<string, unknown>) => ITEM_CSV_COLUMNS.map((c) => o[c] ?? ''))]).replace(/^﻿/, '');
        const r = parseItemCsv(csv);
        setRows(r.rows);
        setErrors(r.errors);
      } catch {
        setRows(null);
        setErrors(['JSON ต้องเป็นรายการ (array) ของสินค้า หรือ object ที่มีคีย์ items']);
      }
      return;
    }
    const r = parseItemCsv(text);
    setRows(r.rows);
    setErrors(r.errors);
  };

  const unknownSeries = rows?.filter((r) => r.series_id && !data.seriesById.has(r.series_id)) ?? [];
  const dupWarnings = rows
    ? findLikelyDuplicates([...data.items, ...rows.map((r, i) => ({ id: `row-${i + 2}`, series_id: r.series_id, name_en: r.name_en, edition_type: r.edition_type, subcategory: r.subcategory }))]).filter((w) =>
        w.includes('row-'),
      )
    : [];

  return (
    <section className="section">
      <h2>นำเข้ารายการจาก CSV หรือ JSON</h2>
      <p className="meta">คอลัมน์: {ITEM_CSV_COLUMNS.join(', ')} (ต้องมี name_en) ทุกแถวจะถูกเพิ่มเป็น “ยังไม่ยืนยัน” ในเครื่องนี้</p>
      <div className="row">
        <label className="btn">
          เลือกไฟล์
          <input type="file" accept=".csv,text/csv,.json,application/json" hidden onChange={(e) => e.target.files?.[0] && onFile(e.target.files[0])} />
        </label>
        <button type="button" className="btn quiet" onClick={() => downloadText('hirono-items-template.csv', toCsv([ITEM_CSV_COLUMNS, ['Example Figure', '', 'series-echo', 'MAIN_BLIND_BOX', 'Blind box figure', '2025', 'REGULAR', '', 'https://www.popmart.com/', '']]), 'text/csv')}>
          ดาวน์โหลดแม่แบบ CSV
        </button>
      </div>
      {errors.length > 0 && (
        <div className="notice danger">
          <strong>{errors.length} แถวมีปัญหาและจะถูกข้าม</strong>
          <ul>
            {errors.slice(0, 20).map((e) => (
              <li key={e}>{e}</li>
            ))}
          </ul>
        </div>
      )}
      {rows && (
        <div className="panel">
          <span>พร้อมเพิ่ม {rows.length - unknownSeries.length} รายการ</span>
          {unknownSeries.length > 0 && <span className="meta">{unknownSeries.length} แถวอ้างถึงซีรีส์ที่ไม่มีในเครื่อง จะถูกข้าม</span>}
          {dupWarnings.length > 0 && (
            <div className="notice">
              <strong>อาจซ้ำกับรายการเดิม (จะถูกข้าม)</strong>
              <ul>
                {dupWarnings.slice(0, 20).map((w) => (
                  <li key={w}>{w}</li>
                ))}
              </ul>
            </div>
          )}
          <button
            type="button"
            className="btn primary"
            style={{ justifySelf: 'start' }}
            onClick={async () => {
              let added = 0;
              let skipped = 0;
              for (const r of rows) {
                if (r.series_id && !data.seriesById.has(r.series_id)) {
                  skipped++;
                  continue;
                }
                const ok = await repos.catalog
                  .addItem({
                    name_en: r.name_en,
                    name_th: r.name_th,
                    series_id: r.series_id,
                    category: r.series_id ? data.seriesById.get(r.series_id)!.series_type : r.category,
                    subcategory: r.subcategory,
                    release_year: r.release_year,
                    release_date: null,
                    edition_type: r.edition_type,
                    rarity: null,
                    product_code: r.product_code,
                    description: r.notes,
                    images: [],
                    verification_status: 'UNVERIFIED',
                    sources: [],
                    conflicts: r.source_url && safeHttpUrl(r.source_url) ? [`Source given by user: ${r.source_url}`] : [],
                    aliases: [],
                  })
                  .then(
                    () => true,
                    () => false,
                  );
                if (ok) added++;
                else skipped++;
              }
              toast(`เพิ่ม ${added} รายการ, ข้าม ${skipped}`);
              setRows(null);
            }}
          >
            เพิ่มรายการ
          </button>
        </div>
      )}

      <h2>ส่งออก Catalog</h2>
      <p className="meta">ส่งออกทุกอย่างในเครื่องเป็นไฟล์รูปแบบเดียวกับ Catalog กลาง ผู้ดูแลตรวจแหล่งอ้างอิงแล้วนำไปแทนไฟล์ public/catalog/catalog.json ใน repository</p>
      <button
        type="button"
        className="btn"
        style={{ justifySelf: 'start' }}
        onClick={() => run(async () => downloadText(`hirono-catalog-${stamp()}.json`, JSON.stringify(await repos.catalog.exportCatalog(), null, 1)), 'ส่งออก Catalog แล้ว')}
      >
        ส่งออก Catalog (JSON)
      </button>
    </section>
  );
}

function ReviewTab() {
  const { data } = useApp();
  const [status, setStatus] = useState<VerificationStatus | 'FLAGGED' | 'DUPES'>('UNVERIFIED');
  const dupes = useMemo(() => findLikelyDuplicates(data.items.filter((i) => !i.archived)), [data.items]);
  const list: Item[] =
    status === 'FLAGGED' ? data.items.filter((i) => i.local_flag) : status === 'DUPES' ? [] : data.items.filter((i) => !i.archived && i.verification_status === status);
  return (
    <section className="section">
      <div className="chips">
        {VERIFICATION_STATUSES.filter((s) => s !== 'VERIFIED_OFFICIAL').map((s) => (
          <button key={s} type="button" className="chip" aria-pressed={status === s} onClick={() => setStatus(s)}>
            {VERIFICATION_LABEL[s].th} {data.items.filter((i) => !i.archived && i.verification_status === s).length}
          </button>
        ))}
        <button type="button" className="chip" aria-pressed={status === 'FLAGGED'} onClick={() => setStatus('FLAGGED')}>
          ที่คุณแจ้งว่าผิด {data.items.filter((i) => i.local_flag).length}
        </button>
        <button type="button" className="chip" aria-pressed={status === 'DUPES'} onClick={() => setStatus('DUPES')}>
          อาจซ้ำ {dupes.length}
        </button>
      </div>
      {status === 'DUPES' ? (
        dupes.length ? (
          <ul className="sources">
            {dupes.map((d) => (
              <li key={d}>{d}</li>
            ))}
          </ul>
        ) : (
          <p className="meta">ไม่พบรายการที่น่าจะซ้ำ</p>
        )
      ) : list.length ? (
        <table className="table">
          <thead>
            <tr>
              <th>รายการ</th>
              <th>ที่มา</th>
              <th>หมายเหตุ</th>
            </tr>
          </thead>
          <tbody>
            {list.map((i) => (
              <tr key={i.id}>
                <td>
                  <a href={href(`/item/${i.id}`)}>{i.name_en}</a>
                  <div className="meta">{i.series_id ? data.seriesById.get(i.series_id)?.name_en : 'ชิ้นเดี่ยว'}</div>
                </td>
                <td>{i.origin === 'local' ? 'เพิ่มเอง' : 'Catalog'}</td>
                <td className="meta">{i.conflicts[0] ?? '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <p className="meta">ไม่มีรายการในสถานะนี้</p>
      )}
    </section>
  );
}

function HistoryTab() {
  const { repos, data } = useApp();
  const h = useAsync(() => repos.catalog.history(), [data.items]);
  if (!h.value?.length) return <p className="meta">ยังไม่มีประวัติ</p>;
  return (
    <ol className="timeline">
      {h.value.map((e) => (
        <li key={e.id}>
          <span className="meta">{thaiDate(e.at, true)}</span>
          <span>
            {e.target === 'item' ? <a href={href(`/item/${e.target_id}`)}>{data.itemsById.get(e.target_id)?.name_en ?? e.target_id}</a> : e.target_id}: {e.summary}
          </span>
        </li>
      ))}
    </ol>
  );
}
