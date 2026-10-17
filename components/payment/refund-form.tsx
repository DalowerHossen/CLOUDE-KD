// path: components/payment/refund-form.tsx
'use client';
import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { z } from 'zod';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { t } from '@/lib/i18n';

const errorBody = z.object({ error: z.object({ message: z.string() }) });
const resultBody = z.object({ data: z.object({ status: z.string() }) });

interface Props {
  paymentId: string;
  left: string;
  threshold: string;
}

export function RefundForm({ paymentId, left, threshold }: Props): JSX.Element {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<{ ok: boolean; text: string } | null>(null);
  const [key, setKey] = useState(() => crypto.randomUUID());

  async function submit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    setBusy(true);
    setFeedback(null);
    try {
      const response = await fetch('/api/refunds', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'idempotency-key': key },
        body: JSON.stringify({
          paymentId,
          amount: String(data.get('amount') ?? '').trim(),
          reason: String(data.get('reason') ?? '').trim() || null,
        }),
      });
      const json: unknown = await response.json().catch(() => null);
      if (!response.ok) {
        const parsed = errorBody.safeParse(json);
        setFeedback({
          ok: false,
          text: parsed.success ? parsed.data.error.message : t('s10Payments.refund.failed'),
        });
        setKey(crypto.randomUUID());
        return;
      }
      const parsed = resultBody.safeParse(json);
      const waiting = parsed.success && parsed.data.data.status === 'captured';
      setFeedback({
        ok: true,
        text: waiting ? t('s10Payments.refund.waiting') : t('s10Payments.refund.done'),
      });
      setKey(crypto.randomUUID());
      router.refresh();
    } catch {
      setFeedback({ ok: false, text: t('s10Payments.refund.failed') });
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={(e) => void submit(e)} className="space-y-sp-12 rounded-lg border p-sp-16">
      <h2 className="text-lg font-semibold">{t('s10Payments.refund.title')}</h2>
      <p className="text-sm text-muted-foreground">
        {t('s10Payments.refund.help', { left: `USD ${left}`, threshold })}
      </p>
      <div className="grid gap-sp-12 sm:grid-cols-2">
        <div className="space-y-1">
          <Label htmlFor="refund-amount">{t('s10Payments.refund.amount')}</Label>
          <Input
            id="refund-amount"
            name="amount"
            inputMode="decimal"
            pattern="\d{1,14}(\.\d{1,4})?"
            required
            defaultValue={left}
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="refund-reason">{t('s10Payments.refund.reason')}</Label>
          <Input id="refund-reason" name="reason" maxLength={300} />
        </div>
      </div>
      {feedback ? (
        <Alert variant={feedback.ok ? 'success' : 'destructive'}>{feedback.text}</Alert>
      ) : null}
      <Button type="submit" disabled={busy}>
        {busy ? t('s10Payments.refund.working') : t('s10Payments.refund.submit')}
      </Button>
    </form>
  );
}
