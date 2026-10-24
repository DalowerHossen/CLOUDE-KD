// path: components/payment/processors/fastspring/index.tsx
'use client';
// Secure form of FastSpring: Checkout Components. The card inputs and the pay button are rendered by FastSpring inside
// its own frames; this component only receives the order id that FastSpring reports when the order is complete
// (docs/processors/fastspring.md section 4). No key tracking, no analytics. The script comes from FastSpring's own host
// (never bundled) and is loaded once per page load.
import { useEffect, useRef, useState } from 'react';
import { Alert } from '@/components/ui/alert';
import { t } from '@/lib/i18n';
import type { SecureFormProps } from '@/components/payment/secure-form-types';

const SDK_URLS: ReadonlySet<string> = new Set([
  'https://cdn.onfastspring.com/checkout-sdk/latest/fastspring-sdk.js',
]);
const CHECKOUT_URL = /^https:\/\/[a-z0-9-]{1,100}\.onfastspring\.com\/[A-Za-z0-9_-]{1,100}$/;
const SESSION_ID = /^[A-Za-z0-9_-]{8,100}$/;
const ORDER_ID = /^[A-Za-z0-9_-]{8,64}$/;
const CARD_ID = 'kd-fastspring-card';
const PAY_ID = 'kd-fastspring-pay';
const DISCLOSURES_ID = 'kd-fastspring-disclosures';

interface Mountable {
  mount: (selector: string) => void;
}
interface FastspringSdk {
  components: { create: (type: string, options?: Record<string, unknown>) => Mountable };
  checkout: (
    sessionId: string,
    callbacks: { onSuccess: () => void; onError: (error: unknown) => void },
  ) => void;
}
interface InitOptions {
  checkoutUrl: string;
  onOrderCompleted: (data: { id?: string }) => void;
  onPaymentFailed: (error: unknown) => void;
}
declare global {
  interface Window {
    FastSpring?: { init: (options: InitOptions) => FastspringSdk };
  }
}

const loading = new Map<string, Promise<void>>();
function loadScript(url: string): Promise<void> {
  if (!SDK_URLS.has(url)) return Promise.reject(new Error('unknown FastSpring script address'));
  const existing = loading.get(url);
  if (existing) return existing;
  const promise = new Promise<void>((resolve, reject) => {
    const script = document.createElement('script');
    script.src = url;
    script.async = true;
    script.onload = () =>
      window.FastSpring ? resolve() : reject(new Error('FastSpring script did not start'));
    script.onerror = () => {
      loading.delete(url);
      reject(new Error('FastSpring script could not be loaded'));
    };
    document.head.appendChild(script);
  });
  loading.set(url, promise);
  return promise;
}

export default function FastspringSecureForm(props: SecureFormProps): JSX.Element {
  const { clientConfig, disabled, onToken, onError } = props;
  const sdkUrl = clientConfig.sdkUrl ?? '';
  const checkoutUrl = clientConfig.checkoutUrl ?? '';
  const sessionId = clientConfig.sessionId ?? '';
  const known =
    SDK_URLS.has(sdkUrl) && CHECKOUT_URL.test(checkoutUrl) && SESSION_ID.test(sessionId);
  const [failed, setFailed] = useState(false);
  const callbacks = useRef({ onToken, onError });

  useEffect(() => {
    callbacks.current = { onToken, onError };
  });

  useEffect(() => {
    if (!known) return;
    let cancelled = false;
    void (async () => {
      try {
        await loadScript(sdkUrl);
        if (cancelled || !window.FastSpring) return;
        const sdk = window.FastSpring.init({
          checkoutUrl,
          onOrderCompleted: (data) => {
            if (typeof data.id === 'string' && ORDER_ID.test(data.id))
              callbacks.current.onToken(data.id);
            else callbacks.current.onError(t('s10Payments.checkout.failed'));
          },
          onPaymentFailed: () => callbacks.current.onError(t('s10Payments.checkout.failed')),
        });
        sdk.components.create('fs-card').mount(`#${CARD_ID}`);
        sdk.components.create('fs-pay-button').mount(`#${PAY_ID}`);
        sdk.components.create('fs-disclosures').mount(`#${DISCLOSURES_ID}`);
        sdk.checkout(sessionId, {
          onSuccess: () => undefined,
          onError: () => {
            if (!cancelled) setFailed(true);
          },
        });
      } catch {
        if (!cancelled) setFailed(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [known, sdkUrl, checkoutUrl, sessionId]);

  if (!known || failed)
    return <Alert variant="destructive">{t('s10Payments.checkout.noForm')}</Alert>;
  return (
    <div
      className="space-y-sp-12"
      aria-busy={disabled}
      style={disabled ? { pointerEvents: 'none', opacity: 0.6 } : undefined}
    >
      <div id={CARD_ID} />
      <div id={PAY_ID} />
      <div id={DISCLOSURES_ID} />
    </div>
  );
}
