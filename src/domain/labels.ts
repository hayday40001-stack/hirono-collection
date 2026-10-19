import type {
  Category,
  CollectionStatus,
  Condition,
  EditionType,
  Presence,
  Priority,
  RosterStatus,
  SourceType,
  VerificationStatus,
} from './types.ts';

/** Thai label first, English second. Both are indexed by search. */
export const CATEGORY_LABEL: Record<Category, { th: string; en: string; short: string }> = {
  MAIN_BLIND_BOX: { th: 'ซีรีส์กล่องสุ่มหลัก', en: 'Main blind box series', short: 'ซีรีส์หลัก' },
  COLLABORATION: { th: 'คอลแลบ', en: 'Collaboration', short: 'คอลแลบ' },
  LIMITED_SPECIAL: { th: 'ลิมิเต็ดและรุ่นพิเศษ', en: 'Limited & special editions', short: 'รุ่นพิเศษ' },
  LARGE_FIGURE: { th: 'ฟิกเกอร์ขนาดใหญ่', en: 'Large figures & statues', short: 'ฟิกเกอร์ใหญ่' },
  PLUSH_ACCESSORY: { th: 'ตุ๊กตาและพวงกุญแจ', en: 'Plush & accessories', short: 'ตุ๊กตา' },
  OTHER: { th: 'ของสะสมอื่น ๆ', en: 'Other collectibles', short: 'อื่น ๆ' },
};

export const STATUS_LABEL: Record<CollectionStatus, { th: string; en: string }> = {
  NOT_OWNED: { th: 'ยังไม่มี', en: 'Not owned' },
  WISHLIST: { th: 'กำลังตามหา', en: 'Hunting' },
  ORDERED: { th: 'สั่งซื้อแล้ว', en: 'Ordered' },
  OWNED: { th: 'มีแล้ว', en: 'Owned' },
  TRADE_OR_SELL: { th: 'ขาย/แลก', en: 'For trade or sale' },
};

export const EDITION_LABEL: Record<EditionType, { th: string; en: string }> = {
  REGULAR: { th: 'รุ่นปกติ', en: 'Regular' },
  SECRET: { th: 'ซีเคร็ต', en: 'Secret' },
  SUPER_SECRET: { th: 'ซูเปอร์ซีเคร็ต', en: 'Super secret' },
  SPECIAL: { th: 'รุ่นพิเศษ', en: 'Special edition' },
  SINGLE: { th: 'ชิ้นเดี่ยว', en: 'Single release' },
};

export const VERIFICATION_LABEL: Record<VerificationStatus, { th: string; en: string; hint: string }> = {
  VERIFIED_OFFICIAL: { th: 'ยืนยันจากแหล่งทางการ', en: 'Verified · official', hint: 'ข้อมูลตรงกับหน้าสินค้าหรือประกาศของ POP MART' },
  VERIFIED_CROSS_REFERENCED: { th: 'ยืนยันข้ามแหล่ง', en: 'Cross-referenced', hint: 'ตรวจสอบจากหลายแหล่งที่น่าเชื่อถือ บางส่วนไม่ได้มาจากแหล่งทางการ' },
  UNVERIFIED: { th: 'ยังไม่ยืนยัน', en: 'Unverified', hint: 'ยังไม่พบแหล่งทางการ ข้อมูลอาจไม่ถูกต้อง' },
  NEEDS_REVIEW: { th: 'รอตรวจสอบ', en: 'Needs review', hint: 'มีข้อมูลขัดแย้งกัน ต้องตรวจสอบเพิ่ม' },
};

export const ROSTER_LABEL: Record<RosterStatus, string> = {
  COMPLETE: 'รายชื่อรุ่นครบตามแหล่งอ้างอิง',
  PARTIAL: 'รายชื่อรุ่นยังไม่ครบ',
  UNKNOWN: 'ยังไม่ทราบรายชื่อรุ่น',
};

export const SOURCE_TYPE_LABEL: Record<SourceType, string> = {
  OFFICIAL_POPMART: 'POP MART ทางการ',
  BRAND_ANNOUNCEMENT: 'ประกาศของแบรนด์',
  ARTIST: 'ศิลปิน',
  COLLECTOR_REFERENCE: 'แหล่งข้อมูลนักสะสม',
  SECONDARY: 'แหล่งรอง (ต้องตรวจเพิ่ม)',
  USER: 'บันทึกโดยผู้ใช้',
};

export const CONDITION_LABEL: Record<Condition, string> = {
  NEW_SEALED: 'ใหม่ ยังไม่แกะซอง',
  OPENED_MINT: 'แกะแล้ว สภาพสมบูรณ์',
  GOOD: 'สภาพดี',
  FAIR: 'มีตำหนิเล็กน้อย',
  DAMAGED: 'ชำรุด',
};

export const PRESENCE_LABEL: Record<Presence, string> = { UNKNOWN: 'ไม่ระบุ', YES: 'มี', NO: 'ไม่มี' };

export const PRIORITY_LABEL: Record<Priority, string> = { 1: 'สำคัญมาก', 2: 'ปานกลาง', 3: 'ไม่รีบ' };
