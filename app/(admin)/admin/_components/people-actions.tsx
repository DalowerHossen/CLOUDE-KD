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
  action:
    | 'user.suspend'
    | 'user.reactivate'
    | 'tenant.suspend'
    | 'tenant.reactivate'
    | 'user.soft_delete'
    | 'user.purge'
    | 'user.force_password_reset'
    | 'user.reset_2fa';
  label: string;
}

const DESTRUCTIVE: ActionChoice['action'][] = [
  'user.suspend',
  'tenant.suspend',
  'user.soft_delete',
  'user.purge',
];

/** Notes, suspend/reactivate (with a reason) and the e-mail confirmation. Every request goes to the one action route. */
export function PeopleActions({
  subject,
  id,
  choices,
  canManage,
  canNote,
  canVerifyEmail,
  locked,
  changeEmail = false,
  plans = null,
}: {
  subject: 'user' | 'tenant';
  id: string;
  choices: ActionChoice[];
  canManage: boolean;
  canNote: boolean;
  canVerifyEmail: boolean;
  locked: boolean;
  /** Shows the e-mail change form (users only). */
  changeEmail?: boolean;
  /** Plan slugs for the plan change form; null hides it (super admin only). */
  plans?: string[] | null;
}): JSX.Element {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [reason, setReason] = useState('');
  const [note, setNote] = useState('');
  const [email, setEmail] = useState('');
  const [plan, setPlan] = useState(plans?.[0] ?? '');
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
                variant={DESTRUCTIVE.includes(c.action) ? 'destructive' : 'outline'}
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
          {changeEmail ? (
            <div className="space-y-sp-4 border-t pt-sp-8">
              <label className="block text-sm font-medium" htmlFor={`email-${id}`}>
                {t('s07Company.adminPeople.newEmailLabel')}
              </label>
              <div className="flex flex-wrap gap-2">
                <input
                  id={`email-${id}`}
                  type="email"
                  autoComplete="off"
                  maxLength={254}
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="min-w-0 flex-1 rounded-md border bg-background px-sp-8 py-sp-4 text-sm"
                />
                <Button
                  type="button"
                  variant="outline"
                  disabled={busy || locked || reason.trim().length < 10 || email.trim().length < 3}
                  onClick={() =>
                    void send({ action: 'user.change_email', id, reason, email }, () => {
                      setEmail('');
                      setReason('');
                    })
                  }
                >
                  {t('s07Company.adminPeople.changeEmail')}
                </Button>
              </div>
            </div>
          ) : null}
          {plans && plans.length > 0 ? (
            <div className="space-y-sp-4 border-t pt-sp-8">
              <label className="block text-sm font-medium" htmlFor={`plan-${id}`}>
                {t('s07Company.adminPeople.planLabel')}
              </label>
              <div className="flex flex-wrap gap-2">
                <select
                  id={`plan-${id}`}
                  value={plan}
                  onChange={(e) => setPlan(e.target.value)}
                  className="rounded-md border bg-background px-sp-8 py-sp-4 text-sm"
                >
                  {plans.map((slug) => (
                    <option key={slug} value={slug}>
                      {slug}
                    </option>
                  ))}
                </select>
                <Button
                  type="button"
                  variant="outline"
                  disabled={busy || locked || reason.trim().length < 10 || plan === ''}
                  onClick={() =>
                    void send({ action: 'user.set_plan', id, reason, plan }, () => setReason(''))
                  }
                >
                  {t('s07Company.adminPeople.changePlan')}
                </Button>
              </div>
            </div>
          ) : null}
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
