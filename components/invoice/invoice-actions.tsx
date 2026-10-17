// path: components/invoice/invoice-actions.tsx
'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { z } from 'zod';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { NativeSelect } from '@/components/ui/native-select';
import { t, type StringKey } from '@/lib/i18n';
import { nextStatuses } from '@/lib/invoice/status';
import type { InvoiceStatus } from '@/types/contracts';
import { callJson } from './api-call';

const idBody = z.object({ id: z.string() });

export function InvoiceActions({
  id,
  status,
  trashed,
  hasNumber,
  canCreate,
  canDelete,
  isOwner,
}: {
  id: string;
  status: InvoiceStatus;
  trashed: boolean;
  hasNumber: boolean;
  canCreate: boolean;
  canDelete: boolean;
  isOwner: boolean;
}): JSX.Element {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<{ ok: boolean; text: string } | null>(null);
  const [target, setTarget] = useState<InvoiceStatus | ''>('');
  const [reason, setReason] = useState('');
  const [number, setNumber] = useState('');
  const key = crypto.randomUUID();

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

  const options = nextStatuses(status).filter((s) => s !== 'draft' && s !== 'pending_approval');
  return (
    <div className="space-y-sp-12 text-sm print:hidden">
      <div className="flex flex-wrap gap-sp-8">
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
