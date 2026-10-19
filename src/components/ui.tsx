import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { IconBox, IconClose } from './icons.tsx';

// ---------- toast ----------
interface Toast {
  id: number;
  text: string;
  tone: 'info' | 'error';
  action?: { label: string; run: () => void };
}
const ToastCtx = createContext<(text: string, opts?: { tone?: 'info' | 'error'; action?: Toast['action'] }) => void>(() => {});
export const useToast = () => useContext(ToastCtx);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const seq = useRef(0);
  const push = useCallback((text: string, opts: { tone?: 'info' | 'error'; action?: Toast['action'] } = {}) => {
    const id = ++seq.current;
    setToasts((t) => [...t.slice(-2), { id, text, tone: opts.tone ?? 'info', action: opts.action }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), opts.action ? 6000 : 3200);
  }, []);
  return (
    <ToastCtx.Provider value={push}>
      {children}
      <div className="toast-host" role="status" aria-live="polite">
        {toasts.map((t) => (
          <div key={t.id} className={`toast ${t.tone === 'error' ? 'error' : ''}`}>
            <span>{t.text}</span>
            {t.action && (
              <button
                type="button"
                onClick={() => {
                  t.action!.run();
                  setToasts((x) => x.filter((y) => y.id !== t.id));
                }}
              >
                {t.action.label}
              </button>
            )}
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  );
}

/** Wraps an async action: shows the error message as a toast instead of failing silently. */
export function useAction() {
  const toast = useToast();
  return useCallback(
    async <T,>(fn: () => Promise<T>, success?: string): Promise<T | undefined> => {
      try {
        const r = await fn();
        if (success) toast(success);
        return r;
      } catch (e) {
        toast(e instanceof Error ? e.message : String(e), { tone: 'error' });
        return undefined;
      }
    },
    [toast],
  );
}

// ---------- sheet (modal dialog) ----------
export function Sheet({ open, onClose, title, children, labelledBy }: { open: boolean; onClose: () => void; title: ReactNode; children: ReactNode; labelledBy?: string }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);
  const id = labelledBy ?? 'sheet-title';
  return (
    <dialog
      ref={ref}
      className="sheet"
      aria-labelledby={id}
      onClose={onClose}
      onClick={(e) => {
        if (e.target === ref.current) onClose();
      }}
    >
      {open && (
        <div className="sheet-inner">
          <div className="sheet-head">
            <h2 id={id}>{title}</h2>
            <button type="button" className="btn icon quiet" onClick={onClose} aria-label="ปิด">
              <IconClose />
            </button>
          </div>
          {children}
        </div>
      )}
    </dialog>
  );
}

// ---------- confirm ----------
interface ConfirmOpts {
  title: string;
  body: ReactNode;
  confirm: string;
  danger?: boolean;
}
const ConfirmCtx = createContext<(o: ConfirmOpts) => Promise<boolean>>(async () => false);
export const useConfirm = () => useContext(ConfirmCtx);

export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<(ConfirmOpts & { resolve: (v: boolean) => void }) | null>(null);
  const ask = useCallback((o: ConfirmOpts) => new Promise<boolean>((resolve) => setState({ ...o, resolve })), []);
  const done = (v: boolean) => {
    state?.resolve(v);
    setState(null);
  };
  return (
    <ConfirmCtx.Provider value={ask}>
      {children}
      <Sheet open={!!state} onClose={() => done(false)} title={state?.title ?? ''} labelledBy="confirm-title">
        <div className="lede" style={{ fontSize: 'var(--t-md)' }}>
          {state?.body}
        </div>
        <div className="row">
          <button type="button" className={`btn ${state?.danger ? 'danger solid' : 'primary'}`} onClick={() => done(true)}>
            {state?.confirm}
          </button>
          <button type="button" className="btn" onClick={() => done(false)}>
            ยกเลิก
          </button>
        </div>
      </Sheet>
    </ConfirmCtx.Provider>
  );
}

// ---------- misc ----------
export function Empty({ title, children, action }: { title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="empty fade-in">
      <IconBox />
      <h3>{title}</h3>
      {children && <p className="meta">{children}</p>}
      {action}
    </div>
  );
}

export function Bar({ value, label }: { value: number; label: string }) {
  const pct = Math.max(0, Math.min(1, value)) * 100;
  return (
    <div className="bar" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(pct)} aria-label={label}>
      <span style={{ width: `${pct}%` }} />
    </div>
  );
}

export function SkeletonTags({ n = 6 }: { n?: number }) {
  return (
    <div className="tags" aria-hidden>
      {Array.from({ length: n }, (_, i) => (
        <div key={i} className="skeleton" style={{ aspectRatio: '4 / 6.2' }} />
      ))}
    </div>
  );
}

export function useObjectUrl(blob: Blob | null | undefined): string | null {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    if (!blob) {
      setUrl(null);
      return;
    }
    const u = URL.createObjectURL(blob);
    setUrl(u);
    return () => URL.revokeObjectURL(u);
  }, [blob]);
  return url;
}

export function useAsync<T>(fn: () => Promise<T>, deps: unknown[]): { value: T | undefined; loading: boolean; error: string | null; reload: () => void } {
  const [state, setState] = useState<{ value: T | undefined; loading: boolean; error: string | null }>({ value: undefined, loading: true, error: null });
  const [tick, setTick] = useState(0);
  useEffect(() => {
    let alive = true;
    setState((s) => ({ ...s, loading: true }));
    fn().then(
      (value) => alive && setState({ value, loading: false, error: null }),
      (e) => alive && setState({ value: undefined, loading: false, error: e instanceof Error ? e.message : String(e) }),
    );
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, tick]);
  return { ...state, reload: () => setTick((t) => t + 1) };
}

export function Lightbox({ src, alt, onClose }: { src: string; alt: string; onClose: () => void }) {
  useEffect(() => {
    const k = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [onClose]);
  return (
    <div className="lightbox" role="dialog" aria-modal="true" aria-label={alt} onClick={onClose}>
      <img src={src} alt={alt} />
      <button type="button" className="btn icon close" onClick={onClose} aria-label="ปิดภาพ" autoFocus>
        <IconClose />
      </button>
    </div>
  );
}
