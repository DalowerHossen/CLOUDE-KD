// path: components/invoice/invoice-actions.tsx
'use client';
import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { z } from 'zod';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { NativeSelect } from '@/components/ui/native-select';
import { t, type StringKey } from '@/lib/i18n';
import { nextStatuses } from '@/lib/invoice/status';
import type { InvoiceStatus } from '@/types/contracts';
import { Money } from '@/lib/utils/currency';
import { formatMoney } from '@/lib/utils/formatting';
import { callJson } from './api-call';

const idBody = z.object({ id: z.string() });
const isSentStatus = (s: InvoiceStatus): boolean =>
  s !== 'draft' && s !== 'pending_approval' && s !== 'void';

export function InvoiceActions({
  id,
  status,
  kind,
  amountPaid,
  trashed,
  hasNumber,
  canCreate,
  canDelete,
  canSend,
  isOwner,
}: {
  id: string;
  status: InvoiceStatus;
  kind: string;
  amountPaid: string;
  trashed: boolean;
  hasNumber: boolean;
  canCreate: boolean;
  canDelete: boolean;
  canSend: boolean;
  isOwner: boolean;
}): JSX.Element {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<{ ok: boolean; text: string } | null>(null);
  const [target, setTarget] = useState<InvoiceStatus | ''>('');
  const [reason, setReason] = useState('');
  const [number, setNumber] = useState('');
  const [message, setMessage] = useState('');
  const [similar, setSimilar] = useState<
    { id: string; number: string | null; total: string; issueDate: string }[] | null
  >(null);
  const [voidReason, setVoidReason] = useState('');
  const [ackPaid, setAckPaid] = useState(false);
  const key = crypto.randomUUID();
  const sendKey = useRef(crypto.randomUUID());

  async function run(
    url: string,
    method: 'POST' | 'DELETE',
    body: unknown,
    after: (data: unknown) => void,
    headers: Record<string, string> = {},
  ): Promise<void> {
    setBusy(true);
    setNote(null);
    const r = await callJson(url, method, body, headers);
    if (r.ok) after(r.data);
    else setNote({ ok: false, text: r.message ?? t('s09Invoicing.invoices.error') });
    setBusy(false);
  }

  async function send(confirmDuplicate: boolean): Promise<void> {
    setBusy(true);
    setNote(null);
    const r = await callJson(
      `/api/invoices/${id}/send`,
      'POST',
      { confirmDuplicate, message },
      { 'idempotency-key': sendKey.current },
    );
    if (r.ok) {
      const d = r.data as { outcome?: string; emailed?: boolean } | null;
      setSimilar(null);
      sendKey.current = crypto.randomUUID();
      setNote({
        ok: true,
        text:
          d?.outcome === 'waiting'
            ? t('s09Invoicing.invoices.waitingDone')
            : d?.emailed
              ? t('s09Invoicing.invoices.sentDone')
              : t('s09Invoicing.invoices.sentNoEmail'),
      });
      router.refresh();
    } else if (r.status === 409 && r.message && r.message.includes('similar')) {
      const list = await callJson(`/api/invoices/${id}/similar`, 'GET');
      setSimilar(Array.isArray(list.data) ? (list.data as NonNullable<typeof similar>) : []);
      sendKey.current = crypto.randomUUID();
    } else setNote({ ok: false, text: r.message ?? t('s09Invoicing.invoices.error') });
    setBusy(false);
  }

  const options = nextStatuses(status).filter((s) => s !== 'draft' && s !== 'pending_approval');
  return (
    <div className="space-y-sp-12 text-sm print:hidden">
      <div className="flex flex-wrap gap-sp-8">
        <Button asChild variant="outline">
          <a href={`/api/pdf/invoices/${id}`} target="_blank" rel="noopener noreferrer">
            {t('s09Invoicing.invoices.pdf')}
          </a>
        </Button>
        {canCreate && !trashed && kind === 'proforma' && isSentStatus(status) ? (
          <Button
            type="button"
            disabled={busy}
            onClick={() =>
              void run(
                `/api/invoices/${id}/convert`,
                'POST',
                undefined,
                (d) => {
                  const copy = idBody.safeParse(d);
                  if (copy.success) router.push(`/invoices/${copy.data.id}`);
                },
                { 'idempotency-key': key },
              )
            }
          >
            {t('s09Invoicing.invoices.convertProforma')}
          </Button>
        ) : null}
        {canCreate && !trashed ? (
          <Button
            type="button"
            variant="outline"
            disabled={busy}
            onClick={() =>
              void run(
                `/api/invoices/${id}/clone`,
                'POST',
                undefined,
                (d) => {
                  const copy = idBody.safeParse(d);
                  if (copy.success) router.push(`/invoices/${copy.data.id}`);
                },
                { 'idempotency-key': key },
              )
            }
          >
            {t('s09Invoicing.invoices.clone')}
          </Button>
        ) : null}
        {canDelete && !trashed && (status === 'draft' || status === 'void') ? (
          <Button
            type="button"
            variant="outline"
            disabled={busy}
            onClick={() => {
              if (!window.confirm(t('s09Invoicing.invoices.confirmTrash'))) return;
              void run(`/api/invoices/${id}`, 'DELETE', undefined, () => router.push('/invoices'));
            }}
          >
            {t('s09Invoicing.invoices.trash')}
          </Button>
        ) : null}
        {canDelete && trashed ? (
          <Button
            type="button"
            disabled={busy}
            onClick={() =>
              void run(`/api/invoices/${id}/restore`, 'POST', undefined, () => {
                setNote({ ok: true, text: t('s09Invoicing.invoices.restored') });
                router.refresh();
              })
            }
          >
            {t('s09Invoicing.invoices.restore')}
          </Button>
        ) : null}
      </div>
      {canSend && status === 'draft' && !trashed ? (
        <div className="space-y-sp-8 rounded-lg border bg-card p-sp-12">
          <label className="block">
            {t('s09Invoicing.invoices.sendMessage')}
            <Input value={message} maxLength={1000} onChange={(e) => setMessage(e.target.value)} />
          </label>
          <Button type="button" disabled={busy} onClick={() => void send(false)}>
            {isOwner
              ? t('s09Invoicing.invoices.send')
              : t('s09Invoicing.invoices.submitForApproval')}
          </Button>
          {similar && similar.length > 0 ? (
            <div role="alert" className="space-y-sp-4">
              <p className="font-medium">{t('s09Invoicing.invoices.duplicateTitle')}</p>
              <p>{t('s09Invoicing.invoices.duplicateHelp')}</p>
              <ul className="list-disc pl-sp-16">
                {similar.map((s) => (
                  <li key={s.id}>
                    <a className="underline" href={`/invoices/${s.id}`}>
                      {s.number ?? t('s09Invoicing.invoices.draftNumber')}
                    </a>{' '}
                    - {s.issueDate} - {s.total}
                  </li>
                ))}
              </ul>
              <Button
                type="button"
                variant="outline"
                disabled={busy}
                onClick={() => void send(true)}
              >
                {t('s09Invoicing.invoices.sendAnyway')}
              </Button>
            </div>
          ) : null}
        </div>
      ) : null}
      {canSend && status === 'pending_approval' && !trashed ? (
        <Button
          type="button"
          variant="outline"
          disabled={busy}
          onClick={() =>
            void run(`/api/invoices/${id}/withdraw`, 'POST', undefined, () => router.refresh())
          }
        >
          {t('s09Invoicing.invoices.withdraw')}
        </Button>
      ) : null}
      {isOwner && status !== 'void' && status !== 'paid' && !trashed ? (
        <form
          className="flex flex-wrap items-end gap-sp-8"
          onSubmit={(e) => {
            e.preventDefault();
            if (!window.confirm(t('s09Invoicing.invoices.voidConfirm'))) return;
            void run(
              `/api/invoices/${id}/void`,
              'POST',
              { reason: voidReason, acknowledgePayments: ackPaid },
              () => {
                setVoidReason('');
                setNote({ ok: true, text: t('s09Invoicing.invoices.voidDone') });
                router.refresh();
              },
            );
          }}
        >
          <label>
            {t('s09Invoicing.invoices.voidReason')}
            <Input
              value={voidReason}
              maxLength={300}
              onChange={(e) => setVoidReason(e.target.value)}
            />
          </label>
          {Money.parse(amountPaid).isPositive() ? (
            <label className="flex items-center gap-sp-8">
              <input
                type="checkbox"
                checked={ackPaid}
                onChange={(e) => setAckPaid(e.target.checked)}
              />
              {t('s09Invoicing.invoices.voidPaidConfirm', {
                amount: formatMoney(Money.parse(amountPaid)),
              })}
            </label>
          ) : null}
          <Button
            type="submit"
            variant="outline"
            disabled={
              busy ||
              voidReason.trim().length < 3 ||
              (Money.parse(amountPaid).isPositive() && !ackPaid)
            }
          >
            {t('s09Invoicing.invoices.voidApply')}
          </Button>
        </form>
      ) : null}
      {isOwner && status === 'draft' && !hasNumber && !trashed ? (
        <form
          className="flex flex-wrap items-end gap-sp-8"
          onSubmit={(e) => {
            e.preventDefault();
            void run(`/api/invoices/${id}/number`, 'POST', { number }, () => {
              setNumber('');
              router.refresh();
            });
          }}
        >
          <label>
            {t('s09Invoicing.invoices.invoiceNumberTyped')}
            <Input value={number} maxLength={40} onChange={(e) => setNumber(e.target.value)} />
          </label>
          <Button type="submit" variant="outline" disabled={busy || number === ''}>
            {t('s09Invoicing.invoices.numberSave')}
          </Button>
          <span className="w-full text-xs text-muted-foreground">
            {t('s09Invoicing.invoices.numberHelp')}
          </span>
        </form>
      ) : null}
      {isOwner && options.length > 0 && !trashed ? (
        <form
          className="flex flex-wrap items-end gap-sp-8"
          onSubmit={(e) => {
            e.preventDefault();
            if (target === '') return;
            void run(`/api/invoices/${id}/status`, 'POST', { status: target, reason }, () => {
              setReason('');
              setTarget('');
              setNote({ ok: true, text: t('s09Invoicing.invoices.overrideDone') });
              router.refresh();
            });
          }}
        >
          <label>
            {t('s09Invoicing.invoices.override')}
            <NativeSelect
              value={target}
              onChange={(e) => setTarget(options.find((o) => o === e.target.value) ?? '')}
            >
              <option value="" />
              {options.map((o) => (
                <option key={o} value={o}>
                  {t(`s09Invoicing.invoices.statuses.${o}` as StringKey)}
                </option>
              ))}
            </NativeSelect>
          </label>
          <label>
            {t('s09Invoicing.invoices.overrideReason')}
            <Input value={reason} maxLength={300} onChange={(e) => setReason(e.target.value)} />
          </label>
          <Button
            type="submit"
            variant="outline"
            disabled={busy || target === '' || reason.trim().length < 3}
          >
            {t('s09Invoicing.invoices.overrideApply')}
          </Button>
        </form>
      ) : null}
      {note ? (
        <p role={note.ok ? 'status' : 'alert'} className={note.ok ? '' : 'text-destructive'}>
          {note.text}
        </p>
      ) : null}
    </div>
  );
}
