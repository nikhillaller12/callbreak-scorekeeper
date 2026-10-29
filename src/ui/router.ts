import { useSyncExternalStore } from 'react';

function getHash(): string {
  return window.location.hash.replace(/^#/, '') || '/';
}
function subscribe(cb: () => void) {
  window.addEventListener('hashchange', cb);
  return () => window.removeEventListener('hashchange', cb);
}

export interface Route {
  segments: string[];
  query: URLSearchParams;
  raw: string;
}

export function useRoute(): Route {
  const raw = useSyncExternalStore(subscribe, getHash);
  const [path, q] = raw.split('?');
  return { segments: path.split('/').filter(Boolean), query: new URLSearchParams(q ?? ''), raw };
}

export function go(path: string, replace = false) {
  if (replace) window.location.replace('#' + path);
  else window.location.hash = path;
}
