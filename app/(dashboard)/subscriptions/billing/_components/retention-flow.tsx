// path: app/(dashboard)/subscriptions/billing/_components/retention-flow.tsx
'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { z } from 'zod';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { REASON_CODES, type ReasonCode, type Trigger } from '@/lib/platform/retention';
import { t } from '@/lib/i18n';

const p = (k: string): string => t(`s16Growth.flow.${k}` as never);
const reasonLabel = (c: ReasonCode): string => t(`s16Growth.retention.reasons.${c}` as never);

const offerBody = z.object({
  data: z
    .object({
      id: z.string(),
      title: z.string(),
      message: z.string(),
      couponCode: z.string().nullable(),
    })
    .nullable(),
});
const errorBody = z.object({ error: z.object({ message: z.string() }) });

type Offer = NonNullable<z.infer<typeof offerBody>['data']>;
type Step = 'ask' | 'offer' | 'done';

/**
 * "Why are you leaving?" then the platform team's offer for that reason, then the real action (cancel or move to a lower plan).
 * Choosing to keep the plan records that the company stayed; continuing does the action and records the answer with it.
 */
export function RetentionFlow({
  trigger,
  lowerPlans,
  interval,
}: {
  trigger: Trigger;
  lowerPlans: { slug: string; name: string }[];
  interval: 'month' | 'year';
}): JSX.Element | null {
  const router = useRouter();
  const [reason, setReason] = useState<ReasonCode | ''>('');
  const [detail, setDetail] = useState('');
  const [planTo, setPlanTo] = useState(lowerPlans[0]?.slug ?? '');
  const [offer, setOffer] = useState<Offer | null>(null);
  const [step, setStep] = useState<Step>('ask');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);

  if (trigger === 'downgrade' && lowerPlans.length === 0) return null;

  async function failure(response: Response): Promise<string> {
    const parsed = errorBody.safeParse(await response.json().catch(() => null));
    return parsed.success ? parsed.data.error.message : p('error');
  }

  async function proceed(): Promise<void> {
    if (reason === '') return;
    setBusy(true);
    setError(null);
    try {
      const survey = { reasonCode: reason, detail, offerId: offer?.id ?? null };
      const response =
        trigger === 'cancel'
          ? await fetch('/api/subscriptions/cancel', {
              method: 'POST',
              headers: { 'content-type': 'application/json' },
              body: JSON.stringify({
                reason: `${reasonLabel(reason)}${detail ? `: ${detail}` : ''}`.slice(0, 300),
                survey,
              }),
            })
          : await fetch('/api/subscriptions/change', {
              method: 'POST',
              headers: {
                'content-type': 'application/json',
                'idempotency-key': `ui-${crypto.randomUUID()}`,
              },
              body: JSON.stringify({ planSlug: planTo, interval, survey }),
            });
      if (!response.ok) {
        setError(await failure(response));
        return;
      }
      setNote(trigger === 'cancel' ? p('cancelledNote') : p('done'));
      setStep('done');
      router.refresh();
    } catch {
      setError(p('error'));
    } finally {
      setBusy(false);
    }
  }

  async function next(): Promise<void> {
    if (reason === '') return;
    setBusy(true);
    setError(null);
    try {
      const response = await fetch(`/api/retention/offer?trigger=${trigger}&reasonCode=${reason}`);
      const parsed = offerBody.safeParse(await response.json().catch(() => null));
      if (!response.ok || !parsed.success) {
        // Without an offer the flow goes straight on: a failed lookup must never trap a company that wants to leave.
        setOffer(null);
        setStep('offer');
        return;
      }
      setOffer(parsed.data.data);
      setStep('offer');
    } catch {
      setOffer(null);
      setStep('offer');
    } finally {
      setBusy(false);
    }
  }

  async function keep(): Promise<void> {
    if (reason === '') return;
    setBusy(true);
    setError(null);
    try {
      const response = await fetch('/api/retention/saved', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          trigger,
          reasonCode: reason,
          detail,
          offerId: offer?.id ?? null,
          planTo: trigger === 'downgrade' ? planTo : null,
        }),
      });
      if (!response.ok) {
        setError(await failure(response));
        return;
      }
      setNote(p('kept'));
      setStep('done');
    } catch {
      setError(p('error'));
    } finally {
      setBusy(false);
    }
  }

  const select = 'w-full rounded-md border bg-background px-sp-8 py-sp-4 text-sm';
  return (
    <div className="space-y-sp-8">
      {step === 'ask' ? (
        <>
          {trigger === 'downgrade' ? (
            <>
              <label className="block text-sm font-medium" htmlFor="rf-plan">
                {p('targetPlan')}
              </label>
              <select
                id="rf-plan"
                className={select}
                value={planTo}
                onChange={(e) => setPlanTo(e.target.value)}
              >
                {lowerPlans.map((l) => (
                  <option key={l.slug} value={l.slug}>
                    {l.name}
                  </option>
                ))}
              </select>
            </>
          ) : null}
          <label className="block text-sm font-medium" htmlFor={`rf-reason-${trigger}`}>
            {p('why')}
          </label>
          <select
            id={`rf-reason-${trigger}`}
            className={select}
            value={reason}
            onChange={(e) => setReason(e.target.value as ReasonCode | '')}
          >
            <option value="">{p('pick')}</option>
            {REASON_CODES.map((c) => (
              <option key={c} value={c}>
                {reasonLabel(c)}
              </option>
            ))}
          </select>
          <label className="block text-sm font-medium" htmlFor={`rf-detail-${trigger}`}>
            {p('detail')}
          </label>
          <Input
            id={`rf-detail-${trigger}`}
            value={detail}
            maxLength={500}
            onChange={(e) => setDetail(e.target.value)}
          />
          <Button type="button" disabled={busy || reason === ''} onClick={() => void next()}>
            {p('next')}
          </Button>
        </>
      ) : null}
      {step === 'offer' ? (
        <>
          {offer ? (
            <div
              className="space-y-sp-4 rounded-lg border bg-background p-sp-12"
              role="group"
              aria-label={p('offerFor')}
            >
              <p className="text-sm text-muted-foreground">{p('offerFor')}</p>
              <p className="font-medium">{offer.title}</p>
              <p className="whitespace-pre-wrap break-words text-sm">{offer.message}</p>
              {offer.couponCode ? (
                <p className="text-sm">
                  {p('useCoupon')} <code>{offer.couponCode}</code>
                </p>
              ) : null}
            </div>
          ) : null}
          <div className="flex flex-wrap gap-sp-8">
            {offer ? (
              <Button type="button" disabled={busy} onClick={() => void keep()}>
                {p('keep')}
              </Button>
            ) : null}
            <Button
              type="button"
              variant={offer ? 'outline' : 'destructive'}
              disabled={busy}
              onClick={() => void proceed()}
            >
              {trigger === 'cancel' ? p('proceedCancel') : p('proceedDowngrade')}
            </Button>
          </div>
        </>
      ) : null}
      {step === 'done' && note ? (
        <p role="status" className="text-sm">
          {note}
        </p>
      ) : null}
      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}
    </div>
  );
}
