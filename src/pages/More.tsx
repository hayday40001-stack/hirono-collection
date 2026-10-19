import { useState } from 'react';
import { APP_VERSION, useApp } from '../app/context.tsx';
import { compressImage, downloadText, stamp } from '../app/format.ts';
import { href } from '../app/router.tsx';
import { useAction, useToast } from '../components/ui.tsx';
import { IconChevron } from '../components/icons.tsx';
import { BackLink } from './shared.tsx';
import { buildShareHtml } from '../services/share.ts';

export function More() {
  const { data } = useApp();
  const links: [string, string, string][] = [
    ['/stats', 'สถิติการสะสม', 'ความคืบหน้า ค่าใช้จ่าย กราฟตามเวลา'],
    ['/backup', 'สำรองและกู้คืนข้อมูล', data.settings.last_backup_at ? 'ส่งออก นำเข้า และสำรองรูปถ่าย' : 'ยังไม่เคยสำรองข้อมูล'],
    ['/profile', 'โปรไฟล์และการแสดงผล', 'ชื่อ รูป ธีม การซ่อนมูลค่า แชร์คลัง'],
    ['/catalog', 'จัดการ Catalog', 'อัปเดต เพิ่มรายการ นำเข้า CSV ตรวจรายการซ้ำ'],
    ['/coverage', 'ความครอบคลุมของ Catalog', 'ข้อมูลไหนยืนยันแล้ว ข้อมูลไหนยังขาด'],
    ['/install', 'ติดตั้งบนหน้าจอโฮม', 'iPhone, Android และคอมพิวเตอร์'],
    ['/about', 'ความเป็นส่วนตัวและข้อมูล', 'ข้อมูลของคุณอยู่ที่ไหน'],
  ];
  return (
    <div className="page">
      <h1>เพิ่มเติม</h1>
      <nav className="menu" aria-label="เมนูเพิ่มเติม">
        {links.map(([to, title, sub]) => (
          <a key={to} href={href(to)}>
            <span>
              <span>{title}</span>
              <small>{sub}</small>
            </span>
            <IconChevron width={18} height={18} />
          </a>
        ))}
      </nav>
      <p className="meta">
        HIRONO Collection {APP_VERSION}, Catalog {data.meta?.catalog_version ?? '—'}. แอปนี้ไม่ได้เป็นของหรือได้รับการรับรองจาก POP MART
      </p>
    </div>
  );
}

