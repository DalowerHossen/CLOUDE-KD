// path: app/(admin)/admin/_components/people-actions.tsx
'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { z } from 'zod';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { t } from '@/lib/i18n';

const errorBody = z.object({ error: z.object({ message: z.string() }) });
const okBody = z.object({
  data: z.object({ result: z.enum(['applied', 'awaiting_approval', 'done']) }),
});

export interface ActionChoice {
  action: 'user.suspend' | 'user.reactivate' | 'tenant.suspend' | 'tenant.reactivate';
  label: string;
}

/** Notes, suspend/reactivate (with a reason) and the e-mail confirmation. Every request goes to the one action route. */
export function PeopleActions({
  subject,
  id,
  choices,
  canManage,
  canNote,
  canVerifyEmail,
  locked,
}: {
  subject: 'user' | 'tenant';
  id: string;
  choices: ActionChoice[];
  canManage: boolean;
  canNote: boolean;
  canVerifyEmail: boolean;
  locked: boolean;
}): JSX.Element {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [reason, setReason] = useState('');
  const [note, setNote] = useState('');
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  async function send(body: Record<string, unknown>, clear: () => void): Promise<void> {
    setBusy(true);
    setMessage(null);
    try {
      const response = await fetch('/api/companies/admin/actions', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      });
      const json: unknown = await response.json().catch(() => null);
      if (response.ok) {
        const ok = okBody.safeParse(json);
        const result = ok.success ? ok.data.data.result : 'done';
        setMessage({
          ok: true,
          text:
            result === 'applied'
              ? t('s07Company.adminPeople.resultApplied')
              : result === 'awaiting_approval'
                ? t('s07Company.adminPeople.resultAwaiting')
                : t('s07Company.adminPeople.resultDone'),
        });
        clear();
        router.refresh();
      } else {
        const err = errorBody.safeParse(json);
        setMessage({
          ok: false,
          text: err.success ? err.data.error.message : t('s07Company.adminPeople.error'),
        });
      }
    } catch {
      setMessage({ ok: false, text: t('s07Company.adminPeople.error') });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-sp-16">
      {canManage ? (
        <section className="space-y-sp-8 rounded-lg border bg-card p-sp-16">
          <h2 className="text-h4 font-semibold">{t('s07Company.adminPeople.actions')}</h2>
          <p className="text-sm text-muted-foreground">{t('s07Company.adminPeople.help')}</p>
          <label className="block text-sm font-medium" htmlFor={`reason-${id}`}>
            {t('s07Company.adminPeople.reasonLabel')}
          </label>
          <Textarea
            id={`reason-${id}`}
            value={reason}
            maxLength={1000}
            onChange={(e) => setReason(e.target.value)}
          />
          <div className="flex flex-wrap gap-2">
            {choices.map((c) => (
              <Button
                key={c.action}
                type="button"
                variant={c.action.endsWith('suspend') ? 'destructive' : 'outline'}
                disabled={busy || locked || reason.trim().length < 10}
                onClick={() => void send({ action: c.action, id, reason }, () => setReason(''))}
              >
                {c.label}
              </Button>
            ))}
            {canVerifyEmail ? (
              <Button
                type="button"
                variant="outline"
                disabled={busy}
                onClick={() => void send({ action: 'user.verify_email', id }, () => undefined)}
              >
                {t('s07Company.adminPeople.verifyEmail')}
              </Button>
            ) : null}
          </div>
        </section>
      ) : null}
      {canNote ? (
        <section className="space-y-sp-8 rounded-lg border bg-card p-sp-16">
          <label className="block text-sm font-medium" htmlFor={`note-${id}`}>
            {t('s07Company.adminPeople.noteLabel')}
          </label>
          <Textarea
            id={`note-${id}`}
            value={note}
            maxLength={2000}
            onChange={(e) => setNote(e.target.value)}
          />
          <Button
            type="button"
            disabled={busy || note.trim().length === 0}
            onClick={() =>
              void send({ action: 'note', subject, id, body: note }, () => setNote(''))
            }
          >
            {t('s07Company.adminPeople.addNote')}
          </Button>
        </section>
      ) : null}
      {message ? (
        <p
          role={message.ok ? 'status' : 'alert'}
          className={message.ok ? 'text-sm' : 'text-sm text-destructive'}
        >
          {message.text}
        </p>
      ) : null}
    </div>
  );
}
