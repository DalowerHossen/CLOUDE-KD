// path: app/(admin)/admin/support/_components/agent-panel.tsx
'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { NativeSelect } from '@/components/ui/native-select';
import { Textarea } from '@/components/ui/textarea';
import { PRIORITIES, STATUSES } from '@/lib/support/rules';
import { t, type StringKey } from '@/lib/i18n';
import { z } from 'zod';

const errorBody = z.object({ error: z.object({ message: z.string() }) });

export function AgentPanel({
  id,
  status,
  priority,
  assigneeId,
  agents,
}: {
  id: string;
  status: string;
  priority: string;
  assigneeId: string | null;
  agents: { id: string; name: string }[];
}): JSX.Element {
  const router = useRouter();
  const [body, setBody] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function send(payload: Record<string, unknown>, after?: () => void): Promise<void> {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch(`/api/support/admin/tickets/${id}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (response.ok) {
        after?.();
        router.refresh();
      } else {
        const err = errorBody.safeParse(await response.json().catch(() => null));
        setError(err.success ? err.data.error.message : t('s07Company.support.error'));
      }
    } catch {
      setError(t('s07Company.support.error'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-sp-16">
      <section className="space-y-sp-8">
        <label className="block text-sm font-medium" htmlFor="agent-body">
          {t('s07Company.support.replyToCustomer')}
        </label>
        <Textarea
          id="agent-body"
          rows={5}
          maxLength={5000}
          value={body}
          onChange={(e) => setBody(e.target.value)}
        />
        <div className="flex flex-wrap gap-sp-8">
          <Button
            type="button"
            disabled={busy || body.trim() === ''}
            onClick={() => void send({ action: 'reply', body, internal: false }, () => setBody(''))}
          >
            {t('s07Company.support.send')}
          </Button>
          <Button
            type="button"
            variant="outline"
            disabled={busy || body.trim() === ''}
            onClick={() => void send({ action: 'reply', body, internal: true }, () => setBody(''))}
          >
            {t('s07Company.support.saveNote')}
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">{t('s07Company.support.internalNote')}</p>
      </section>
      <section className="grid gap-sp-12 sm:grid-cols-3">
        <label className="text-sm">
          <span className="block font-medium">{t('s07Company.support.changeStatus')}</span>
          <NativeSelect
            value={status}
            disabled={busy}
            onChange={(e) => void send({ action: 'status', status: e.target.value })}
          >
            {STATUSES.map((s) => (
              <option key={s} value={s}>
                {t(`s07Company.support.statuses.${s}` as StringKey)}
              </option>
            ))}
          </NativeSelect>
        </label>
        <label className="text-sm">
          <span className="block font-medium">{t('s07Company.support.changePriority')}</span>
          <NativeSelect
            value={priority}
            disabled={busy}
            onChange={(e) => void send({ action: 'priority', priority: e.target.value })}
          >
            {PRIORITIES.map((s) => (
              <option key={s} value={s}>
                {t(`s07Company.support.priorities.${s}` as StringKey)}
              </option>
            ))}
          </NativeSelect>
        </label>
        <label className="text-sm">
          <span className="block font-medium">{t('s07Company.support.assign')}</span>
          <NativeSelect
            value={assigneeId ?? ''}
            disabled={busy}
            onChange={(e) =>
              void send({
                action: 'assign',
                assigneeId: e.target.value === '' ? null : e.target.value,
              })
            }
          >
            <option value="">{t('s07Company.support.nobody')}</option>
            {agents.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </NativeSelect>
        </label>
      </section>
      <Button
        type="button"
        variant="outline"
        disabled={busy}
        onClick={() => void send({ action: 'claim' })}
      >
        {t('s07Company.support.claim')}
      </Button>
      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}
    </div>
  );
}
