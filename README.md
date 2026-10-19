# HIRONO Collection

สมุดสะสม HIRONO ส่วนตัวแบบ Local-first PWA ติดตั้งบนมือถือได้ ใช้งานออฟไลน์ได้ ไม่ต้องสมัครสมาชิก ข้อมูลส่วนตัวเก็บใน IndexedDB ของเครื่องเท่านั้น

## ใช้งาน

- เว็บไซต์: https://hayday40001-stack.github.io/hirono-collection/
- iPhone: เปิดด้วย Safari → Share → Add to Home Screen
- Android: Chrome → เมนู ⋮ → Install app

## ฟีเจอร์

- Catalog HIRONO 15 ซีรีส์ 153 รายการ ทุกรายการมีแหล่งอ้างอิงและสถานะการยืนยัน (`public/catalog/catalog.json`)
- คลังของฉัน: สถานะ ยังไม่มี / กำลังตามหา / สั่งซื้อแล้ว / มีแล้ว / ขาย-แลก, จำนวน, ราคา, สภาพ, กล่อง/การ์ด, หมายเหตุ, รูปถ่าย, รุ่นโปรด, ประวัติสถานะ
- เพิ่มหลายรายการต่อเนื่อง (Quick add), Wishlist พร้อมราคาเป้าหมายและงบรวม
- ค้นหาไทย/อังกฤษ, ตัวกรองหมวด สถานะ ปี ซีเคร็ต ราคา, Grid/List
- สถิติ, กราฟตามเวลา, รายงานความครอบคลุมของ Catalog
- Backup/Restore JSON (Merge/Replace, Preview, ย้อนการนำเข้าได้), สำรองรูปแยก, รายงาน CSV
- จัดการ Catalog: อัปเดตพร้อม Preview, เพิ่มรายการเอง, นำเข้า CSV/JSON, ตรวจรายการซ้ำ, ประวัติการแก้ไข
- Dark/Light mode, Service Worker แยก cache 5 ชั้น, แจ้งเตือนเวอร์ชันใหม่

## พัฒนา

```bash
npm install
npm run dev        # http://localhost:5173/?nosw
npm test           # unit tests (Node test runner)
npm run build      # -> dist/
npm run test:e2e   # Playwright (Chromium)
```

## Deploy (GitHub Pages)

Settings → Pages → Source: **GitHub Actions** แล้ว push เข้า `main` workflow จะทดสอบ build และ deploy ให้อัตโนมัติ

## อัปเดต Catalog

แก้ `public/catalog/catalog.json` (เพิ่ม `sources` ทุกครั้ง, เปลี่ยน `catalog_version`) → `npm run validate:catalog` → push ผู้ใช้กด “ตรวจหา Catalog ใหม่” ในแอป ข้อมูลส่วนตัวไม่ถูกแตะต้อง รายการที่ถูกถอดออกจะถูกเก็บเข้าคลัง ไม่ลบ

## ข้อจำกัดที่ทราบ

- Catalog ยังไม่ครอบคลุมทุกสินค้า (Total universe: ยังไม่ทราบ) ยังไม่มีรูปสินค้าทางการเพราะติดลิขสิทธิ์
- ข้อมูลไม่ซิงก์ข้ามเครื่อง ต้องสำรองไฟล์เอง