export function Profile() {
  const { data, repos } = useApp();
  const run = useAction();
  const s = data.settings;
  const [name, setName] = useState(s.profile.display_name);
  const [bio, setBio] = useState(s.profile.bio);
  const saveProfile = () => run(() => repos.settings.update({ profile: { ...s.profile, display_name: name.trim().slice(0, 80), bio: bio.trim().slice(0, 1000) } }), 'บันทึกโปรไฟล์แล้ว');
  return (
    <div className="page">
      <BackLink />
      <h1>โปรไฟล์และการแสดงผล</h1>
      <form
        className="panel form-grid"
        onSubmit={(e) => {
          e.preventDefault();
          void saveProfile();
        }}
      >
        <div className="row">
          {s.profile.avatar_data_url ? (
            <img src={s.profile.avatar_data_url} alt="รูปโปรไฟล์" width={72} height={72} style={{ borderRadius: '50%', objectFit: 'cover' }} />
          ) : (
            <span className="thumb" style={{ width: 72, borderRadius: '50%', aspectRatio: '1' }} aria-hidden>
              {(name || 'H').slice(0, 1)}
            </span>
          )}
          <label className="btn small">
            เปลี่ยนรูป
            <input
              type="file"
              accept="image/*"
              hidden
              onChange={async (e) => {
                const f = e.target.files?.[0];
                if (!f) return;
                await run(async () => {
                  const img = await compressImage(f, 256, 0.8);
                  const dataUrl = await new Promise<string>((res) => {
                    const r = new FileReader();
                    r.onload = () => res(String(r.result));
                    r.readAsDataURL(img.blob);
                  });
                  await repos.settings.update({ profile: { ...s.profile, avatar_data_url: dataUrl } });
                }, 'เปลี่ยนรูปโปรไฟล์แล้ว');
              }}
            />
          </label>
          {s.profile.avatar_data_url && (
            <button type="button" className="btn small quiet" onClick={() => run(() => repos.settings.update({ profile: { ...s.profile, avatar_data_url: null } }))}>
              ลบรูป
            </button>
          )}
        </div>
        <label className="field">
          <span>ชื่อที่แสดง</span>
          <input className="input" maxLength={80} value={name} onChange={(e) => setName(e.target.value)} />
        </label>
        <label className="field">
          <span>แนะนำตัว</span>
          <textarea className="textarea" maxLength={1000} value={bio} onChange={(e) => setBio(e.target.value)} />
        </label>
        <button type="submit" className="btn primary" style={{ justifySelf: 'start' }}>
          บันทึกโปรไฟล์
        </button>
      </form>

      <section className="section">
        <h2>การแสดงผล</h2>
        <div className="form-grid two">
          <label className="field">
            <span>ธีม</span>
            <select className="select" value={s.theme} onChange={(e) => run(() => repos.settings.update({ theme: e.target.value as typeof s.theme }))}>
              <option value="system">ตามระบบ</option>
              <option value="light">สว่าง</option>
              <option value="dark">มืด</option>
            </select>
          </label>
          <label className="field">
            <span>สกุลเงิน</span>
            <select className="select" value={s.display_currency} onChange={(e) => run(() => repos.settings.update({ display_currency: e.target.value }))}>
              {['THB', 'USD', 'JPY', 'CNY', 'HKD', 'SGD', 'MYR', 'EUR', 'GBP', 'KRW'].map((c) => (
                <option key={c}>{c}</option>
              ))}
            </select>
          </label>
        </div>
        <label className="check">
          <input type="checkbox" checked={s.hide_values} onChange={(e) => run(() => repos.settings.update({ hide_values: e.target.checked }))} />
          ซ่อนราคาและมูลค่าบนหน้าจอ (เช่น เวลาให้คนอื่นดูเครื่อง)
        </label>
      </section>

      <section className="section">
        <h2>แชร์คลังให้คนอื่นดู</h2>
        <p className="meta">
          แอปนี้ไม่มีเซิร์ฟเวอร์ คลังของคุณจึงเป็นส่วนตัวเสมอ ถ้าต้องการแชร์ ให้สร้างหน้าเว็บแบบอ่านอย่างเดียว (ไฟล์ HTML ไฟล์เดียว) แล้วส่งให้คนอื่นเปิดดู คนที่ได้ไฟล์ไปแก้ไขคลังของคุณไม่ได้
        </p>
        <ShareExport />
      </section>
    </div>
  );
}

function ShareExport() {
  const { data } = useApp();
  const toast = useToast();
  const [prices, setPrices] = useState(false);
  const [notes, setNotes] = useState(false);
  return (
    <div className="panel">
      <label className="check">
        <input type="checkbox" checked={prices} onChange={(e) => setPrices(e.target.checked)} /> รวมราคาที่ซื้อและมูลค่า
      </label>
      <label className="check">
        <input type="checkbox" checked={notes} onChange={(e) => setNotes(e.target.checked)} /> รวมหมายเหตุส่วนตัว
      </label>
      <button
        type="button"
        className="btn"
        style={{ justifySelf: 'start' }}
        onClick={() => {
          downloadText(`hirono-collection-${stamp()}.html`, buildShareHtml(data, { prices, notes }), 'text/html');
          toast('สร้างหน้าแชร์แล้ว');
        }}
      >
        สร้างหน้าแชร์ (HTML)
      </button>
    </div>
  );
}

