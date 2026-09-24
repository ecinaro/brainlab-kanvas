import { useEffect, useState } from 'react';

export type Route = { view: 'projects' } | { view: 'gallery' } | { view: 'canvas'; projectId: string };

export function parseRoute(hash: string): Route {
  if (hash === '#/galeri') return { view: 'gallery' };
  const m = hash.match(/^#\/p\/([a-zA-Z0-9_-]{1,64})$/);
  return m ? { view: 'canvas', projectId: m[1] } : { view: 'projects' };
}

export function goProject(id: string) {
  location.hash = `#/p/${id}`;
}

export function goProjects() {
  location.hash = '#/';
}

export function goGallery() {
  location.hash = '#/galeri';
}

export function useRoute(): Route {
  const [route, setRoute] = useState(() => parseRoute(location.hash));
  useEffect(() => {
    const on = () => setRoute(parseRoute(location.hash));
    window.addEventListener('hashchange', on);
    return () => window.removeEventListener('hashchange', on);
  }, []);
  return route;
}

/** Galeriden bir projeye eklenecek üretim; proje açılınca kanvasa yerleştirilir. */
const PENDING_KEY = 'blk-pending-insert';

export function setPendingInsert(projectId: string, generation: unknown) {
  sessionStorage.setItem(PENDING_KEY, JSON.stringify({ projectId, generation }));
}

export function takePendingInsert(projectId: string): unknown | null {
  const raw = sessionStorage.getItem(PENDING_KEY);
  if (!raw) return null;
  try {
    const p = JSON.parse(raw);
    if (p.projectId !== projectId) return null;
    sessionStorage.removeItem(PENDING_KEY);
    return p.generation;
  } catch {
    sessionStorage.removeItem(PENDING_KEY);
    return null;
  }
}
