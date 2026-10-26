// path: app/(admin)/admin/retention/_components/retention-manager.tsx
'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { t } from '@/lib/i18n';
import { REASON_CODES, TRIGGERS, type ReasonCode, type Trigger } from '@/lib/platform/retention';
import type { OfferView, SurveySummary } from '@/services/platform/retention';
import { sendJson } from '../../_components/post-json';

const p = (k: string): string => t(`s16Growth.retention.${k}` as never);
const reasonLabel = (c: ReasonCode): string => t(`s16Growth.retention.reasons.${c}` as never);

export function RetentionManager({
  offers,
  summary,
}: {
  offers: OfferView[];
  summary: SurveySummary | null;
}): JSX.Element {
  const router = useRouter();
  const [trigger, setTrigger] = useState<Trigger>('cancel');
  const [reason, setReason] = useState<ReasonCode | ''>('');
  const [title, setTitle] = useState('');
  const [message, setMessage] = useState('');
  const [coupon, setCoupon] = useState('');
  const [result, setResult] = useState<{ ok: boolean; text: string } | null>(null);

  async function send(payload: Record<string, unknown>, after?: () => void): Promise<void> {
    setResult(null);
    const error = await sendJson('/api/admin/retention', 'POST', payload);
    if (error) setResult({ ok: false, text: error });
    else {
      setResult({ ok: true, text: p('saved') });
      after?.();
      router.refresh();
    }
  }

  const field = 'block text-sm font-medium';
  const select = 'w-full rounded-md border bg-background px-sp-8 py-sp-4 text-sm';
  return (
    <div className="space-y-sp-16">
      <section className="space-y-sp-8 rounded-lg border bg-card p-sp-16">
        <h2 className="text-h4 font-semibold">{p('summaryTitle')}</h2>
        {summary === null || summary.total === 0 ? (
          <p className="text-sm text-muted-foreground">{p('summaryEmpty')}</p>
        ) : (
          <>
            <p className="text-sm">
              {p('summaryTotal')}: {summary.total} - {p('summarySaved')}: {summary.saved} -{' '}
              {p('summaryRate')}:{' '}
              {summary.saveRatePercent === null ? p('rateNone') : `${summary.saveRatePercent}%`}
            </p>
            <ul className="divide-y rounded-lg border text-sm">
              {summary.byReason.map((r) => (
                <li
                  key={`${r.trigger}-${r.reason}`}
                  className="flex flex-wrap justify-between gap-sp-8 p-sp-12"
                >
                  <span>
                    {p(`trigger_${r.trigger}`)}: {reasonLabel(r.reason)}
                  </span>
                  <span>
                    {r.total} ({p('summarySaved')} {r.saved})
                  </span>
                </li>
              ))}
            </ul>
          </>
        )}
      </section>
      <section className="space-y-sp-8 rounded-lg border bg-card p-sp-16">
        <div className="grid gap-sp-8 sm:grid-cols-2">
          <div>
            <label className={field} htmlFor="o-trigger">
              {p('trigger')}
            </label>
            <select
              id="o-trigger"
              className={select}
              value={trigger}
              onChange={(e) => setTrigger(e.target.value as Trigger)}
            >
              {TRIGGERS.map((x) => (
                <option key={x} value={x}>
                  {p(`trigger_${x}`)}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className={field} htmlFor="o-reason">
              {p('reason')}
            </label>
            <select
              id="o-reason"
              className={select}
              value={reason}
              onChange={(e) => setReason(e.target.value as ReasonCode | '')}
            >
              <option value="">{p('anyReason')}</option>
              {REASON_CODES.map((c) => (
                <option key={c} value={c}>
                  {reasonLabel(c)}
                </option>
              ))}
            </select>
          </div>
        </div>
        <label className={field} htmlFor="o-title">
          {p('offerTitle')}
        </label>
        <Input
          id="o-title"
          value={title}
          maxLength={100}
          onChange={(e) => setTitle(e.target.value)}
        />
        <label className={field} htmlFor="o-message">
          {p('message')}
        </label>
        <Textarea
          id="o-message"
          value={message}
          maxLength={600}
          onChange={(e) => setMessage(e.target.value)}
        />
        <label className={field} htmlFor="o-coupon">
          {p('coupon')}
        </label>
        <Input
          id="o-coupon"
          value={coupon}
          maxLength={32}
          onChange={(e) => setCoupon(e.target.value)}
        />
        <Button
          type="button"
          disabled={title.trim().length < 3 || message.trim().length < 3}
          onClick={() =>
            void send(
              {
                action: 'save',
                trigger,
                reasonCode: reason === '' ? null : reason,
                title,
                message,
                couponCode: coupon.trim() === '' ? null : coupon.trim(),
              },
              () => {
                setTitle('');
                setMessage('');
                setCoupon('');
              },
            )
          }
        >
          {p('add')}
        </Button>
      </section>
      {result ? (
        <p
          role={result.ok ? 'status' : 'alert'}
          className={result.ok ? 'text-sm' : 'text-sm text-destructive'}
        >
          {result.text}
        </p>
      ) : null}
      {offers.length === 0 ? (
        <p className="text-sm text-muted-foreground">{p('offersEmpty')}</p>
      ) : (
        <ul className="space-y-sp-8">
          {offers.map((o) => (
            <li key={o.id} className="space-y-1 rounded-lg border bg-card p-sp-12 text-sm">
              <div className="flex flex-wrap items-center justify-between gap-sp-8">
                <p className="font-medium">{o.title}</p>
                <span className="flex items-center gap-sp-8">
                  <Badge variant="outline">
                    {o.status === 'active' ? p('active') : p('disabled')}
                  </Badge>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() =>
                      void send({ action: o.status === 'active' ? 'disable' : 'enable', id: o.id })
                    }
                  >
                    {o.status === 'active' ? p('disable') : p('enable')}
                  </Button>
                </span>
              </div>
              <p className="whitespace-pre-wrap break-words">{o.message}</p>
              <p className="text-muted-foreground">
                {p(`trigger_${o.triggerKind}`)} -{' '}
                {o.reasonCode ? reasonLabel(o.reasonCode) : p('anyReason')}
                {o.couponCode ? ` - ${o.couponCode}` : ''}
              </p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
