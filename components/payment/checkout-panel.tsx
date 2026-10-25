// path: components/payment/checkout-panel.tsx
'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { z } from 'zod';
import { Alert } from '@/components/ui/alert';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { LoadingState } from '@/components/shared/state-views';
import { t } from '@/lib/i18n';
import { PROCESSOR_IDS } from '@/types/contracts';
import { CheckoutSlot } from './checkout-slot';

const errorBody = z.object({ error: z.object({ message: z.string() }) });
const checkoutBody = z.object({
  data: z.object({
    companyName: z.string(),
    invoiceNumber: z.string(),
    amount: z.string(),
    surcharge: z.string(),
    total: z.string(),
    processorId: z.enum(PROCESSOR_IDS),
    mode: z.string(),
    environment: z.enum(['sandbox', 'live']),
    clientConfig: z.record(z.string(), z.string()),
    refundWindowDays: z.number(),
  }),
});
const resultBody = z.object({
  data: z.object({
    id: z.string(),
    status: z.string(),
    message: z.string().nullable().optional(),
    requiredAction: z
      .object({
        kind: z.enum(['redirect', 'sdk_challenge']),
        url: z.string().nullable(),
        clientSecret: z.string().nullable(),
      })
      .nullable()
      .optional(),
  }),
});

type Checkout = z.infer<typeof checkoutBody>['data'];
type Phase =
  | { kind: 'loading' }
  | { kind: 'unavailable' }
  | { kind: 'ready'; checkout: Checkout }
  | { kind: 'paying'; checkout: Checkout }
  | { kind: 'challenge'; checkout: Checkout; paymentId: string; clientSecret: string | null }
  | { kind: 'done'; message: string; ok: boolean };

/** Set when the checkout is shown in a frame on a merchant's web site (the embedded checkout, app/embed/<token>). */
export interface EmbedHooks {
  /** The merchant web site that shows the frame; the server checks it against the merchant's list. */
  parentOrigin: string;
  /** Called when the payment reached a final state. */
  onComplete: (result: { paymentId: string; status: string }) => void;
  /** Called instead of leaving the page when the processor needs a full-page redirect (3D Secure); the merchant page does it. */
  onRedirect: (url: string) => void;
}

