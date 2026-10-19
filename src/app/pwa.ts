// Service worker registration + update flow. A new version installs in the
// background and waits; the app shows a banner and only switches when the
// user taps "Update", so a page never runs half-old, half-new code. Personal
// data lives in IndexedDB, which service worker updates never touch.

type Listener = (state: { updateReady: boolean; offlineReady: boolean }) => void;
let waiting: ServiceWorker | null = null;
let offlineReady = false;
const listeners = new Set<Listener>();
const emit = () => listeners.forEach((l) => l({ updateReady: !!waiting, offlineReady }));

export function onPwaState(l: Listener): () => void {
  listeners.add(l);
  l({ updateReady: !!waiting, offlineReady });
  return () => listeners.delete(l);
}

export function applyUpdate() {
  if (!waiting) return;
  waiting.postMessage({ type: 'SKIP_WAITING' });
}

export async function registerServiceWorker() {
  if (!('serviceWorker' in navigator) || location.protocol === 'file:') return;
  if (location.hostname === 'localhost' && new URLSearchParams(location.search).has('nosw')) return;
  try {
    const reg = await navigator.serviceWorker.register('./sw.js', { scope: './' });
    const track = (sw: ServiceWorker | null) => {
      if (!sw) return;
      sw.addEventListener('statechange', () => {
        if (sw.state === 'installed') {
          if (navigator.serviceWorker.controller) waiting = sw;
          else offlineReady = true;
          emit();
        }
      });
    };
    if (reg.waiting && navigator.serviceWorker.controller) {
      waiting = reg.waiting;
      emit();
    }
    if (reg.active && !reg.waiting) {
      offlineReady = true;
      emit();
    }
    reg.addEventListener('updatefound', () => track(reg.installing));
    let reloading = false;
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (reloading || !waiting) return;
      reloading = true;
      location.reload();
    });
    // Check for a new version when the app comes back to the foreground, at most every 30 minutes.
    let last = Date.now();
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible' && Date.now() - last > 30 * 60 * 1000) {
        last = Date.now();
        void reg.update().catch(() => undefined);
      }
    });
  } catch (e) {
    console.warn('Service worker registration failed', e);
  }
}
