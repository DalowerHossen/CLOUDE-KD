// path: app/(admin)/admin/alerts/_components/alert-actions.tsx
'use client';
import type { FormEvent } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { t } from '@/lib/i18n';
import { CHANNEL_KINDS } from '@/lib/security/alerting/policy';
import { useAdminAction } from '@/lib/security/use-admin-action';

const ENDPOINT = '/api/admin/alerts/actions';
const selectClass = 'h-10 w-full rounded-md border bg-background px-3 text-sm';

export function AlertButtons(props: { id: string; status: string }): JSX.Element {
  const { message, busy, run } = useAdminAction(ENDPOINT);
  return (
    <div className="space-y-1">
      <div className="flex flex-wrap gap-2">
        {props.status === 'open' ? (
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={busy}
            onClick={() => run({ action: 'acknowledge', id: props.id })}
          >
            {t('s04Security.alerts.acknowledge')}
          </Button>
        ) : null}
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={busy}
          onClick={() => run({ action: 'resolve', id: props.id })}
        >
          {t('s04Security.alerts.resolve')}
        </Button>
      </div>
      <p aria-live="polite" className="text-caption text-muted-foreground">
        {message}
      </p>
    </div>
  );
}

export function RemoveButton(props: {
  action: 'delete_silence' | 'delete_channel' | 'remove_oncall' | 'test_channel';
  id: string;
  label: string;
}): JSX.Element {
  const { message, busy, run } = useAdminAction(ENDPOINT);
  return (
    <div className="space-y-1">
      <Button
        type="button"
        size="sm"
        variant="outline"
        disabled={busy}
        onClick={() => run({ action: props.action, id: props.id })}
      >
        {props.label}
      </Button>
      <p aria-live="polite" className="text-caption text-muted-foreground">
        {message}
      </p>
    </div>
  );
}

export function SilenceForm(): JSX.Element {
  const { message, busy, run } = useAdminAction(ENDPOINT);
  async function submit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    const form = event.currentTarget;
    const d = new FormData(form);
    const ok = await run({
      action: 'create_silence',
      ruleId: String(d.get('ruleId') ?? '').trim(),
      reason: String(d.get('reason') ?? ''),
      hours: Number(d.get('hours') ?? 1),
    });
    if (ok) form.reset();
  }
  return (
    <form
      onSubmit={submit}
      className="grid gap-sp-12 sm:grid-cols-3"
      aria-label={t('s04Security.alerts.addSilence')}
    >
      <label className="space-y-1 text-sm">
        <span>{t('s04Security.alerts.rule')}</span>
        <Input name="ruleId" required defaultValue="*" maxLength={100} />
      </label>
      <label className="space-y-1 text-sm">
        <span>{t('s04Security.alerts.reason')}</span>
        <Input name="reason" required minLength={3} maxLength={300} />
      </label>
      <label className="space-y-1 text-sm">
        <span>{t('s04Security.alerts.hours')}</span>
        <Input name="hours" type="number" min={1} max={168} defaultValue={2} required />
      </label>
      <div className="sm:col-span-3">
        <Button type="submit" disabled={busy}>
          {t('s04Security.alerts.addSilence')}
        </Button>
        <p aria-live="polite" className="mt-1 text-caption text-muted-foreground">
          {message}
        </p>
      </div>
    </form>
  );
}

export function ChannelForm(): JSX.Element {
  const { message, busy, run } = useAdminAction(ENDPOINT);
  async function submit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    const form = event.currentTarget;
    const d = new FormData(form);
    const secret = String(d.get('secret') ?? '').trim();
    const ok = await run({
      action: 'create_channel',
      name: String(d.get('name') ?? ''),
      kind: String(d.get('kind') ?? ''),
      target: String(d.get('target') ?? ''),
      minSeverity: String(d.get('minSeverity') ?? 'high'),
      fromLevel: Number(d.get('fromLevel') ?? 0),
      ...(secret ? { secret } : {}),
    });
    if (ok) form.reset();
  }
  return (
    <form
      onSubmit={submit}
      className="grid gap-sp-12 sm:grid-cols-2"
      aria-label={t('s04Security.alerts.addChannel')}
    >
      <label className="space-y-1 text-sm">
        <span>{t('s04Security.alerts.name')}</span>
        <Input name="name" required minLength={2} maxLength={80} />
      </label>
      <label className="space-y-1 text-sm">
        <span>{t('s04Security.alerts.kind')}</span>
        <select name="kind" className={selectClass}>
          {CHANNEL_KINDS.map((k) => (
            <option key={k} value={k}>
              {k}
            </option>
          ))}
        </select>
      </label>
      <label className="space-y-1 text-sm sm:col-span-2">
        <span>{t('s04Security.alerts.target')}</span>
        <Input name="target" type="url" required maxLength={500} placeholder="https://" />
      </label>
      <label className="space-y-1 text-sm">
        <span>{t('s04Security.alerts.secret')}</span>
        <Input name="secret" type="password" autoComplete="off" minLength={8} maxLength={500} />
      </label>
      <label className="space-y-1 text-sm">
        <span>{t('s04Security.alerts.minSeverity')}</span>
        <select name="minSeverity" defaultValue="high" className={selectClass}>
          {['low', 'medium', 'high', 'critical'].map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
      </label>
      <label className="space-y-1 text-sm">
        <span>{t('s04Security.alerts.fromLevel')}</span>
        <select name="fromLevel" defaultValue="0" className={selectClass}>
          {[0, 1, 2].map((n) => (
            <option key={n} value={n}>
              {n}
            </option>
          ))}
        </select>
      </label>
      <div className="sm:col-span-2">
        <Button type="submit" disabled={busy}>
          {t('s04Security.alerts.addChannel')}
        </Button>
        <p aria-live="polite" className="mt-1 text-caption text-muted-foreground">
          {message}
        </p>
      </div>
    </form>
  );
}

export function OncallForm(): JSX.Element {
  const { message, busy, run } = useAdminAction(ENDPOINT);
  async function submit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    const form = event.currentTarget;
    const d = new FormData(form);
    const ok = await run({
      action: 'add_oncall',
      name: String(d.get('name') ?? ''),
      email: String(d.get('email') ?? ''),
      level: Number(d.get('level') ?? 0),
    });
    if (ok) form.reset();
  }
  return (
    <form
      onSubmit={submit}
      className="grid gap-sp-12 sm:grid-cols-3"
      aria-label={t('s04Security.alerts.addOncall')}
    >
      <label className="space-y-1 text-sm">
        <span>{t('s04Security.alerts.name')}</span>
        <Input name="name" required minLength={2} maxLength={80} />
      </label>
      <label className="space-y-1 text-sm">
        <span>{t('s04Security.alerts.email')}</span>
        <Input name="email" type="email" required maxLength={254} />
      </label>
      <label className="space-y-1 text-sm">
        <span>{t('s04Security.alerts.level')}</span>
        <select name="level" defaultValue="0" className={selectClass}>
          {[0, 1, 2].map((n) => (
            <option key={n} value={n}>
              {n}
            </option>
          ))}
        </select>
      </label>
      <div className="sm:col-span-3">
        <Button type="submit" disabled={busy}>
          {t('s04Security.alerts.addOncall')}
        </Button>
        <p aria-live="polite" className="mt-1 text-caption text-muted-foreground">
          {message}
        </p>
      </div>
    </form>
  );
}
