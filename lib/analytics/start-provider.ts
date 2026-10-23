// path: lib/analytics/start-provider.ts
// Starts one tracking provider in the browser. Called only after the visitor allowed the provider's category and
// only on public pages (see components/marketing/tracking-loader.tsx). Each provider is started once per page load.
import { PROVIDERS, type PixelKey } from './providers';

type Fn = (...args: unknown[]) => void;
interface Queued extends Fn {
  queue?: unknown[];
  push?: unknown;
  loaded?: boolean;
  version?: string;
  callMethod?: Fn;
  exe?: Fn;
}
type Win = Window & Record<string, unknown>;

const started = new Set<string>();

/** gtag.js reads the arguments object itself, so the queue must receive exactly that (an array is not recognized). */
function gtagFor(layer: unknown[]): Fn {
  return function gtag(): void {
    // eslint-disable-next-line prefer-rest-params
    layer.push(arguments);
  };
}

function load(src: string, nonce: string | undefined): void {
  const el = document.createElement('script');
  el.async = true;
  el.src = src;
  if (nonce) el.nonce = nonce;
  document.head.appendChild(el);
}

function stub(w: Win, name: string, make: () => Queued): Queued {
  const existing = w[name] as Queued | undefined;
  if (existing) return existing;
  const fn = make();
  w[name] = fn;
  return fn;
}

export function startProvider(key: PixelKey, id: string, nonce?: string): void {
  if (typeof window === 'undefined' || started.has(key) || !PROVIDERS[key].pattern.test(id)) return;
  started.add(key);
  const w = window as unknown as Win;
  const enc = encodeURIComponent(id);
  switch (key) {
    case 'ga4': {
      const layer = (w.dataLayer as unknown[] | undefined) ?? [];
      w.dataLayer = layer;
      const gtag = gtagFor(layer);
      gtag('js', new Date());
      gtag('config', id, {
        anonymize_ip: true,
        allow_google_signals: false,
        allow_ad_personalization_signals: false,
      });
      load(`https://www.googletagmanager.com/gtag/js?id=${enc}`, nonce);
      return;
    }
    case 'gtm': {
      const layer = (w.dataLayer as unknown[] | undefined) ?? [];
      w.dataLayer = layer;
      layer.push({ 'gtm.start': Date.now(), event: 'gtm.js' });
      load(`https://www.googletagmanager.com/gtm.js?id=${enc}`, nonce);
      return;
    }
    case 'clarity': {
      stub(w, 'clarity', () => {
        const c: Queued = (...args) => {
          (c.queue = c.queue ?? []).push(args);
        };
        return c;
      });
      load(`https://www.clarity.ms/tag/${enc}`, nonce);
      return;
    }
    case 'metaPixel': {
      const fbq = stub(w, 'fbq', () => {
        const n: Queued = (...args) => {
          if (n.callMethod) n.callMethod(...args);
          else (n.queue as unknown[]).push(args);
        };
        n.push = n;
        n.loaded = true;
        n.version = '2.0';
        n.queue = [];
        return n;
      });
      w._fbq = fbq;
      fbq('init', id);
      fbq('track', 'PageView');
      load('https://connect.facebook.net/en_US/fbevents.js', nonce);
      return;
    }
    case 'tiktok': {
      w.TiktokAnalyticsObject = 'ttq';
      const methods = [
        'page',
        'track',
        'identify',
        'instance',
        'debug',
        'on',
        'off',
        'once',
        'ready',
        'alias',
        'group',
        'enableCookie',
        'disableCookie',
      ];
      const ttq = ((w.ttq as unknown[] | undefined) ?? []) as unknown[] & Record<string, unknown>;
      w.ttq = ttq;
      for (const m of methods)
        ttq[m] = (...args: unknown[]) => {
          ttq.push([m, ...args]);
        };
      load(`https://analytics.tiktok.com/i18n/pixel/events.js?sdkid=${enc}&lib=ttq`, nonce);
      (ttq.page as Fn)();
      return;
    }
    case 'linkedin': {
      w._linkedin_partner_id = id;
      const ids = (w._linkedin_data_partner_ids as string[] | undefined) ?? [];
      ids.push(id);
      w._linkedin_data_partner_ids = ids;
      load('https://snap.licdn.com/li.lms-analytics/insight.min.js', nonce);
      return;
    }
    case 'x': {
      const twq = stub(w, 'twq', () => {
        const e: Queued = (...args) => {
          if (e.exe) e.exe(...args);
          else (e.queue as unknown[]).push(args);
        };
        e.version = '1.1';
        e.queue = [];
        return e;
      });
      twq('config', id);
      load('https://static.ads-twitter.com/uwt.js', nonce);
      return;
    }
    case 'pinterest': {
      const pintrk = stub(w, 'pintrk', () => {
        const p: Queued = (...args) => {
          (p.queue as unknown[]).push(args);
        };
        p.queue = [];
        p.version = '3.0';
        return p;
      });
      pintrk('load', id);
      pintrk('page');
      load('https://s.pinimg.com/ct/core.js', nonce);
    }
  }
}

/** Reports a named conversion to the providers that are running, and counts it in the first-party counter. */
export function trackConversion(name: 'signup_click' | 'contact_sent' | 'free_tool_used'): void {
  if (typeof window === 'undefined') return;
  const w = window as unknown as Win;
  window.dispatchEvent(new CustomEvent('kd:conversion', { detail: name }));
  const path = window.location.pathname;
  void fetch('/api/public-site/hit', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ path, event: name }),
    keepalive: true,
  }).catch(() => undefined);
  if (name === 'free_tool_used') return;
  const lead = name === 'contact_sent' ? 'Lead' : 'CompleteRegistration';
  const eventId = `${Date.now().toString(36)}${globalThis.crypto.randomUUID().replaceAll('-', '').slice(0, 8)}`;
  if (started.has('metaPixel') && typeof w.fbq === 'function') {
    (w.fbq as Fn)('track', lead, {}, { eventID: eventId });
    void fetch('/api/public-site/track', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ event: lead, eventId, path }),
      keepalive: true,
    }).catch(() => undefined);
  }
  if (started.has('ga4') && Array.isArray(w.dataLayer))
    gtagFor(w.dataLayer)('event', name === 'contact_sent' ? 'generate_lead' : 'sign_up');
  if (started.has('tiktok') && w.ttq)
    ((w.ttq as Record<string, Fn>).track as Fn)(
      name === 'contact_sent' ? 'SubmitForm' : 'CompleteRegistration',
    );
}
