// path: components/marketing/tracking-loader.tsx
'use client';
import { useEffect, useSyncExternalStore } from 'react';
import { usePathname } from 'next/navigation';
import { PRIVATE_PREFIXES } from '@/config/seo';
import { consentFromCookieString, serializeConsent } from '@/lib/analytics/consent';
import { activeProviders, type PixelSettings } from '@/lib/analytics/providers';
import { startProvider, trackConversion } from '@/lib/analytics/start-provider';

const CHANGED = 'kd:consent-changed';

function subscribe(onChange: () => void): () => void {
  window.addEventListener(CHANGED, onChange);
  return () => window.removeEventListener(CHANGED, onChange);
}
const readRaw = (): string => {
  const c = consentFromCookieString(document.cookie);
  return c ? serializeConsent(c) : '';
};

/**
 * Starts the tracking providers the visitor allowed. It is mounted only by the public layout, and it refuses to run
 * on any address that belongs to the product, sign-in, payments, the client portal or administration.
 * It also counts the visit in the first-party counter, which uses no cookie and stores no visitor data.
 */
export function TrackingLoader({ pixels }: { pixels: PixelSettings }): null {
  const pathname = usePathname();
  const raw = useSyncExternalStore(subscribe, readRaw, () => '');
  const isPrivate = PRIVATE_PREFIXES.some((p) => pathname === p || pathname.startsWith(p));

  useEffect(() => {
    if (isPrivate) return;
    void fetch('/api/public-site/hit', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ path: pathname, event: 'page_view' }),
      keepalive: true,
    }).catch(() => undefined);
  }, [pathname, isPrivate]);

  useEffect(() => {
    if (isPrivate || raw === '') return;
    const consent = consentFromCookieString(document.cookie);
    for (const key of activeProviders(pixels, consent)) startProvider(key, pixels[key]);
  }, [raw, pixels, isPrivate]);

  useEffect(() => {
    if (isPrivate) return;
    const onClick = (event: MouseEvent): void => {
      const link = (event.target as Element | null)?.closest('a[href="/signup"]');
      if (link) trackConversion('signup_click');
    };
    document.addEventListener('click', onClick);
    return () => document.removeEventListener('click', onClick);
  }, [isPrivate]);

  return null;
}
