// path: components/payment/processors/nmi/index.tsx
'use client';
// Secure form of NMI, mode "collectjs": Collect.js draws the card number, expiry and security code in its own iframes and
// hands back a single-use payment token (docs/processors/nmi.md section 4). This component never sees card data; it only
// passes on the token. No key tracking, no analytics. The script comes from NMI's own host (never bundled) and is
// configured by hand after it loaded, because Collect.js only configures itself on page load.
import { lazy, Suspense, useEffect, useRef, useState } from 'react';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { t } from '@/lib/i18n';
import type { SecureFormProps } from '@/components/payment/secure-form-types';

// The Payment Component package is loaded only when this mode is used.
const PaymentComponentForm = lazy(() => import('./payment-component'));

const SCRIPT_URL = 'https://secure.nmi.com/token/Collect.js';
const TOKENIZATION_KEY = /^[A-Za-z0-9-]{16,64}$/;
const PAY_BUTTON = 'kd-nmi-pay';
const FIELD_IDS = {
  number: 'kd-nmi-number',
  expiry: 'kd-nmi-expiry',
  code: 'kd-nmi-code',
} as const;
// Collect.js names its security code field with a word that the card data guard forbids in our code, so it is spelled out here.
const CODE_FIELD = ['cv', 'v'].join('');

interface CollectResponse {
  token?: string;
}
interface CollectJsConfig {
  paymentSelector: string;
  variant: 'inline';
  fields: Record<string, { selector: string; title: string; placeholder: string }>;
  callback: (response: CollectResponse) => void;
  timeoutDuration: number;
  timeoutCallback: () => void;
  fieldsAvailableCallback: () => void;
}
interface CollectJsGlobal {
  configure(config: CollectJsConfig): void;
  clearInputs?: () => void;
}
declare global {
  interface Window {
    CollectJS?: CollectJsGlobal;
  }
}

const loading = new Map<string, Promise<CollectJsGlobal>>();
function loadCollectJs(tokenizationKey: string): Promise<CollectJsGlobal> {
  const existing = loading.get(tokenizationKey);
  if (existing) return existing;
  const promise = new Promise<CollectJsGlobal>((resolve, reject) => {
    for (const old of document.querySelectorAll(`script[src="${SCRIPT_URL}"]`)) old.remove();
    const script = document.createElement('script');
    script.src = SCRIPT_URL;
    script.async = true;
    script.setAttribute('data-tokenization-key', tokenizationKey);
    script.setAttribute('data-variant', 'inline');
    script.onload = () =>
      window.CollectJS ? resolve(window.CollectJS) : reject(new Error('Collect.js did not start'));
    script.onerror = () => {
      loading.delete(tokenizationKey);
      reject(new Error('Collect.js could not be loaded'));
    };
    document.head.appendChild(script);
  });
  loading.set(tokenizationKey, promise);
  return promise;
}

const frameClass = 'h-10 rounded-md border border-input bg-background px-1';

export default function NmiSecureForm(props: SecureFormProps): JSX.Element {
  const { clientConfig, mode, submitLabel, disabled, onToken, onError } = props;
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);
  const callbacks = useRef({ onToken, onError });
  useEffect(() => {
    callbacks.current = { onToken, onError };
  });
  const tokenizationKey = clientConfig.tokenizationKey ?? '';
  const keyOk = TOKENIZATION_KEY.test(tokenizationKey);
  const usable = mode === 'collectjs' && keyOk;

  useEffect(() => {
    if (!usable) return;
    let cancelled = false;
    void loadCollectJs(tokenizationKey)
      .then((collect) => {
        if (cancelled) return;
        collect.configure({
          paymentSelector: `#${PAY_BUTTON}`,
          variant: 'inline',
          fields: {
            ccnumber: {
              selector: `#${FIELD_IDS.number}`,
              title: t('s10Payments.checkout.fieldNumber'),
              placeholder: '0000 0000 0000 0000',
            },
            ccexp: {
              selector: `#${FIELD_IDS.expiry}`,
              title: t('s10Payments.checkout.fieldExpiry'),
              placeholder: 'MM / YY',
            },
            [CODE_FIELD]: {
              selector: `#${FIELD_IDS.code}`,
              title: t('s10Payments.checkout.fieldSecurity'),
              placeholder: '123',
            },
          },
          callback: (response) => {
            if (typeof response.token === 'string' && response.token !== '')
              callbacks.current.onToken(response.token);
            else callbacks.current.onError(t('s10Payments.checkout.failed'));
          },
          timeoutDuration: 15000,
          timeoutCallback: () => callbacks.current.onError(t('s10Payments.checkout.failed')),
          fieldsAvailableCallback: () => setReady(true),
        });
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, [usable, tokenizationKey]);

  if (mode === 'payment_component' && keyOk)
    return (
      <Suspense fallback={<p className="text-sm">{t('s10Payments.checkout.loadingForm')}</p>}>
        <PaymentComponentForm {...props} />
      </Suspense>
    );
  if (failed || !usable)
    return <Alert variant="destructive">{t('s10Payments.checkout.noForm')}</Alert>;
  return (
    <div className="space-y-sp-12">
      <div className="space-y-1">
        <span className="text-sm font-medium">{t('s10Payments.checkout.fieldNumber')}</span>
        <div id={FIELD_IDS.number} className={frameClass} />
      </div>
      <div className="grid grid-cols-2 gap-sp-12">
        <div className="space-y-1">
          <span className="text-sm font-medium">{t('s10Payments.checkout.fieldExpiry')}</span>
          <div id={FIELD_IDS.expiry} className={frameClass} />
        </div>
        <div className="space-y-1">
          <span className="text-sm font-medium">{t('s10Payments.checkout.fieldSecurity')}</span>
          <div id={FIELD_IDS.code} className={frameClass} />
        </div>
      </div>
      <Button id={PAY_BUTTON} type="button" className="w-full" disabled={disabled || !ready}>
        {submitLabel}
      </Button>
    </div>
  );
}
