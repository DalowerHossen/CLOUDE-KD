// path: components/payment/processors/verifone/index.tsx
'use client';
// Secure form of Verifone: the hosted iFrame Checkout. The loader script from Verifone's own region host renders
// Verifone's payment frame inside the container below; the card is typed only in that frame (docs/processors/verifone.md
// section 4). When the frame reports that the checkout is complete, this component passes on the checkout id; the server
// then reads the checkout back from Verifone and verifies it against the invoice, so a message that arrives from
// anywhere else cannot confirm a payment. A second button asks the server to check the checkout, in case the report from
// the frame was not seen. No key tracking, no analytics. The loader is never bundled.
import { useEffect, useRef, useState } from 'react';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { t } from '@/lib/i18n';
import type { SecureFormProps } from '@/components/payment/secure-form-types';

const REGION_ORIGINS: ReadonlySet<string> = new Set([
  'https://cst.test-gsc.vfims.com',
  'https://uscst-gb.gsc.vficloud.net',
  'https://emea.gsc.verifone.cloud',
  'https://us.gsc.verifone.cloud',
  'https://nz.gsc.verifone.cloud',
]);
const CONTAINER_ID = 'kd-verifone-checkout';
const CHECKOUT_ID = /^[A-Za-z0-9-]{8,64}$/;

/** The loader address from the server, accepted only for a Verifone region host and this checkout. */
function loaderSource(loaderUrl: string, checkoutId: string): string | null {
  try {
    const url = new URL(loaderUrl);
    if (
      url.protocol !== 'https:' ||
      !REGION_ORIGINS.has(url.origin) ||
      !url.pathname.endsWith('/loader.js') ||
      url.searchParams.get('checkoutId') !== checkoutId ||
      !CHECKOUT_ID.test(checkoutId)
    )
      return null;
    url.searchParams.set('containerId', CONTAINER_ID);
    return url.toString();
  } catch {
    return null;
  }
}

/** The text of a message from the frame, whatever its shape; only the documented event names are looked for. */
function messageText(data: unknown): string {
  if (typeof data === 'string') return data;
  try {
    return JSON.stringify(data) ?? '';
  } catch {
    return '';
  }
}

export default function VerifoneSecureForm(props: SecureFormProps): JSX.Element {
  const { clientConfig, submitLabel, disabled, onToken, onError } = props;
  const checkoutId = clientConfig.checkoutId ?? '';
  const source = loaderSource(clientConfig.loaderUrl ?? '', checkoutId);
  const known = source !== null;
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);
  const sent = useRef(false);
  const callbacks = useRef({ onToken, onError });

  useEffect(() => {
    callbacks.current = { onToken, onError };
  });

  useEffect(() => {
    if (!source) return;
    sent.current = false;
    const host = document.getElementById(CONTAINER_ID);
    const script = document.createElement('script');
    script.src = source;
    script.defer = true;
    script.onload = () => setReady(true);
    script.onerror = () => setFailed(true);
    function onMessage(event: MessageEvent): void {
      if (!REGION_ORIGINS.has(event.origin)) return;
      const text = messageText(event.data);
      if (text.includes('CHECKOUT_COMPLETED')) {
        if (sent.current) return;
        sent.current = true;
        callbacks.current.onToken(checkoutId);
      } else if (text.includes('CHECKOUT_RENDERED_FAILED')) {
        setFailed(true);
      } else if (text.includes('CHECKOUT_FAILED')) {
        callbacks.current.onError(t('s10Payments.checkout.failed'));
      }
    }
    window.addEventListener('message', onMessage);
    document.head.appendChild(script);
    return () => {
      window.removeEventListener('message', onMessage);
      script.remove();
      host?.replaceChildren();
    };
  }, [source, checkoutId]);

  if (!known || failed)
    return <Alert variant="destructive">{t('s10Payments.checkout.noForm')}</Alert>;
  return (
    <div className="space-y-sp-12">
      <div id={CONTAINER_ID} className="min-h-72 w-full" />
      <Button
        type="button"
        variant="outline"
        className="w-full"
        disabled={!ready || disabled}
        onClick={() => callbacks.current.onToken(checkoutId)}
      >
        {submitLabel}
      </Button>
    </div>
  );
}
