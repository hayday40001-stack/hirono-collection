import { Component, useEffect, useState, type ReactNode } from 'react';

/** Keeps a rendering bug on one page from blanking the whole app. Data is never touched. */
class PageBoundary extends Component<{ children: ReactNode; resetKey: string }, { error: string | null }> {
  state = { error: null as string | null };
  static getDerivedStateFromError(e: unknown) {
    return { error: e instanceof Error ? e.message : String(e) };
  }
  componentDidUpdate(prev: { resetKey: string }) {
    if (prev.resetKey !== this.props.resetKey && this.state.error) this.setState({ error: null });
  }
  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="empty" role="alert">
        <h1>หน้านี้แสดงผลไม่สำเร็จ</h1>
        <p className="meta">ข้อมูลของคุณยังอยู่ครบ ลองกลับไปหน้าแรก หรือโหลดหน้าใหม่ ({this.state.error})</p>
        <a className="btn" href="#/">
          กลับหน้าแรก
        </a>
      </div>
    );
  }
}
import { AppProvider, useApp } from './app/context.tsx';
import { href, useRoute } from './app/router.tsx';
import { applyUpdate, onPwaState } from './app/pwa.ts';
import { ConfirmProvider, ToastProvider } from './components/ui.tsx';
import { PhotoIndexProvider } from './components/ItemTag.tsx';
import { IconExplore, IconHeart, IconHome, IconMore, IconTag } from './components/icons.tsx';
import { Home } from './pages/Home.tsx';
import { Explore } from './pages/Explore.tsx';
import { SeriesDetail } from './pages/SeriesDetail.tsx';
import { ItemDetail } from './pages/ItemDetail.tsx';
import { Collection } from './pages/Collection.tsx';
import { Wishlist } from './pages/Wishlist.tsx';
import { Coverage, Stats } from './pages/Stats.tsx';
import { Backup } from './pages/Backup.tsx';
import { CatalogAdmin } from './pages/CatalogAdmin.tsx';
import { About, Install, More, Profile } from './pages/More.tsx';

const NAV: { to: string; label: string; icon: (p: { width?: number }) => ReactNode; match: (p: string) => boolean }[] = [
  { to: '/', label: 'หน้าแรก', icon: IconHome, match: (p) => p === '/' },
  { to: '/explore', label: 'สำรวจ', icon: IconExplore, match: (p) => p.startsWith('/explore') || p.startsWith('/series') || p.startsWith('/item') },
  { to: '/collection', label: 'คลังของฉัน', icon: IconTag, match: (p) => p.startsWith('/collection') },
  { to: '/wishlist', label: 'ตามหา', icon: IconHeart, match: (p) => p.startsWith('/wishlist') },
  { to: '/more', label: 'เพิ่มเติม', icon: IconMore, match: (p) => ['/more', '/stats', '/backup', '/profile', '/catalog', '/coverage', '/install', '/about'].some((x) => p.startsWith(x)) },
];

function Page() {
  const { path, segments } = useRoute();
  useEffect(() => window.scrollTo(0, 0), [path]);
  const [head, id] = segments;
  switch (head) {
    case undefined:
      return <Home />;
    case 'explore':
      return <Explore />;
    case 'series':
      return <SeriesDetail id={id} />;
    case 'item':
      return <ItemDetail id={id} />;
    case 'collection':
      return <Collection />;
    case 'wishlist':
      return <Wishlist />;
    case 'stats':
      return <Stats />;
    case 'coverage':
      return <Coverage />;
    case 'backup':
      return <Backup />;
    case 'catalog':
      return <CatalogAdmin />;
    case 'profile':
      return <Profile />;
    case 'install':
      return <Install />;
    case 'about':
      return <About />;
    case 'more':
      return <More />;
    default:
      return (
        <div className="empty">
          <h1>ไม่พบหน้านี้</h1>
          <a className="btn" href={href('/')}>
            กลับหน้าแรก
          </a>
        </div>
      );
  }
}

function Theme() {
  const { data } = useApp();
  useEffect(() => {
    const root = document.documentElement;
    if (data.settings.theme === 'system') root.removeAttribute('data-theme');
    else root.setAttribute('data-theme', data.settings.theme);
    const dark = data.settings.theme === 'dark' || (data.settings.theme === 'system' && matchMedia('(prefers-color-scheme: dark)').matches);
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', dark ? '#1e1c1a' : '#f1ede4');
  }, [data.settings.theme]);
  return null;
}

function UpdateBanner() {
  const [s, setS] = useState({ updateReady: false, offlineReady: false });
  useEffect(() => onPwaState(setS), []);
  if (!s.updateReady) return null;
  return (
    <div className="update-banner" role="status">
      <span>มีแอปเวอร์ชันใหม่ ข้อมูลของคุณจะอยู่ครบ</span>
      <button type="button" className="btn small" onClick={applyUpdate}>
        อัปเดตตอนนี้
      </button>
    </div>
  );
}

function CatalogMissing() {
  const { catalogError, retryCatalog, data } = useApp();
  if (data.meta || !catalogError) return null;
  return (
    <div className="notice danger" role="alert" style={{ marginBottom: 24 }}>
      <strong>Catalog ยังไม่พร้อมใช้งานแบบออฟไลน์</strong>
      <span>{catalogError} เชื่อมต่ออินเทอร์เน็ตแล้วลองอีกครั้ง หรือนำเข้าไฟล์ Catalog ที่หน้า “จัดการ Catalog”</span>
      <button type="button" className="btn small" style={{ justifySelf: 'start' }} onClick={() => void retryCatalog()}>
        ลองอีกครั้ง
      </button>
    </div>
  );
}

function Shell() {
  const { path } = useRoute();
  return (
    <div className="shell">
      <nav className="nav" aria-label="เมนูหลัก">
        <a className="brand" href={href('/')}>
          HIRONO Collection
          <small>สมุดสะสมส่วนตัว</small>
        </a>
        {NAV.map((n) => (
          <a key={n.to} href={href(n.to)} aria-current={n.match(path) ? 'page' : undefined}>
            <n.icon />
            <span>{n.label}</span>
          </a>
        ))}
      </nav>
      <div>
        <UpdateBanner />
        <main className="main" id="main">
          <CatalogMissing />
          <PageBoundary resetKey={path}>
            <Page />
          </PageBoundary>
        </main>
      </div>
    </div>
  );
}

export function App() {
  return (
    <ToastProvider>
      <AppProvider
        fallback={(boot, retry) =>
          boot.phase === 'error' ? (
            <div className="boot" role="alert">
              <h1>เปิดฐานข้อมูลไม่สำเร็จ</h1>
              <p>{boot.message}</p>
              <p className="meta">ข้อมูลของคุณยังไม่ถูกแก้ไข ลองปิดแท็บอื่นของแอปนี้แล้วกดลองอีกครั้ง</p>
              <button type="button" className="btn primary" onClick={retry}>
                ลองอีกครั้ง
              </button>
            </div>
          ) : (
            <div className="boot" aria-busy="true">
              <div className="skeleton" style={{ height: 40, width: 260 }} />
              <div className="skeleton" style={{ height: 18, width: 200 }} />
              <span className="sr-only">กำลังเปิดคลังสะสม</span>
            </div>
          )
        }
      >
        <ConfirmProvider>
          <PhotoIndexProvider>
            <Theme />
            <Shell />
          </PhotoIndexProvider>
        </ConfirmProvider>
      </AppProvider>
    </ToastProvider>
  );
}
