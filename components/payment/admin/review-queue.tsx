// path: components/payment/admin/review-queue.tsx
'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { z } from 'zod';
import { Alert } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { t, type StringKey } from '@/lib/i18n';
import type { ReviewItem } from '@/services/payment/reviews';

const errorBody = z.object({
  error: z.object({ code: z.string().optional(), message: z.string() }),
});

function reasonText(reason: string): string {
  const key = `s10Payments.review.reasons.${reason}` as StringKey;
  const text = t(key);
  return text === key ? reason : text;
}

export function ReviewQueue({ items }: { items: ReviewItem[] }): JSX.Element {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<{ ok: boolean; text: string } | null>(null);

  async function decide(
    item: ReviewItem,
    decision: 'capture' | 'void',
    form: HTMLFormElement,
  ): Promise<void> {
    const data = new FormData(form);
    const note = String(data.get('note') ?? '').trim();
    setBusy(item.reviewId);
    setFeedback(null);
    try {
      const response = await fetch(`/api/admin/payment-review/${item.reviewId}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          decision,
          note: note === '' ? null : note,
          blockCard: data.get('blockCard') === 'on',
        }),
      });
      if (!response.ok) {
        const parsed = errorBody.safeParse(await response.json().catch(() => null));
        setFeedback({
          ok: false,
          text:
            parsed.success && parsed.data.error.code === 'step_up_required'
              ? t('s10Payments.review.needStepUp')
              : parsed.success
                ? parsed.data.error.message
                : t('s10Payments.review.failed'),
        });
        return;
      }
      setFeedback({ ok: true, text: t('s10Payments.review.done') });
      router.refresh();
    } catch {
      setFeedback({ ok: false, text: t('s10Payments.review.failed') });
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="space-y-sp-16">
      {feedback ? (
        <Alert variant={feedback.ok ? 'success' : 'destructive'}>{feedback.text}</Alert>
      ) : null}
      <ul className="space-y-sp-12">
        {items.map((item) => (
          <li key={item.reviewId} className="rounded-lg border p-sp-16">
            <dl className="grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2 lg:grid-cols-3">
              <div>
                <dt className="text-muted-foreground">{t('s10Payments.review.columns.company')}</dt>
                <dd className="font-medium">{item.companyName}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">{t('s10Payments.review.columns.invoice')}</dt>
                <dd className="font-medium">{item.invoiceNumber}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">{t('s10Payments.review.columns.amount')}</dt>
                <dd className="font-medium">USD {item.amount}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">
                  {t('s10Payments.review.columns.processor')}
                </dt>
                <dd>{item.processorId ?? ''}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">{t('s10Payments.review.columns.hold')}</dt>
                <dd>{item.holdUntil.replace('T', ' ').slice(0, 16)} UTC</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">{t('s10Payments.review.columns.reasons')}</dt>
                <dd className="flex flex-wrap gap-1">
                  {item.reasons.map((r) => (
                    <Badge key={r} variant="warning" title={reasonText(r)}>
                      {reasonText(r)}
                    </Badge>
                  ))}
                </dd>
              </div>
            </dl>
            <form
              className="mt-sp-12 space-y-sp-8"
              onSubmit={(e) => {
                e.preventDefault();
              }}
            >
              <div className="space-y-1">
                <Label htmlFor={`note-${item.reviewId}`}>{t('s10Payments.review.note')}</Label>
                <Textarea id={`note-${item.reviewId}`} name="note" maxLength={300} rows={2} />
                <p className="text-xs text-muted-foreground">{t('s10Payments.review.noteHelp')}</p>
              </div>
              {item.cardIdentityId ? (
                <label className="flex items-center gap-2 text-sm">
                  <input type="checkbox" name="blockCard" />
                  {t('s10Payments.review.blockCard')}
                </label>
              ) : null}
              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  disabled={busy === item.reviewId}
                  onClick={(e) =>
                    void decide(item, 'capture', e.currentTarget.form as HTMLFormElement)
                  }
                >
                  {t('s10Payments.review.capture')}
                </Button>
                <Button
                  type="button"
                  variant="destructive"
                  disabled={busy === item.reviewId}
                  onClick={(e) =>
                    void decide(item, 'void', e.currentTarget.form as HTMLFormElement)
                  }
                >
                  {t('s10Payments.review.void')}
                </Button>
              </div>
            </form>
          </li>
        ))}
      </ul>
    </div>
  );
}
