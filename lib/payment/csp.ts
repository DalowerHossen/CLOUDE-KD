// path: lib/payment/csp.ts
// Payment page CSP profile (REQ-CARD item 1). The payment profile of lib/security/csp.ts allows scripts, frames and
// connections only to the origins listed here: the secure-form hosts of the processors. No analytics host is ever listed.
import { PROCESSOR_ORIGINS } from '@/config/processors';
import type { ProcessorId } from '@/types/contracts';

function httpsOrigin(value: string): string | null {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && url.username === '' && url.password === ''
      ? url.origin
      : null;
  } catch {
    return null;
  }
}

/** Origins for one processor (valid https origins only, no duplicates). */
export function originsOf(processorId: ProcessorId): string[] {
  const list = PROCESSOR_ORIGINS[processorId] ?? [];
  return [...new Set(list.map(httpsOrigin).filter((o): o is string => o !== null))];
}

/** Every origin the payment profile may allow. The proxy passes this list to the CSP builder. */
export function paymentPageOrigins(): string[] {
  const all = Object.keys(PROCESSOR_ORIGINS) as ProcessorId[];
  return [...new Set(all.flatMap((id) => originsOf(id)))].sort();
}

/** Hosts that must never appear on a payment page. A verification script checks the list against the configuration. */
export const FORBIDDEN_PAYMENT_PAGE_HOSTS: readonly string[] = [
  'google-analytics.com',
  'googletagmanager.com',
  'connect.facebook.net',
  'static.hotjar.com',
  'script.hotjar.com',
  'clarity.ms',
  'cdn.segment.com',
  'mc.yandex.ru',
  'fullstory.com',
  'mouseflow.com',
  'plausible.io',
];

export function violatesPaymentProfile(origins: readonly string[]): string[] {
  return origins.filter((o) =>
    FORBIDDEN_PAYMENT_PAGE_HOSTS.some(
      (h) => new URL(o).hostname === h || new URL(o).hostname.endsWith(`.${h}`),
    ),
  );
}
