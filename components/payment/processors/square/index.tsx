// path: components/payment/processors/square/index.tsx
'use client';
// Secure form of Square: the card element of the Square Web Payments SDK. The card number, expiry, security code and
// postal code are typed inside Square's own frame; this component only passes on the single-use payment token. Square
// runs its risk check and, when needed, the 3D Secure challenge inside tokenize (docs/processors/square.md section 4).
// No key tracking, no analytics. The SDK script comes from Square's own host (never bundled).
import { useEffect, useRef, useState } from 'react';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { t } from '@/lib/i18n';
import type { SecureFormProps } from '@/components/payment/secure-form-types';

const SDK_URLS: ReadonlySet<string> = new Set([
  'https://sandbox.web.squarecdn.com/v1/square.js',
  'https://web.squarecdn.com/v1/square.js',
]);

interface SquareCard {
  attach(target: HTMLElement): Promise<void>;
  tokenize(details: {
    amount: string;
    currencyCode: string;
    intent: string;
    customerInitiated: boolean;
    sellerKeyedIn: boolean;
    billingContact: { postalCode?: string; countryCode: string };
  }): Promise<{ status: string; token?: string }>;
  destroy(): Promise<void>;
}
interface SquareGlobal {
  payments(applicationId: string, locationId: string): { card(): Promise<SquareCard> };
}
declare global {
  interface Window {
    Square?: SquareGlobal;
  }
}

const loading = new Map<string, Promise<SquareGlobal>>();
function loadSdk(url: string): Promise<SquareGlobal> {
  if (!SDK_URLS.has(url)) return Promise.reject(new Error('unknown Square SDK address'));
  const existing = loading.get(url);
  if (existing) return existing;
  const promise = new Promise<SquareGlobal>((resolve, reject) => {
    const script = document.createElement('script');
    script.src = url;
    script.async = true;
    script.onload = () =>
      window.Square ? resolve(window.Square) : reject(new Error('Square SDK did not start'));
    script.onerror = () => {
      loading.delete(url);
      reject(new Error('Square SDK could not be loaded'));
    };
    document.head.appendChild(script);
  });
  loading.set(url, promise);
  return promise;
}

export default function SquareSecureForm(props: SecureFormProps): JSX.Element {
  const { clientConfig, submitLabel, disabled, onToken, onError, billingPostalCode } = props;
  const host = useRef<HTMLDivElement>(null);
  const card = useRef<SquareCard | null>(null);
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const applicationId = clientConfig.applicationId ?? '';
  const locationId = clientConfig.locationId ?? '';
  const sdkUrl = clientConfig.sdkUrl ?? '';

  useEffect(() => {
    let cancelled = false;
    let created: SquareCard | null = null;
    void (async () => {
      try {
        const square = await loadSdk(sdkUrl);
        const element = host.current;
        if (!element) return;
        created = await square.payments(applicationId, locationId).card();
        await created.attach(element);
        if (cancelled) {
          void created.destroy();
          return;
        }
        card.current = created;
        setReady(true);
      } catch {
        if (!cancelled) setFailed(true);
      }
    })();
    return () => {
      cancelled = true;
      void created?.destroy();
      card.current = null;
    };
  }, [applicationId, locationId, sdkUrl]);

  async function submit(): Promise<void> {
    const element = card.current;
    if (!element || busy) return;
    setBusy(true);
    try {
      const result = await element.tokenize({
        amount: clientConfig.amount ?? '',
        currencyCode: 'USD',
        intent: 'CHARGE',
        customerInitiated: true,
        sellerKeyedIn: false,
        billingContact: {
          countryCode: 'US',
          ...(billingPostalCode ? { postalCode: billingPostalCode } : {}),
        },
      });
      if (result.status === 'OK' && result.token) onToken(result.token);
      else onError(t('s10Payments.checkout.failed'));
    } catch {
      onError(t('s10Payments.checkout.failed'));
    } finally {
      setBusy(false);
    }
  }

  if (failed) return <Alert variant="destructive">{t('s10Payments.checkout.noForm')}</Alert>;
  return (
    <div className="space-y-sp-12">
      <div ref={host} className="min-h-24 w-full" />
      <Button
        type="button"
        className="w-full"
        disabled={!ready || disabled || busy}
        onClick={() => void submit()}
      >
        {submitLabel}
      </Button>
    </div>
  );
}
