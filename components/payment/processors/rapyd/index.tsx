// path: components/payment/processors/rapyd/index.tsx
'use client';
// Secure form of Rapyd: Checkout Toolkit. The card fields are inside Rapyd's own iframe; this component only receives the
// payment id that Rapyd reports when the payment succeeded (docs/processors/rapyd.md section 4). No key tracking, no
// analytics. The script comes from Rapyd's own host (never bundled) and is loaded once per page load.
import { useEffect, useRef, useState } from 'react';
import { Alert } from '@/components/ui/alert';
import { t } from '@/lib/i18n';
import type { SecureFormProps } from '@/components/payment/secure-form-types';

const SCRIPT_URLS: ReadonlySet<string> = new Set([
  'https://sandboxcheckouttoolkit.rapyd.net',
  'https://checkouttoolkit.rapyd.net',
]);
const CHECKOUT_ID = /^checkout_[a-f0-9]{16,64}$/;
const PAYMENT_ID = /^payment_[a-f0-9]{16,64}$/;
const CONTAINER_ID = 'rapyd-checkout';

interface ToolkitOptions {
  id: string;
  pay_button_text: string;
  close_on_complete: boolean;
  wait_on_payment_redirect: boolean;
}
interface Toolkit {
  displayCheckout: () => void;
  closeCheckout: () => void;
}
declare global {
  interface Window {
    RapydCheckoutToolkit?: new (options: ToolkitOptions) => Toolkit;
  }
}

const loading = new Map<string, Promise<void>>();
function loadScript(url: string): Promise<void> {
  if (!SCRIPT_URLS.has(url)) return Promise.reject(new Error('unknown Rapyd script address'));
  const existing = loading.get(url);
  if (existing) return existing;
  const promise = new Promise<void>((resolve, reject) => {
    const script = document.createElement('script');
    script.src = url;
    script.async = true;
    script.onload = () =>
      window.RapydCheckoutToolkit ? resolve() : reject(new Error('Rapyd script did not start'));
    script.onerror = () => {
      loading.delete(url);
      reject(new Error('Rapyd script could not be loaded'));
    };
    document.head.appendChild(script);
  });
  loading.set(url, promise);
  return promise;
}

function paymentIdOf(event: Event): string | null {
  const detail: unknown = (event as CustomEvent<unknown>).detail;
  const id =
    typeof detail === 'object' && detail !== null ? (detail as Record<string, unknown>).id : null;
  return typeof id === 'string' && PAYMENT_ID.test(id) ? id : null;
}

export default function RapydSecureForm(props: SecureFormProps): JSX.Element {
  const { clientConfig, disabled, onToken, onError } = props;
  const scriptUrl = clientConfig.scriptUrl ?? '';
  const checkoutId = clientConfig.checkoutId ?? '';
  const known = SCRIPT_URLS.has(scriptUrl) && CHECKOUT_ID.test(checkoutId);
  const [failed, setFailed] = useState(false);
  const callbacks = useRef({ onToken, onError });

  useEffect(() => {
    callbacks.current = { onToken, onError };
  });

  useEffect(() => {
    if (!known) return;
    let cancelled = false;
    let toolkit: Toolkit | null = null;
    const onSuccess = (event: Event): void => {
      const id = paymentIdOf(event);
      if (id) callbacks.current.onToken(id);
      else callbacks.current.onError(t('s10Payments.checkout.failed'));
    };
    const onFailure = (): void => callbacks.current.onError(t('s10Payments.checkout.failed'));
    window.addEventListener('onCheckoutPaymentSuccess', onSuccess);
    window.addEventListener('onCheckoutPaymentFailure', onFailure);
    window.addEventListener('onCheckoutPaymentExpired', onFailure);
    void (async () => {
      try {
        await loadScript(scriptUrl);
        if (cancelled || !window.RapydCheckoutToolkit) return;
        toolkit = new window.RapydCheckoutToolkit({
          id: checkoutId,
          pay_button_text: t('s10Payments.checkout.securePay'),
          close_on_complete: true,
          wait_on_payment_redirect: true,
        });
        toolkit.displayCheckout();
      } catch {
        if (!cancelled) setFailed(true);
      }
    })();
    return () => {
      cancelled = true;
      window.removeEventListener('onCheckoutPaymentSuccess', onSuccess);
      window.removeEventListener('onCheckoutPaymentFailure', onFailure);
      window.removeEventListener('onCheckoutPaymentExpired', onFailure);
      try {
        toolkit?.closeCheckout();
      } catch {
        // The frame is already gone.
      }
    };
  }, [known, scriptUrl, checkoutId]);

  if (!known || failed)
    return <Alert variant="destructive">{t('s10Payments.checkout.noForm')}</Alert>;
  return (
    <div
      id={CONTAINER_ID}
      className="w-full min-w-[320px]"
      aria-busy={disabled}
      style={disabled ? { pointerEvents: 'none', opacity: 0.6 } : undefined}
    />
  );
}
