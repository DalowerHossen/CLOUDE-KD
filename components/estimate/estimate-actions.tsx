// path: components/estimate/estimate-actions.tsx
'use client';
import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { z } from 'zod';
import { callJson } from '@/components/invoice/api-call';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { canConvert, canRevise, canVoid, type EstimateStatus } from '@/lib/estimate/status';
import { t } from '@/lib/i18n';

const convertBody = z.object({
  invoice: z.object({ id: z.string() }),
  totalsChanged: z.boolean(),
});

export function EstimateActions({
  id,
  status,
  trashed,
  canUpdate,
  canSend,
  canConvertRight,
  canDelete,
  isOwner,
}: {
  id: string;
  status: EstimateStatus;
  trashed: boolean;
  canUpdate: boolean;
  canSend: boolean;
  canConvertRight: boolean;
  canDelete: boolean;
  isOwner: boolean;
}): JSX.Element {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<{ ok: boolean; text: string } | null>(null);
  const [message, setMessage] = useState('');
  const [reason, setReason] = useState('');
  const sendKey = useRef(crypto.randomUUID());
  const convertKey = useRef(crypto.randomUUID());

  async function run(
    url: string,
    method: 'POST' | 'DELETE',
    body: unknown,
    done: (data: unknown) => string | null,
    headers: Record<string, string> = {},
  ): Promise<void> {
    setBusy(true);
    setNote(null);
    const r = await callJson(url, method, body, headers);
    if (r.ok) {
      const text = done(r.data);
      if (text) setNote({ ok: true, text });
      router.refresh();
    } else setNote({ ok: false, text: r.message ?? t('s09Estimates.messages.error') });
    setBusy(false);
  }

  return (
    <div className="space-y-sp-12 text-sm print:hidden">
      <div className="flex flex-wrap gap-sp-8">
        <Button asChild variant="outline">
          <a href={`/api/pdf/estimates/${id}`} target="_blank" rel="noopener noreferrer">
            {t('s09Estimates.actions.pdf')}
          </a>
        </Button>
        {canUpdate && !trashed && canRevise(status) ? (
          <Button
            type="button"
            variant="outline"
            disabled={busy}
            onClick={() =>
              void run(`/api/estimates/${id}/revise`, 'POST', undefined, () =>
                t('s09Estimates.messages.revised'),
              )
            }
          >
            {t('s09Estimates.actions.revise')}
          </Button>
        ) : null}
        {canConvertRight && !trashed && canConvert(status) ? (
          <Button
            type="button"
            disabled={busy}
            onClick={() =>
              void run(
                `/api/estimates/${id}/convert`,
                'POST',
                undefined,
                (d) => {
                  const parsed = convertBody.safeParse(d);
                  if (parsed.success) {
                    convertKey.current = crypto.randomUUID();
                    router.push(`/invoices/${parsed.data.invoice.id}`);
                    return parsed.data.totalsChanged
                      ? t('s09Estimates.messages.convertedChanged')
                      : t('s09Estimates.messages.converted');
                  }
                  return null;
                },
                { 'idempotency-key': convertKey.current },
              )
            }
          >
            {t('s09Estimates.actions.convert')}
          </Button>
        ) : null}
        {canDelete && !trashed && status === 'draft' ? (
          <Button
            type="button"
            variant="outline"
            disabled={busy}
            onClick={() => {
              if (window.confirm(t('s09Estimates.actions.confirmTrash')))
                void run(`/api/estimates/${id}`, 'DELETE', undefined, () => {
                  router.push('/estimates');
                  return null;
                });
            }}
          >
            {t('s09Estimates.actions.trash')}
          </Button>
        ) : null}
        {canDelete && trashed ? (
          <Button
            type="button"
            disabled={busy}
            onClick={() => void run(`/api/estimates/${id}/restore`, 'POST', undefined, () => null)}
          >
            {t('s09Estimates.actions.restore')}
          </Button>
        ) : null}
      </div>
      {canSend && !trashed && status === 'draft' ? (
        <div className="space-y-sp-8">
          <label className="block">
            {t('s09Estimates.actions.sendMessage')}
            <Input maxLength={1000} value={message} onChange={(e) => setMessage(e.target.value)} />
          </label>
          <Button
            type="button"
            disabled={busy}
            onClick={() =>
              void run(
                `/api/estimates/${id}/send`,
                'POST',
                { message },
                (d) => {
                  sendKey.current = crypto.randomUUID();
                  const parsed = z.object({ emailed: z.boolean() }).safeParse(d);
                  return parsed.success && parsed.data.emailed
                    ? t('s09Estimates.messages.sent')
                    : t('s09Estimates.messages.sentNoEmail');
                },
                { 'idempotency-key': sendKey.current },
              )
            }
          >
            {busy ? t('s09Estimates.actions.sending') : t('s09Estimates.actions.send')}
          </Button>
        </div>
      ) : null}
      {isOwner && !trashed && canVoid(status) ? (
        <form
          className="flex flex-wrap items-end gap-sp-8"
          onSubmit={(e) => {
            e.preventDefault();
            void run(`/api/estimates/${id}/void`, 'POST', { reason }, () => {
              setReason('');
              return t('s09Estimates.messages.voided');
            });
          }}
        >
          <label>
            {t('s09Estimates.actions.voidReason')}
            <Input
              minLength={3}
              maxLength={300}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
            />
          </label>
          <Button type="submit" variant="outline" disabled={busy || reason.trim().length < 3}>
            {t('s09Estimates.actions.void')}
          </Button>
        </form>
      ) : null}
      {note ? (
        <p role={note.ok ? 'status' : 'alert'} className={note.ok ? undefined : 'text-destructive'}>
          {note.text}
        </p>
      ) : null}
    </div>
  );
}
