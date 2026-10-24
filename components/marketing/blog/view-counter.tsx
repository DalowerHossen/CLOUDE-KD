// path: components/marketing/blog/view-counter.tsx
'use client';
import { useEffect } from 'react';

/** Counts one view of a post. No cookie and no visitor data is involved. */
export function ViewCounter({ slug }: { slug: string }): null {
  useEffect(() => {
    const key = `kd_blog_view_${slug}`;
    try {
      if (window.sessionStorage.getItem(key)) return;
      window.sessionStorage.setItem(key, '1');
    } catch {
      return;
    }
    void fetch('/api/public-site/blog/view', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ slug }),
      keepalive: true,
    }).catch(() => undefined);
  }, [slug]);
  return null;
}
