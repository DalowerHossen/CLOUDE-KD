// path: lib/marketing/ab-store.ts
// Browser side of A/B experiments: loads a running experiment, assigns the visitor a variant (only with the analytics
// choice), remembers it in the cookie "kd_ab", and reports exposures and conversions. The server counts only
// visitors whose consent cookie allows analytics.
import { z } from 'zod';
import { consentFromCookieString } from '@/lib/analytics/consent';

export const CONVERSION_EVENT = 'kd:conversion';

const experimentBody = z.object({
  data: z.object({
    key: z.string(),
    goalEvent: z.string(),
    variants: z.array(
      z.object({
        key: z.string(),
        heading: z.string(),
        subheading: z.string(),
        ctaLabel: z.string(),
      }),
    ),
  }),
});
export type AbVariant = z.infer<typeof experimentBody>['data']['variants'][number];

interface Assigned {
  variant: AbVariant;
}
const state = new Map<string, Assigned | null>();
const loading = new Set<string>();
const listeners = new Set<() => void>();

export function subscribeAb(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
export const assignedVariant = (key: string): AbVariant | null => state.get(key)?.variant ?? null;

function readCookie(): Record<string, string> {
  const out: Record<string, string> = {};
  const raw = document.cookie
    .split(';')
    .map((p) => p.trim())
    .find((p) => p.startsWith('kd_ab='));
  if (!raw) return out;
  for (const pair of decodeURIComponent(raw.slice(6)).split('|')) {
    const [k, v] = pair.split(':');
    if (k && v && /^[a-z0-9-]+$/.test(k) && /^[a-z0-9-]+$/.test(v)) out[k] = v;
  }
  return out;
}
function writeCookie(map: Record<string, string>): void {
  const value = encodeURIComponent(
    Object.entries(map)
      .map(([k, v]) => `${k}:${v}`)
      .join('|'),
  );
  const secure = window.location.protocol === 'https:' ? '; Secure' : '';
  document.cookie = `kd_ab=${value}; Path=/; Max-Age=${60 * 24 * 3600}; SameSite=Lax${secure}`;
}

function report(key: string, variant: string, kind: 'exposure' | 'conversion'): void {
  void fetch('/api/public-site/ab', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ key, variant, kind }),
    keepalive: true,
  }).catch(() => undefined);
}

/** Starts an experiment for this page view. Without the analytics choice the control is shown and nothing is stored. */
export async function startExperiment(key: string): Promise<void> {
  if (typeof window === 'undefined' || state.has(key) || loading.has(key)) return;
  const consent = consentFromCookieString(document.cookie);
  if (!consent?.analytics) return;
  loading.add(key);
  try {
    const response = await fetch(`/api/public-site/ab?key=${encodeURIComponent(key)}`);
    const parsed = experimentBody.safeParse(
      response.ok ? await response.json().catch(() => null) : null,
    );
    if (!parsed.success) {
      state.set(key, null);
      return;
    }
    const experiment = parsed.data.data;
    const saved = readCookie();
    let variant = experiment.variants.find((v) => v.key === saved[key]);
    if (!variant) {
      variant = experiment.variants[Math.floor(Math.random() * experiment.variants.length)];
      if (variant) writeCookie({ ...saved, [key]: variant.key });
    }
    if (!variant) return;
    state.set(key, { variant });
    report(key, variant.key, 'exposure');
    let converted = false;
    window.addEventListener(CONVERSION_EVENT, (event) => {
      const name = (event as CustomEvent<string>).detail;
      if (!converted && name === experiment.goalEvent && variant) {
        converted = true;
        report(key, variant.key, 'conversion');
      }
    });
    listeners.forEach((l) => l());
  } finally {
    loading.delete(key);
  }
}
