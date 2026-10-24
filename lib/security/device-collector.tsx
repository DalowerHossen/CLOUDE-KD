// path: lib/security/device-collector.tsx
'use client';
import { useEffect } from 'react';
import { usePathname } from 'next/navigation';
import { isFingerprintExcluded } from './signals';

const SENT_KEY = 'kd.device.sent';

async function sha256Hex(text: string): Promise<string> {
  const bytes = new TextEncoder().encode(text);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Sends a coarse browser fingerprint (time zone, language, screen size, platform, core count) once per browser session.
 * It does not run on payment, card or password pages and it never listens to keyboard events.
 */
export function DeviceCollector(): null {
  const pathname = usePathname();
  useEffect(() => {
    if (isFingerprintExcluded(pathname)) return;
    try {
      if (window.sessionStorage.getItem(SENT_KEY) === '1') return;
    } catch {
      return;
    }
    const nav = window.navigator;
    const parts = [
      Intl.DateTimeFormat().resolvedOptions().timeZone,
      nav.language,
      `${window.screen.width}x${window.screen.height}x${window.screen.colorDepth}`,
      nav.platform,
      String(nav.hardwareConcurrency ?? 0),
    ];
    void sha256Hex(parts.join('|'))
      .then((fingerprint) =>
        fetch('/api/security/device', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ fingerprint }),
        }),
      )
      .then((response) => {
        if (response.ok) window.sessionStorage.setItem(SENT_KEY, '1');
      })
      .catch(() => undefined);
  }, [pathname]);
  return null;
}
