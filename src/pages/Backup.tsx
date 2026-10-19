import { useRef, useState } from 'react';
import { APP_VERSION, useApp } from '../app/context.tsx';
import { bytes, downloadText, stamp, thaiDate } from '../app/format.ts';
import {
  applyImport,
  createBackup,
  createPhotoBackup,
  hasUndoSnapshot,
  importPhotoBackup,
  parseBackup,
  photoBackupSize,
  previewImport,
  undoLastImport,
  type BackupFile,
  type BackupScope,
  type ImportMode,
  type ImportPreview,
} from '../services/backup.ts';
import { collectionReportCsv } from '../services/csv.ts';
import { storageEstimate } from '../db/idb.ts';
import { useAction, useAsync, useConfirm, useToast } from '../components/ui.tsx';
import { BackLink } from './shared.tsx';

export function Backup() {
  const { db, data, repos } = useApp();
  const run = useAction();
  const toast = useToast();
  const confirm = useConfirm();
  const fileRef = useRef<HTMLInputElement>(null);
  const photoRef = useRef<HTMLInputElement>(null);
  const [pending, setPending] = useState<{ file: BackupFile; name: string } | null>(null);
  const [mode, setMode] = useState<ImportMode>('merge');
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [errors, setErrors] = useState<string[]>([]);
  const [rev, setRev] = useState(0);
  const undo = useAsync(() => hasUndoSnapshot(db), [rev]);
  const photos = useAsync(() => photoBackupSize(db), [rev]);
  const storage = useAsync(() => storageEstimate(), []);

  const doExport = async (scope: BackupScope) => {
    await run(async () => {
      const b = await createBackup(db, scope, APP_VERSION);
      downloadText(`hirono-${scope}-backup-${stamp()}.json`, JSON.stringify(b, null, 1));
      if (scope === 'all') await repos.settings.update({ last_backup_at: b.created_at, last_backup_count: b.collection.length + b.wishlist.length });
      toast(`ส่งออกแล้ว: ${b.collection.length} รายการในคลัง, ${b.wishlist.length} รายการ Wishlist`);
    });
  };

  const onPick = async (f: File | undefined) => {
    setErrors([]);
    setPreview(null);
    setPending(null);
    if (!f) return;
    if (f.size > 50 * 1024 * 1024) {
      setErrors(['ไฟล์ใหญ่เกิน 50 MB']);
      return;
    }
    const r = parseBackup(await f.text());
    if (!r.ok) {
      setErrors(r.errors);
      return;
    }
    setPending({ file: r.value, name: f.name });
    setPreview(await previewImport(db, r.value, mode));
  };

  const changeMode = async (m: ImportMode) => {
    setMode(m);
    if (pending) setPreview(await previewImport(db, pending.file, m));
  };

  const doImport = async () => {
    if (!pending || !preview) return;
    if (mode === 'replace') {
      const ok = await confirm({
        title: 'แทนที่ข้อมูลในเครื่อง?',
        body: `ข้อมูล ${preview.willRemove} รายการในเครื่องนี้จะถูกแทนที่ด้วยข้อมูลจากไฟล์ คุณกด “ย้อนการนำเข้า” ได้หากเปลี่ยนใจ`,
        confirm: 'แทนที่ข้อมูล',
        danger: true,
      });
      if (!ok) return;
    }
    const r = await run(() => applyImport(db, pending.file, mode));
    if (r) {
      toast(`นำเข้าแล้ว: เพิ่ม ${r.collection.add + r.wishlist.add}, อัปเดต ${r.collection.update + r.wishlist.update}, ข้าม ${r.collection.skip + r.wishlist.skip}`);
      setPending(null);
      setPreview(null);
      if (fileRef.current) fileRef.current.value = '';
      setRev((x) => x + 1);
    }
  };

  const last = data.settings.last_backup_at;
  return (
    <div className="page">
      <BackLink />
      <header className="page-head">
        <h1>สำรองและกู้คืนข้อมูล</h1>
        <p className="lede">ข้อมูลของคุณอยู่ในเครื่องนี้เท่านั้น ไม่ได้ซิงก์ข้ามอุปกรณ์และไม่ได้สำรองบนคลาวด์ ส่งออกไฟล์เก็บไว้เป็นระยะ เช่น ใน iCloud Drive หรือ Google Drive</p>
      </header>

      <div className={`notice ${last ? 'good' : 'danger'}`}>
        {last ? (
          <span>
            สำรองล่าสุด {thaiDate(last, true)} ({data.settings.last_backup_count ?? 0} รายการ)
          </span>
        ) : (
          <span>คุณยังไม่เคยสำรองข้อมูลจากเครื่องนี้</span>
        )}
        <span>ไม่มีการสำรองอัตโนมัติ ต้องกดส่งออกเอง</span>
      </div>

      <section className="section">
        <h2>ส่งออก</h2>
        <div className="row">
          <button type="button" className="btn primary" onClick={() => doExport('all')}>
            สำรองทั้งหมดตอนนี้ (JSON)
          </button>
          <button type="button" className="btn" onClick={() => doExport('collection')}>
            เฉพาะคลัง
          </button>
          <button type="button" className="btn" onClick={() => doExport('wishlist')}>
            เฉพาะ Wishlist
          </button>
          <button
            type="button"
            className="btn"
            onClick={() => {
              downloadText(`hirono-collection-report-${stamp()}.csv`, collectionReportCsv(data.items, data.seriesById, data.entryList), 'text/csv');
              toast('ส่งออกรายงาน CSV แล้ว');
            }}
          >
            รายงาน CSV
          </button>
        </div>
        <p className="meta">ไฟล์ “ทั้งหมด” รวมคลัง Wishlist ประวัติสถานะ สินค้าที่คุณเพิ่มเอง และโปรไฟล์ ไม่รวมรูปถ่าย (สำรองแยกด้านล่าง)</p>
      </section>

      <section className="section">
        <h2>นำเข้า</h2>
        <label className="field">
          <span>เลือกไฟล์ Backup (.json)</span>
          <input ref={fileRef} className="input" type="file" accept="application/json,.json" onChange={(e) => onPick(e.target.files?.[0])} />
        </label>
        {errors.length > 0 && (
          <div className="notice danger" role="alert">
            <strong>นำเข้าไฟล์นี้ไม่ได้ ข้อมูลในเครื่องไม่ถูกแก้ไข</strong>
            <ul>
              {errors.map((e) => (
                <li key={e}>{e}</li>
              ))}
            </ul>
          </div>
        )}
        {pending && preview && (
          <div className="panel">
            <strong>{pending.name}</strong>
            <span className="meta">
              สร้างเมื่อ {thaiDate(pending.file.created_at, true)} จากแอปเวอร์ชัน {pending.file.app_version}, ขอบเขต: {pending.file.scope}
            </span>
            <div className="row" role="radiogroup" aria-label="วิธีนำเข้า">
              <label className="check">
                <input type="radio" name="mode" checked={mode === 'merge'} onChange={() => changeMode('merge')} /> รวมกับข้อมูลเดิม (แนะนำ)
              </label>
              <label className="check">
                <input type="radio" name="mode" checked={mode === 'replace'} onChange={() => changeMode('replace')} /> แทนที่ข้อมูลเดิม
              </label>
            </div>
            <table className="table">
              <thead>
                <tr>
                  <th></th>
                  <th className="n">เพิ่ม</th>
                  <th className="n">อัปเดต</th>
                  <th className="n">ข้าม</th>
                </tr>
              </thead>
              <tbody>
                {(
                  [
                    ['คลัง', preview.collection],
                    ['Wishlist', preview.wishlist],
                    ['ประวัติ', preview.history],
                    ['สินค้าที่เพิ่มเอง', preview.localItems],
                  ] as const
                ).map(([l, c]) => (
                  <tr key={l}>
                    <td>{l}</td>
                    <td className="n">{c.add}</td>
                    <td className="n">{c.update}</td>
                    <td className="n">{c.skip}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {mode === 'merge' && <p className="meta">รายการที่มีอยู่แล้ว จะใช้เวอร์ชันที่แก้ไขล่าสุด ไม่มีการสร้างรายการซ้ำ</p>}
            {mode === 'replace' && <p className="meta">จะลบข้อมูลเดิม {preview.willRemove} รายการในขอบเขตเดียวกันก่อนนำเข้า</p>}
            {preview.unknownItems > 0 && <p className="meta">{preview.unknownItems} รายการยังไม่มีใน Catalog ของเครื่องนี้ จะเก็บไว้และแสดงชื่อหลังอัปเดต Catalog</p>}
            <div className="row">
              <button type="button" className={`btn ${mode === 'replace' ? 'danger solid' : 'primary'}`} onClick={doImport}>
                {mode === 'replace' ? 'แทนที่ข้อมูล' : 'นำเข้า'}
              </button>
              <button
                type="button"
                className="btn"
                onClick={() => {
                  setPending(null);
                  setPreview(null);
                  if (fileRef.current) fileRef.current.value = '';
                }}
              >
                ยกเลิก
              </button>
            </div>
          </div>
        )}
        {undo.value && (
          <div className="notice">
            <span>นำเข้าล่าสุดเมื่อ {thaiDate(undo.value, true)}</span>
            <button
              type="button"
              className="btn small"
              style={{ justifySelf: 'start' }}
              onClick={async () => {
                if (await confirm({ title: 'ย้อนการนำเข้าครั้งล่าสุด?', body: 'ข้อมูลคลัง Wishlist และประวัติจะกลับไปเป็นเหมือนก่อนนำเข้า การแก้ไขหลังจากนั้นจะหายไป', confirm: 'ย้อนการนำเข้า', danger: true })) {
                  const ok = await run(() => undoLastImport(db));
                  if (ok) toast('ย้อนการนำเข้าแล้ว');
                  setRev((x) => x + 1);
                }
              }}
            >
              ย้อนการนำเข้า
            </button>
          </div>
        )}
      </section>

      <section className="section">
        <h2>รูปถ่าย</h2>
        <p className="meta">
          {photos.value ? `มี ${photos.value.count} รูป ไฟล์สำรองจะมีขนาดประมาณ ${bytes(photos.value.bytes)}` : 'กำลังคำนวณ…'}
        </p>
        <div className="row">
          <button
            type="button"
            className="btn"
            disabled={!photos.value?.count}
            onClick={async () => {
              if (photos.value && photos.value.bytes > 20 * 1024 * 1024) {
                const ok = await confirm({ title: 'ไฟล์ค่อนข้างใหญ่', body: `ไฟล์สำรองรูปจะมีขนาดประมาณ ${bytes(photos.value.bytes)} ต้องการส่งออกต่อหรือไม่`, confirm: 'ส่งออก' });
                if (!ok) return;
              }
              await run(async () => downloadText(`hirono-photos-${stamp()}.json`, JSON.stringify(await createPhotoBackup(db))), 'ส่งออกรูปแล้ว');
            }}
          >
            ส่งออกรูปถ่าย
          </button>
          <label className="btn">
            นำเข้ารูปถ่าย
            <input
              ref={photoRef}
              type="file"
              accept="application/json,.json"
              hidden
              onChange={async (e) => {
                const f = e.target.files?.[0];
                if (!f) return;
                const r = await importPhotoBackup(db, await f.text());
                if (r.ok) toast(`นำเข้า ${r.value.added} รูป, ข้าม ${r.value.skipped} รูปที่มีอยู่แล้ว`);
                else toast(r.errors.join(' '), { tone: 'error' });
                setRev((x) => x + 1);
                if (photoRef.current) photoRef.current.value = '';
              }}
            />
          </label>
        </div>
      </section>

      {storage.value && (
        <p className="meta">
          พื้นที่ที่แอปใช้ในเครื่องนี้ประมาณ {bytes(storage.value.usage)} จากที่เบราว์เซอร์อนุญาต {bytes(storage.value.quota)}
        </p>
      )}
    </div>
  );
}