/** Hosted checkout shell. The portal page (STEP 13) renders it at /pay/<token>; the embed page renders it in a frame. */
export function CheckoutPanel({
  token,
  embed,
}: {
  token: string;
  embed?: EmbedHooks;
}): JSX.Element {
  const [phase, setPhase] = useState<Phase>({ kind: 'loading' });
  const [error, setError] = useState<string | null>(null);
  const [postal, setPostal] = useState('');
  const attemptKey = useRef<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const response = await fetch(`/api/payment-links/checkout/${token}`, { cache: 'no-store' });
        const parsed = checkoutBody.safeParse(await response.json().catch(() => null));
        if (cancelled) return;
        setPhase(
          response.ok && parsed.success
            ? { kind: 'ready', checkout: parsed.data.data }
            : { kind: 'unavailable' },
        );
      } catch {
        if (!cancelled) setPhase({ kind: 'unavailable' });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [token]);

  const onEmbedComplete = embed?.onComplete;
  const finish = useCallback(
    (paymentId: string, status: string, message: string | null | undefined): void => {
      onEmbedComplete?.({ paymentId, status });
      const ok = status === 'captured';
      setPhase({
        kind: 'done',
        ok,
        message:
          message ??
          (ok
            ? t('s10Payments.checkout.paid')
            : status === 'pending_review'
              ? t('s10Payments.checkout.review')
              : t('s10Payments.checkout.failed')),
      });
    },
    [onEmbedComplete],
  );

  const handleResult = useCallback(
    (checkout: Checkout, json: unknown): void => {
      const parsed = resultBody.safeParse(json);
      if (!parsed.success) {
        setError(t('s10Payments.checkout.failed'));
        setPhase({ kind: 'ready', checkout });
        return;
      }
      const result = parsed.data.data;
      if (result.status === 'requires_action' && result.requiredAction) {
        const action = result.requiredAction;
        if (action.kind === 'redirect' && action.url && action.url.startsWith('https://')) {
          if (embed) embed.onRedirect(action.url);
          else window.location.assign(action.url);
          return;
        }
        setPhase({
          kind: 'challenge',
          checkout,
          paymentId: result.id,
          clientSecret: action.clientSecret,
        });
        return;
      }
      finish(result.id, result.status, result.message);
    },
    [finish, embed],
  );

  async function onToken(checkout: Checkout, paymentToken: string): Promise<void> {
    setError(null);
    setPhase({ kind: 'paying', checkout });
    attemptKey.current ??= crypto.randomUUID();
    try {
      const response = await fetch(`/api/payment-links/checkout/${token}/pay`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'idempotency-key': attemptKey.current },
        body: JSON.stringify({
          paymentToken,
          billingPostalCode: postal.trim() === '' ? null : postal.trim(),
          returnUrl: embed ? `${window.location.origin}/pay/${token}` : window.location.href,
          embedOrigin: embed ? embed.parentOrigin : null,
        }),
      });
      const json: unknown = await response.json().catch(() => null);
      if (!response.ok) {
        const parsed = errorBody.safeParse(json);
        attemptKey.current = null;
        setError(parsed.success ? parsed.data.error.message : t('s10Payments.checkout.failed'));
        setPhase({ kind: 'ready', checkout });
        return;
      }
      attemptKey.current = null;
      handleResult(checkout, json);
    } catch {
      setError(t('s10Payments.checkout.failed'));
      setPhase({ kind: 'ready', checkout });
    }
  }

  async function onChallengeDone(checkout: Checkout, paymentId: string): Promise<void> {
    setPhase({ kind: 'paying', checkout });
    try {
      const response = await fetch(`/api/payment-links/checkout/${token}/resume`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ paymentId }),
      });
      handleResult(checkout, await response.json().catch(() => null));
    } catch {
      setError(t('s10Payments.checkout.failed'));
      setPhase({ kind: 'ready', checkout });
    }
  }

  if (phase.kind === 'loading') return <LoadingState rows={4} />;
  if (phase.kind === 'unavailable')
    return <Alert variant="destructive">{t('s10Payments.checkout.unavailable')}</Alert>;
  if (phase.kind === 'done')
    return <Alert variant={phase.ok ? 'success' : 'destructive'}>{phase.message}</Alert>;

  const checkout = phase.checkout;
  const busy = phase.kind === 'paying';
  return (
    <section className="mx-auto w-full max-w-md space-y-sp-16" aria-labelledby="checkout-title">
      <header className="space-y-1">
        <h1 id="checkout-title" className="text-h3 font-semibold">
          {t('s10Payments.checkout.title', { invoice: checkout.invoiceNumber })}
        </h1>
        <p className="text-sm text-muted-foreground">{checkout.companyName}</p>
      </header>
      <dl className="space-y-1 rounded-md border p-sp-12 text-sm">
        <div className="flex justify-between">
          <dt>{t('s10Payments.checkout.amount')}</dt>
          <dd>USD {checkout.amount}</dd>
        </div>
        {checkout.surcharge !== '0.0000' ? (
          <div className="flex justify-between">
            <dt>{t('s10Payments.checkout.surcharge')}</dt>
            <dd>USD {checkout.surcharge}</dd>
          </div>
        ) : null}
        <div className="flex justify-between font-semibold">
          <dt>{t('s10Payments.checkout.total')}</dt>
          <dd>USD {checkout.total}</dd>
        </div>
      </dl>
      {checkout.environment === 'sandbox' ? (
        <Alert>{t('s10Payments.checkout.sandbox')}</Alert>
      ) : null}
      {error ? <Alert variant="destructive">{error}</Alert> : null}
      <div className="space-y-1">
        <Label htmlFor="billing-postal">{t('s10Payments.checkout.postal')}</Label>
        <Input
          id="billing-postal"
          value={postal}
          onChange={(e) => setPostal(e.target.value)}
          maxLength={20}
          autoComplete="postal-code"
          disabled={busy}
        />
      </div>
      <CheckoutSlot
        processorId={checkout.processorId}
        clientConfig={checkout.clientConfig}
        mode={checkout.mode}
        environment={checkout.environment}
        submitLabel={t('s10Payments.checkout.pay', { total: checkout.total })}
        disabled={busy}
        billingPostalCode={postal.trim() === '' ? null : postal.trim()}
        onToken={(paymentToken) => void onToken(checkout, paymentToken)}
        onError={(message) => setError(message)}
        challenge={phase.kind === 'challenge' ? { clientSecret: phase.clientSecret } : null}
        onChallengeDone={() => {
          if (phase.kind === 'challenge') void onChallengeDone(checkout, phase.paymentId);
        }}
      />
      <p className="text-xs text-muted-foreground">
        {t('s10Payments.checkout.refundPolicy', { days: checkout.refundWindowDays })}
      </p>
    </section>
  );
}
