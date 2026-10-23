// path: components/dunning/collection-panel.tsx
'use client';
import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { callJson } from '@/components/invoice/api-call';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { t } from '@/lib/i18n';
import { Money } from '@/lib/utils/currency';
import { formatMoney } from '@/lib/utils/formatting';

export interface CollectionProps {
  invoiceId: string;
  balance: string;
  canRemind: boolean;
  canWriteOff: boolean;
  log: { stepKey: string; status: string; createdAt: string }[];
  holds: { id: string; kind: string; untilDate: string | null; active: boolean; note: string }[];
  writeOffs: { id: string; amount: string; reason: string; createdAt: string }[];
  fees: { id: string; periodKey: string; amount: string; status: string }[];
  today: string;
}

export function CollectionPanel(p: CollectionProps): JSX.Element {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<{ ok: boolean; text: string } | null>(null);
  const [message, setMessage] = useState('');
  const [promiseDate, setPromiseDate] = useState(p.today);
  const [holdNote, setHoldNote] = useState('');
  const [amount, setAmount] = useState(Money.parse(p.balance).toDbString());
  const [reason, setReason] = useState('');
  const writeKey = useRef(crypto.randomUUID());
  const active = p.holds.find((h) => h.active);

  async function call(
    url: string,
    method: 'POST' | 'PUT' | 'DELETE',
    body: unknown,
    ok: string,
    headers: Record<string, string> = {},
  ): Promise<boolean> {
    setBusy(true);
    setNote(null);
    const r = await callJson(url, method, body, headers);
    if (r.ok) {
      setNote({ ok: true, text: ok });
      router.refresh();
    } else setNote({ ok: false, text: r.message ?? t('s09Dunning.panel.error') });
    setBusy(false);
    return r.ok;
  }

  return (
    <section className="space-y-sp-16 text-sm print:hidden">
      <h2 className="text-lg font-semibold">{t('s09Dunning.panel.title')}</h2>

      <div className="space-y-sp-8">
        <h3 className="font-medium">{t('s09Dunning.panel.remindersTitle')}</h3>
        {p.log.length === 0 ? (
          <p className="text-muted-foreground">{t('s09Dunning.panel.logNone')}</p>
        ) : (
          <ul className="list-disc pl-sp-16">
            {p.log.slice(0, 8).map((l, i) => (
              <li key={i}>
                {t('s09Dunning.panel.logLine', {
                  date: l.createdAt.slice(0, 10),
                  status: l.status,
                  step: l.stepKey.startsWith('manual') ? 'by hand' : `day ${l.stepKey}`,
                })}
              </li>
            ))}
          </ul>
        )}
        {p.canRemind ? (
          <div className="flex flex-wrap items-end gap-sp-8">
            <label>
              {t('s09Dunning.panel.sendMessage')}
              <Input
                maxLength={1000}
                value={message}
                onChange={(e) => setMessage(e.target.value)}
              />
            </label>
            <Button
              type="button"
              variant="outline"
              disabled={busy}
              onClick={() =>
                void call(
                  `/api/invoices/${p.invoiceId}/reminders`,
                  'POST',
                  { message },
                  t('s09Dunning.panel.sent'),
                )
              }
            >
              {t('s09Dunning.panel.sendNow')}
            </Button>
          </div>
        ) : null}
      </div>

      {p.canRemind ? (
        <div className="space-y-sp-8">
          <h3 className="font-medium">{t('s09Dunning.panel.holdTitle')}</h3>
          {active ? (
            <>
              <p>
                {t('s09Dunning.panel.holdActive', {
                  until: active.untilDate
                    ? t('s09Dunning.panel.holdUntil', { date: active.untilDate })
                    : '',
                })}
              </p>
              <Button
                type="button"
                variant="outline"
                disabled={busy}
                onClick={() =>
                  void call(
                    `/api/invoices/${p.invoiceId}/reminders`,
                    'DELETE',
                    undefined,
                    t('s09Dunning.panel.resume'),
                  )
                }
              >
                {t('s09Dunning.panel.resume')}
              </Button>
            </>
          ) : (
            <div className="flex flex-wrap items-end gap-sp-8">
              <label>
                {t('s09Dunning.panel.promise')}
                <Input
                  type="date"
                  min={p.today}
                  value={promiseDate}
                  onChange={(e) => setPromiseDate(e.target.value)}
                />
              </label>
              <label>
                {t('s09Dunning.panel.note')}
                <Input
                  maxLength={300}
                  value={holdNote}
                  onChange={(e) => setHoldNote(e.target.value)}
                />
              </label>
              <Button
                type="button"
                variant="outline"
                disabled={busy}
                onClick={() =>
                  void call(
                    `/api/invoices/${p.invoiceId}/reminders`,
                    'PUT',
                    { kind: 'promise', untilDate: promiseDate, note: holdNote },
                    t('s09Dunning.panel.promiseSave'),
                  )
                }
              >
                {t('s09Dunning.panel.promiseSave')}
              </Button>
              <Button
                type="button"
                variant="outline"
                disabled={busy}
                onClick={() =>
                  void call(
                    `/api/invoices/${p.invoiceId}/reminders`,
                    'PUT',
                    { kind: 'pause', untilDate: null, note: holdNote },
                    t('s09Dunning.panel.pause'),
                  )
                }
              >
                {t('s09Dunning.panel.pause')}
              </Button>
            </div>
          )}
        </div>
      ) : null}

      {p.fees.length > 0 ? (
        <div className="space-y-sp-4">
          <h3 className="font-medium">{t('s09Dunning.panel.feesTitle')}</h3>
          <ul className="list-disc pl-sp-16">
            {p.fees.map((f) => (
              <li key={f.id}>
                {f.periodKey}: {formatMoney(Money.parse(f.amount))} ({f.status})
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {p.writeOffs.length > 0 ? (
        <div className="space-y-sp-4">
          <h3 className="font-medium">{t('s09Dunning.panel.writeOffsTitle')}</h3>
          <ul className="list-disc pl-sp-16">
            {p.writeOffs.map((w) => (
              <li key={w.id}>
                {w.createdAt.slice(0, 10)}: {formatMoney(Money.parse(w.amount))} - {w.reason}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {p.canWriteOff && Money.parse(p.balance).isPositive() ? (
        <details className="rounded-lg border p-sp-12">
          <summary className="cursor-pointer font-medium">
            {t('s09Dunning.panel.writeOffTitle')}
          </summary>
          <form
            className="mt-sp-8 space-y-sp-8"
            onSubmit={(e) => {
              e.preventDefault();
              if (!window.confirm(t('s09Dunning.panel.writeOffConfirm'))) return;
              void call(
                `/api/invoices/${p.invoiceId}/write-off`,
                'POST',
                { amount: amount.trim(), reason: reason.trim() },
                t('s09Dunning.panel.writtenOff'),
                { 'idempotency-key': writeKey.current },
              ).then((ok) => {
                if (ok) writeKey.current = crypto.randomUUID();
              });
            }}
          >
            <p className="text-muted-foreground">{t('s09Dunning.panel.writeOffHelp')}</p>
            <label className="block">
              {t('s09Dunning.panel.writeOffAmount')}
              <Input
                inputMode="decimal"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
              />
            </label>
            <label className="block">
              {t('s09Dunning.panel.writeOffReason')}
              <Input
                minLength={10}
                maxLength={500}
                value={reason}
                onChange={(e) => setReason(e.target.value)}
              />
            </label>
            <Button type="submit" variant="outline" disabled={busy || reason.trim().length < 10}>
              {t('s09Dunning.panel.writeOffButton')}
            </Button>
          </form>
        </details>
      ) : null}
      {note ? (
        <p role={note.ok ? 'status' : 'alert'} className={note.ok ? undefined : 'text-destructive'}>
          {note.text}
        </p>
      ) : null}
    </section>
  );
}
