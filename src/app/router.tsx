import { useEffect, useState, type AnchorHTMLAttributes, type ReactNode } from 'react';

// Hash-based routing: works on any static host (GitHub Pages subpaths
// included) and offline, because the server only ever serves index.html.

export interface Route {
  path: string;
  segments: string[];
  query: URLSearchParams;
}

function parse(): Route {
  const raw = location.hash.replace(/^#/, '') || '/';
  const [path, qs = ''] = raw.split('?');
  return { path, segments: path.split('/').filter(Boolean).map(decodeURIComponent), query: new URLSearchParams(qs) };
}

export function useRoute(): Route {
  const [route, setRoute] = useState(parse);
  useEffect(() => {
    const on = () => setRoute(parse());
    window.addEventListener('hashchange', on);
    return () => window.removeEventListener('hashchange', on);
  }, []);
  return route;
}

export function href(path: string, query?: Record<string, string | number | undefined | null>): string {
  const qs = query
    ? Object.entries(query)
        .filter(([, v]) => v !== undefined && v !== null && v !== '')
        .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`)
        .join('&')
    : '';
  return `#${path}${qs ? `?${qs}` : ''}`;
}

export function navigate(path: string, query?: Record<string, string | number | undefined | null>, replace = false) {
  const h = href(path, query);
  if (replace) history.replaceState(null, '', h);
  else location.hash = h.slice(1);
  if (replace) window.dispatchEvent(new HashChangeEvent('hashchange'));
}

export function Link({ to, children, ...rest }: { to: string; children: ReactNode } & AnchorHTMLAttributes<HTMLAnchorElement>) {
  return (
    <a href={to.startsWith('#') ? to : `#${to}`} {...rest}>
      {children}
    </a>
  );
}