export function Install() {
  return (
    <div className="page">
      <BackLink />
      <h1>ติดตั้งบนหน้าจอโฮม</h1>
      <p className="lede">ติดตั้งแล้วเปิดได้เหมือนแอป ใช้งานออฟไลน์ได้ และข้อมูลอยู่ในเครื่องเหมือนเดิม</p>
      <section className="section">
        <h2>iPhone และ iPad</h2>
        <ol>
          <li>เปิดเว็บไซต์นี้ด้วย Safari</li>
          <li>กดปุ่ม Share (สี่เหลี่ยมมีลูกศรชี้ขึ้น)</li>
          <li>เลือก Add to Home Screen (เพิ่มไปยังหน้าจอโฮม)</li>
          <li>เปิดใช้งานจากไอคอนบนหน้าจอ</li>
        </ol>
        <p className="meta">บน iPhone ข้อมูลของแอปที่ติดตั้งกับข้อมูลใน Safari แยกกัน ถ้าเคยบันทึกใน Safari มาก่อน ให้สำรองจาก Safari แล้วนำเข้าในแอปที่ติดตั้ง</p>
      </section>
      <section className="section">
        <h2>Android</h2>
        <ol>
          <li>เปิดเว็บไซต์นี้ด้วย Chrome</li>
          <li>กดเมนู ⋮ แล้วเลือก Install app หรือ Add to Home screen</li>
        </ol>
      </section>
      <section className="section">
        <h2>คอมพิวเตอร์</h2>
        <p>ใน Chrome หรือ Edge กดไอคอนติดตั้งที่แถบที่อยู่ หรือเมนู แล้วเลือกติดตั้ง HIRONO Collection</p>
      </section>
    </div>
  );
}

export function About() {
  return (
    <div className="page">
      <BackLink />
      <h1>ความเป็นส่วนตัวและข้อมูล</h1>
      <section className="section">
        <h2>ข้อมูลของคุณอยู่ที่ไหน</h2>
        <p>คลัง Wishlist รูปถ่าย และโปรไฟล์ เก็บใน IndexedDB ของเบราว์เซอร์ในเครื่องนี้ แอปไม่มีระบบบัญชี ไม่มีเซิร์ฟเวอร์เก็บข้อมูล และไม่มี Analytics</p>
        <p>สิ่งที่แอปดาวน์โหลดจากอินเทอร์เน็ตมีเพียงไฟล์ของแอป ไฟล์ Catalog และฟอนต์ ไม่มีการส่งข้อมูลส่วนตัวออกไป</p>
        <p className="meta">ข้อจำกัด: ข้อมูลไม่ซิงก์ข้ามอุปกรณ์ ถ้าล้างข้อมูลเว็บไซต์ในเบราว์เซอร์ ข้อมูลจะหาย และบางเบราว์เซอร์ (โดยเฉพาะ Safari) อาจลบข้อมูลของเว็บที่ไม่ได้เปิดนาน ๆ จึงควรสำรองเป็นไฟล์เป็นระยะ</p>
      </section>
      <section className="section">
        <h2>ข้อมูล Catalog มาจากไหน</h2>
        <p>
          ทุกรายการมีแหล่งอ้างอิงและสถานะการยืนยัน รายการที่ไม่พบแหล่งทางการจะแสดงเป็น “ยังไม่ยืนยัน” และไม่ถูกนับในเปอร์เซ็นต์ความคืบหน้า Catalog ไม่ได้อ้างว่าครอบคลุม HIRONO ทุกชิ้น ดูรายละเอียดได้ที่{' '}
          <a href={href('/coverage')}>รายงานความครอบคลุม</a>
        </p>
        <p className="meta">Catalog ยังไม่มีรูปสินค้า เพราะรูปจากเว็บไซต์ทางการเป็นลิขสิทธิ์ของ POP MART คุณเพิ่มรูปถ่ายของตัวเองได้ในหน้าของแต่ละรุ่น</p>
        <p className="meta">HIRONO และ POP MART เป็นเครื่องหมายของเจ้าของสิทธิ์ แอปนี้เป็นเครื่องมือของนักสะสม ไม่เกี่ยวข้องกับ POP MART</p>
      </section>
    </div>
  );
}
