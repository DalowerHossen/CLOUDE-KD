// path: components/credit/credit-actions.tsx
'use client';
import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { z } from 'zod';
import { callJson } from '@/components/invoice/api-call';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { t } from '@/lib/i18n';
import { Money } from '@/lib/utils/currency';
import { formatMoney } from '@/lib/utils/formatting';

const issueBody = z.object({ applied: z.string() });

export function CreditActions({
  id,
  status,
  canIssue,
  canVoid,
  canCreate,
  applied,
}: {
  id: string;
  status: 'draft' | 'issued' | 'void';
  canIssue: boolean;
  canVoid: boolean;
  canCreate: boolean;
  applied: boolean;
}): JSX.Element {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [autoApply, setAutoApply] = useState(true);
  const [reason, setReason] = useState('');
  const [note, setNote] = useState<{ ok: boolean; text: string } | null>(null);
  const key = useRef(crypto.randomUUID());

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
    } else setNote({ ok: false, text: r.message ?? t('s09Credits.messages.error') });
    setBusy(false);
  }

  return (
    <div className="space-y-sp-12 text-sm print:hidden">
      <div className="flex flex-wrap gap-sp-8">
        <Button asChild variant="outline">
          <a href={`/api/pdf/credit-notes/${id}`} target="_blank" rel="noopener noreferrer">
            {t('s09Credits.actions.pdf')}
          </a>
        </Button>
        {status === 'draft' && canCreate ? (
          <Button
            type="button"
            variant="outline"
            disabled={busy}
            onClick={() => {
              if (window.confirm(t('s09Credits.actions.confirmTrash')))
                void run(`/api/credit-notes/${id}`, 'DELETE', undefined, () => {
                  router.push('/credit-notes');
                  return null;
                });
            }}
          >
            {t('s09Credits.actions.trash')}
          </Button>
        ) : null}
      </div>
      {status === 'draft' && canIssue ? (
        <div className="space-y-sp-8">
          <label className="flex items-center gap-sp-8">
            <input
              type="checkbox"
              checked={autoApply}
              onChange={(e) => setAutoApply(e.target.checked)}
            />
            {t('s09Credits.actions.issueAndApply')}
          </label>
          <Button
            type="button"
            disabled={busy}
            onClick={() =>
              void run(
                `/api/credit-notes/${id}/issue`,
                'POST',
                { autoApply },
                (d) => {
                  key.current = crypto.randomUUID();
                  const parsed = issueBody.safeParse(d);
                  return parsed.success && Money.parse(parsed.data.applied).isPositive()
                    ? t('s09Credits.messages.issuedApplied', {
                        amount: formatMoney(Money.parse(parsed.data.applied)),
                      })
                    : t('s09Credits.messages.issued');
                },
                { 'idempotency-key': key.current },
              )
            }
          >
            {busy ? t('s09Credits.actions.issuing') : t('s09Credits.actions.issue')}
          </Button>
        </div>
      ) : null}
      {status === 'issued' && canVoid && !applied ? (
        <form
          className="flex flex-wrap items-end gap-sp-8"
          onSubmit={(e) => {
            e.preventDefault();
            void run(`/api/credit-notes/${id}/void`, 'POST', { reason }, () =>
              t('s09Credits.messages.voided'),
            );
          }}
        >
          <label>
            {t('s09Credits.actions.voidReason')}
            <Input
              minLength={3}
              maxLength={300}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
            />
          </label>
          <Button type="submit" variant="outline" disabled={busy || reason.trim().length < 3}>
            {t('s09Credits.actions.void')}
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
