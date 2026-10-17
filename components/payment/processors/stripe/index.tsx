// path: components/payment/processors/stripe/index.tsx
'use client';
// Secure form of Stripe: the Payment Element of Stripe.js. Stripe.js is loaded from js.stripe.com (never bundled or
// copied, as the Stripe documentation requires). The payer types card details only inside Stripe's own frame; this
// component receives a ConfirmationToken id and nothing else. No key tracking, no analytics.
import { useEffect, useRef, useState } from 'react';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { t } from '@/lib/i18n';
import type { SecureFormProps } from '@/components/payment/secure-form-types';

const SCRIPT_URL = 'https://js.stripe.com/endive/stripe.js';

interface StripeElement {
  mount(container: HTMLElement): void;
  destroy(): void;
}
interface StripeElements {
  create(type: 'payment', options: { layout?: string }): StripeElement;
  submit(): Promise<{ error?: { message?: string } }>;
}
interface StripeJs {
  elements(options: {
    mode: 'payment';
    amount: number;
    currency: string;
    captureMethod: 'manual';
    paymentMethodTypes: string[];
  }): StripeElements;
  createConfirmationToken(options: { elements: StripeElements }): Promise<{
    error?: { message?: string };
    confirmationToken?: { id: string };
  }>;
  handleNextAction(options: { clientSecret: string }): Promise<{ error?: { message?: string } }>;
}
type StripeFactory = (publishableKey: string) => StripeJs;
declare global {
  interface Window {
    Stripe?: StripeFactory;
  }
}

let loading: Promise<StripeFactory> | null = null;
function loadStripe(): Promise<StripeFactory> {
  if (window.Stripe) return Promise.resolve(window.Stripe);
  loading ??= new Promise<StripeFactory>((resolve, reject) => {
    const script = document.createElement('script');
    script.src = SCRIPT_URL;
    script.async = true;
    script.onload = () =>
      window.Stripe ? resolve(window.Stripe) : reject(new Error('Stripe.js did not start'));
    script.onerror = () => {
      loading = null;
      reject(new Error('Stripe.js could not be loaded'));
    };
    document.head.appendChild(script);
  });
  return loading;
}

export default function StripeSecureForm(props: SecureFormProps): JSX.Element {
  const { clientConfig, submitLabel, disabled, onToken, onError, challenge, onChallengeDone } =
    props;
  const host = useRef<HTMLDivElement>(null);
  const stripeRef = useRef<StripeJs | null>(null);
  const elementsRef = useRef<StripeElements | null>(null);
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const publishableKey = clientConfig.publishableKey ?? '';
  const amount = clientConfig.amount ?? '';

  useEffect(() => {
    let element: StripeElement | null = null;
    let cancelled = false;
    void (async () => {
      try {
        const factory = await loadStripe();
        if (cancelled || !host.current || !/^\d{1,12}$/.test(amount)) return;
        const stripe = factory(publishableKey);
        const elements = stripe.elements({
          mode: 'payment',
          amount: +amount,
          currency: clientConfig.currency ?? 'usd',
          captureMethod: 'manual',
          paymentMethodTypes: ['card'],
        });
        element = elements.create('payment', { layout: 'tabs' });
        element.mount(host.current as HTMLElement);
        stripeRef.current = stripe;
        elementsRef.current = elements;
        setReady(true);
      } catch {
        if (!cancelled) setFailed(true);
      }
    })();
    return () => {
      cancelled = true;
      element?.destroy();
    };
  }, [publishableKey, amount, clientConfig.currency]);

  useEffect(() => {
    const secret = challenge?.clientSecret;
    const stripe = stripeRef.current;
    if (!challenge || !secret || !stripe) return;
    let cancelled = false;
    void (async () => {
      const result = await stripe.handleNextAction({ clientSecret: secret });
      if (cancelled) return;
      if (result.error) onError(result.error.message ?? t('s10Payments.checkout.failed'));
      onChallengeDone();
    })();
    return () => {
      cancelled = true;
    };
  }, [challenge, onChallengeDone, onError]);

  async function submit(): Promise<void> {
    const stripe = stripeRef.current;
    const elements = elementsRef.current;
    if (!stripe || !elements || busy) return;
    setBusy(true);
    try {
      const submitted = await elements.submit();
      if (submitted.error) {
        onError(submitted.error.message ?? t('s10Payments.checkout.failed'));
        return;
      }
      const result = await stripe.createConfirmationToken({ elements });
      if (result.error || !result.confirmationToken) {
        onError(result.error?.message ?? t('s10Payments.checkout.failed'));
        return;
      }
      onToken(result.confirmationToken.id);
    } catch {
      onError(t('s10Payments.checkout.failed'));
    } finally {
      setBusy(false);
    }
  }

  if (failed) return <Alert variant="destructive">{t('s10Payments.checkout.noForm')}</Alert>;
  return (
    <div className="space-y-sp-12">
      <div ref={host} aria-label={t('s10Payments.checkout.loadingForm')} className="min-h-24" />
      <Button
        type="button"
        className="w-full"
        disabled={!ready || disabled || busy || challenge !== null}
        onClick={() => void submit()}
      >
        {submitLabel}
      </Button>
    </div>
  );
}
