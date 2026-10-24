// path: components/invoice/recurring-actions.tsx
'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { z } from 'zod';
import { Button } from '@/components/ui/button';
import { t } from '@/lib/i18n';
import { callJson } from './api-call';

const runBody = z.object({ sent: z.boolean() });

export function RecurringActions({
  id,
  status,
}: {
  id: string;
  status: 'active' | 'paused' | 'ended';
}): JSX.Element {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<{ ok: boolean; text: string } | null>(null);

  async function act(action: 'pause' | 'resume' | 'end' | 'run_now'): Promise<void> {
    setBusy(true);
    setNote(null);
    const r = await callJson(`/api/invoices/recurring/${id}`, 'POST', { action });
    if (r.ok) {
      const run = runBody.safeParse(r.data);
      setNote({
        ok: true,
        text:
          action === 'run_now'
            ? run.success && run.data.sent
              ? t('s09Recurring.actions.ranSent')
              : t('s09Recurring.actions.ran')
            : t('s09Recurring.actions.done'),
      });
      router.refresh();
    } else setNote({ ok: false, text: r.message ?? t('s09Recurring.form.error') });
    setBusy(false);
  }

  async function remove(): Promise<void> {
    if (!window.confirm(t('s09Recurring.actions.confirmDelete'))) return;
    setBusy(true);
    const r = await callJson(`/api/invoices/recurring/${id}`, 'DELETE');
    if (r.ok) router.push('/invoices/recurring');
    else setNote({ ok: false, text: r.message ?? t('s09Recurring.form.error') });
    setBusy(false);
  }

  return (
    <div className="space-y-sp-8 text-sm print:hidden">
      <div className="flex flex-wrap gap-sp-8">
        {status === 'active' ? (
          <>
            <Button type="button" disabled={busy} onClick={() => void act('run_now')}>
              {t('s09Recurring.actions.runNow')}
            </Button>
            <Button
              type="button"
              variant="outline"
              disabled={busy}
              onClick={() => void act('pause')}
            >
              {t('s09Recurring.actions.pause')}
            </Button>
          </>
        ) : null}
        {status === 'paused' ? (
          <Button type="button" disabled={busy} onClick={() => void act('resume')}>
            {t('s09Recurring.actions.resume')}
          </Button>
        ) : null}
        {status !== 'ended' ? (
          <Button
            type="button"
            variant="outline"
            disabled={busy}
            onClick={() => {
              if (window.confirm(t('s09Recurring.actions.confirmEnd'))) void act('end');
            }}
          >
            {t('s09Recurring.actions.end')}
          </Button>
        ) : null}
        {status !== 'active' ? (
          <Button type="button" variant="outline" disabled={busy} onClick={() => void remove()}>
            {t('s09Recurring.actions.delete')}
          </Button>
        ) : null}
      </div>
      {note ? (
        <p role={note.ok ? 'status' : 'alert'} className={note.ok ? undefined : 'text-destructive'}>
          {note.text}
        </p>
      ) : null}
    </div>
  );
}
