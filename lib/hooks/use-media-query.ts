// path: lib/hooks/use-media-query.ts
'use client';

import { useSyncExternalStore } from 'react';

/** Subscribes to a CSS media query, for example "(min-width: 768px)". Server render assumes false. */
export function useMediaQuery(query: string): boolean {
  return useSyncExternalStore(
    (callback) => {
      const list = window.matchMedia(query);
      list.addEventListener('change', callback);
      return () => list.removeEventListener('change', callback);
    },
    () => window.matchMedia(query).matches,
    () => false,
  );
}
