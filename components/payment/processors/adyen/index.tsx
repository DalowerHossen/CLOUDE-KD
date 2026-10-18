// path: components/payment/processors/adyen/index.tsx
'use client';
// Secure form of Adyen: Web Drop-in (Sessions flow). The card fields and the pay button are Adyen's own, rendered by
// the script below inside Adyen's frames; this component only receives the session result that Drop-in reports when the
// payment is completed (docs/processors/adyen.md section 4). The script and stylesheet are loaded from Adyen's CDN with
// fixed Subresource Integrity hashes (never bundled, never taken from the server answer). No key tracking, no analytics.
import { useEffect, useRef, useState } from 'react';
import { Alert } from '@/components/ui/alert';
import { t } from '@/lib/i18n';
import type { SecureFormProps } from '@/components/payment/secure-form-types';

const VERSION = '6.46.0';
const JS_INTEGRITY = 'sha384-BWFAwV8ndpuOuMAiAu2fKA0Vj2lSBNRCVBKIV2K7G6hRT7+0CaXiFYZxkDgfwY7r';
const CSS_INTEGRITY = 'sha384-iqhFsakyeWB88YbaGEhZMvY6gJnakKalS52WEM1jya1sN8udUMNyKpfouOSmYVy/';
const HOSTS: Readonly<Record<string, string>> = {
  test: 'https://checkoutshopper-test.cdn.adyen.com',
  live: 'https://checkoutshopper-live.cdn.adyen.com',
};
const SESSION_ID = /^[A-Za-z0-9]{8,64}$/;
const SESSION_RESULT = /^[\x21-\x7E]{8,8192}$/;
const CLIENT_KEY = /^(test|live)_[A-Za-z0-9]{10,100}$/;
const CONTAINER_ID = 'kd-adyen-dropin';

interface PaymentResult {
  sessionResult?: string;
  resultCode?: string;
}
interface Mountable {
  mount: (selector: string) => unknown;
}
interface AdyenWeb {
  AdyenCheckout: (configuration: Record<string, unknown>) => Promise<unknown>;
  Dropin: new (checkout: unknown, options: Record<string, unknown>) => Mountable;
}
declare global {
  interface Window {
    AdyenWeb?: AdyenWeb;
  }
}

const loading = new Map<string, Promise<void>>();
function loadAssets(host: string): Promise<void> {
  const existing = loading.get(host);
  if (existing) return existing;
  const promise = new Promise<void>((resolve, reject) => {
    const base = `${host}/checkoutshopper/sdk/${VERSION}`;
    const style = document.createElement('link');
    style.rel = 'stylesheet';
    style.href = `${base}/adyen.css`;
    style.integrity = CSS_INTEGRITY;
    style.crossOrigin = 'anonymous';
    document.head.appendChild(style);
    const script = document.createElement('script');
    script.src = `${base}/adyen.js`;
    script.integrity = JS_INTEGRITY;
    script.crossOrigin = 'anonymous';
    script.async = true;
    script.onload = () =>
      window.AdyenWeb ? resolve() : reject(new Error('Adyen script did not start'));
    script.onerror = () => {
      loading.delete(host);
      reject(new Error('Adyen script could not be loaded'));
    };
    document.head.appendChild(script);
  });
  loading.set(host, promise);
  return promise;
}

export default function AdyenSecureForm(props: SecureFormProps): JSX.Element {
  const { clientConfig, disabled, onToken, onError } = props;
  const environment = clientConfig.environment ?? '';
  const host = HOSTS[environment];
  const sessionId = clientConfig.sessionId ?? '';
  const sessionData = clientConfig.sessionData ?? '';
  const clientKey = clientConfig.clientKey ?? '';
  const countryCode = clientConfig.countryCode ?? '';
  const amount = clientConfig.amount ?? '';
  const known =
    host !== undefined &&
    SESSION_ID.test(sessionId) &&
    sessionData !== '' &&
    CLIENT_KEY.test(clientKey) &&
    /^[A-Z]{2}$/.test(countryCode) &&
    /^\d{1,12}$/.test(amount);
  const [failed, setFailed] = useState(false);
  const callbacks = useRef({ onToken, onError });

  useEffect(() => {
    callbacks.current = { onToken, onError };
  });

  useEffect(() => {
    if (!known || host === undefined) return;
    let cancelled = false;
    void (async () => {
      try {
        await loadAssets(host);
        const web = window.AdyenWeb;
        if (cancelled || !web) return;
        const checkout = await web.AdyenCheckout({
          environment,
          clientKey,
          countryCode,
          locale: 'en-US',
          amount: { value: +amount, currency: 'USD' },
          session: { id: sessionId, sessionData },
          onPaymentCompleted: (result: PaymentResult) => {
            const proof = result.sessionResult;
            if (typeof proof === 'string' && SESSION_RESULT.test(proof))
              callbacks.current.onToken(`${sessionId}.${proof}`);
            else callbacks.current.onError(t('s10Payments.checkout.failed'));
          },
          onPaymentFailed: () => callbacks.current.onError(t('s10Payments.checkout.failed')),
          onError: () => callbacks.current.onError(t('s10Payments.checkout.failed')),
        });
        if (cancelled) return;
        new web.Dropin(checkout, {}).mount(`#${CONTAINER_ID}`);
      } catch {
        if (!cancelled) setFailed(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [known, host, environment, clientKey, countryCode, amount, sessionId, sessionData]);

  if (!known || failed)
    return <Alert variant="destructive">{t('s10Payments.checkout.noForm')}</Alert>;
  return (
    <div
      id={CONTAINER_ID}
      className="w-full"
      aria-busy={disabled}
      style={disabled ? { pointerEvents: 'none', opacity: 0.6 } : undefined}
    />
  );
}
