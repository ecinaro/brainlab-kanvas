import { useEffect, useState } from 'react';

export type Route = { view: 'projects' } | { view: 'canvas'; projectId: string };

export function parseRoute(hash: string): Route {
  const m = hash.match(/^#\/p\/([a-zA-Z0-9_-]{1,64})$/);
  return m ? { view: 'canvas', projectId: m[1] } : { view: 'projects' };
}

export function goProject(id: string) {
  location.hash = `#/p/${id}`;
}

export function goProjects() {
  location.hash = '#/';
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
