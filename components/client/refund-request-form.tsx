// path: components/client/refund-request-form.tsx
'use client';
import { useState } from 'react';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { t } from '@/lib/i18n';

/** "Ask for a refund" on the receipt page. The owner decides; the client sees only that the request was sent. */
export function RefundRequestForm({
  token,
  refundable,
  windowDays,
}: {
  token: string;
  refundable: string;
  windowDays: number;
}): JSX.Element {
  const [amount, setAmount] = useState(refundable);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  async function submit(): Promise<void> {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch('/api/portal/refund-request', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ token, amount: amount.trim(), reason: reason.trim() }),
        cache: 'no-store',
      });
      const json = (await response.json().catch(() => null)) as {
        error?: { message?: string };
      } | null;
      if (!response.ok) throw new Error(json?.error?.message ?? t('s13Portal.refundForm.failed'));
      setSent(true);
    } catch (thrown) {
      setError(thrown instanceof Error ? thrown.message : t('s13Portal.refundForm.failed'));
    }
    setBusy(false);
  }

  if (sent) return <Alert variant="success">{t('s13Portal.refundForm.sent')}</Alert>;
  return (
    <form
      className="space-y-sp-8 print:hidden"
      onSubmit={(e) => {
        e.preventDefault();
        void submit();
      }}
      aria-labelledby="refund-title"
    >
      <h2 id="refund-title" className="font-semibold">
        {t('s13Portal.refundForm.title')}
      </h2>
      <p className="text-sm text-muted-foreground">
        {t('s13Portal.refundForm.help', { days: windowDays })}
      </p>
      {error ? <Alert variant="destructive">{error}</Alert> : null}
      <div className="space-y-1">
        <Label htmlFor="refund-amount">
          {t('s13Portal.refundForm.amount', { max: refundable })}
        </Label>
        <Input
          id="refund-amount"
          inputMode="decimal"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          disabled={busy}
        />
      </div>
      <div className="space-y-1">
        <Label htmlFor="refund-reason">{t('s13Portal.refundForm.reason')}</Label>
        <Textarea
          id="refund-reason"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          rows={3}
          maxLength={1000}
          disabled={busy}
        />
      </div>
      <Button type="submit" disabled={busy || reason.trim().length < 3}>
        {t('s13Portal.refundForm.submit')}
      </Button>
    </form>
  );
}
