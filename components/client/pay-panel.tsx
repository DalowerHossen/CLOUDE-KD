// path: components/client/pay-panel.tsx
'use client';
import { useEffect, useState } from 'react';
import { CheckoutPanel } from '@/components/payment/checkout-panel';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { t } from '@/lib/i18n';

interface PayPanelProps {
  token: string;
  /** The exact words shown next to the box; the server stores the same words as the proof. */
  consentText: string;
  timeoutMinutes: number;
}

type Phase = 'consent' | 'saving' | 'form' | 'timeout';

/**
 * The payment page: the payer ticks one box (terms and refund policy), the server stores the proof, and only then does the
 * processor's secure form open. The page closes itself after the time set in the configuration.
 */
export function PayPanel({ token, consentText, timeoutMinutes }: PayPanelProps): JSX.Element {
  const [phase, setPhase] = useState<Phase>('consent');
  const [accepted, setAccepted] = useState(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const timer = window.setTimeout(() => setPhase('timeout'), timeoutMinutes * 60_000);
    return () => window.clearTimeout(timer);
  }, [timeoutMinutes]);

  async function accept(): Promise<void> {
    setPhase('saving');
    setFailed(false);
    try {
      const response = await fetch('/api/portal/consent', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ token, accepted: true }),
        cache: 'no-store',
      });
      if (response.ok) setPhase('form');
      else {
        setFailed(true);
        setPhase('consent');
      }
    } catch {
      setFailed(true);
      setPhase('consent');
    }
  }

  if (phase === 'timeout')
    return (
      <Alert variant="warning">
        <p className="font-semibold">{t('s13Portal.pay.timeoutTitle')}</p>
        <p>{t('s13Portal.pay.timeoutBody', { minutes: String(timeoutMinutes) })}</p>
      </Alert>
    );
  if (phase === 'form') return <CheckoutPanel token={token} />;
  return (
    <section className="mx-auto w-full max-w-md space-y-sp-16" aria-labelledby="pay-title">
      <h1 id="pay-title" className="text-h3 font-semibold">
        {t('s13Portal.pay.title')}
      </h1>
      <p className="text-sm text-muted-foreground">{t('s13Portal.pay.secure')}</p>
      <div className="flex items-start gap-sp-8">
        <Checkbox
          id="portal-consent"
          checked={accepted}
          onCheckedChange={(value) => setAccepted(value === true)}
          aria-label={t('s13Portal.consent.label')}
        />
        <label htmlFor="portal-consent" className="pt-3 text-sm">
          {consentText}
        </label>
      </div>
      {failed ? <Alert variant="destructive">{t('s13Portal.consent.failed')}</Alert> : null}
      <Button
        type="button"
        className="w-full"
        disabled={!accepted || phase === 'saving'}
        onClick={() => void accept()}
      >
        {t('s13Portal.consent.continue')}
      </Button>
    </section>
  );
}
