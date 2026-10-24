// path: app/(admin)/admin/siem/_components/siem-actions.tsx
'use client';
import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { z } from 'zod';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { t } from '@/lib/i18n';
import { SIEM_KINDS } from '@/lib/security/siem/types';

const errorBody = z.object({ error: z.object({ message: z.string() }) });

function useSiemAction(): {
  message: string | null;
  busy: boolean;
  run: (body: unknown) => Promise<boolean>;
} {
  const router = useRouter();
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  async function run(body: unknown): Promise<boolean> {
    setBusy(true);
    setMessage(null);
    try {
      const response = await fetch('/api/admin/siem/actions', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (response.ok) {
        setMessage(t('s04Security.siem.done'));
        router.refresh();
        return true;
      }
      const parsed = errorBody.safeParse(await response.json().catch(() => null));
      setMessage(parsed.success ? parsed.data.error.message : t('s03Auth.common.genericError'));
    } catch {
      setMessage(t('s03Auth.common.genericError'));
    } finally {
      setBusy(false);
    }
    return false;
  }
  return { message, busy, run };
}

export function RowActions(props: {
  kind: 'destination' | 'ioc' | 'finding';
  id: string;
  enabled?: boolean;
}): JSX.Element {
  const { message, busy, run } = useSiemAction();
  return (
    <div className="space-y-1">
      <div className="flex flex-wrap gap-2">
        {props.kind === 'destination' ? (
          <>
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={busy}
              onClick={() => run({ action: 'test_destination', id: props.id })}
            >
              {t('s04Security.siem.test')}
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={busy}
              onClick={() => run({ action: 'set_enabled', id: props.id, enabled: !props.enabled })}
            >
              {props.enabled ? t('s04Security.siem.disable') : t('s04Security.siem.enable')}
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={busy}
              onClick={() => run({ action: 'delete_destination', id: props.id })}
            >
              {t('s04Security.siem.remove')}
            </Button>
          </>
        ) : null}
        {props.kind === 'ioc' ? (
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={busy}
            onClick={() => run({ action: 'remove_ioc', id: props.id })}
          >
            {t('s04Security.siem.remove')}
          </Button>
        ) : null}
        {props.kind === 'finding' ? (
          <>
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={busy}
              onClick={() =>
                run({ action: 'finding_status', id: props.id, status: 'acknowledged' })
              }
            >
              {t('s04Security.siem.acknowledge')}
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={busy}
              onClick={() => run({ action: 'finding_status', id: props.id, status: 'closed' })}
            >
              {t('s04Security.siem.close')}
            </Button>
          </>
        ) : null}
      </div>
      <p aria-live="polite" className="text-caption text-muted-foreground">
        {message}
      </p>
    </div>
  );
}

export function DestinationForm(): JSX.Element {
  const { message, busy, run } = useSiemAction();
  async function submit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    const secret = String(data.get('secret') ?? '').trim();
    const ok = await run({
      action: 'create_destination',
      name: String(data.get('name') ?? ''),
      kind: String(data.get('kind') ?? ''),
      endpoint: String(data.get('endpoint') ?? ''),
      minSeverity: String(data.get('minSeverity') ?? 'low'),
      ...(secret ? { secret } : {}),
    });
    if (ok) form.reset();
  }
  return (
    <form
      onSubmit={submit}
      className="grid gap-sp-12 sm:grid-cols-2"
      aria-label={t('s04Security.siem.addDestination')}
    >
      <label className="space-y-1 text-sm">
        <span>{t('s04Security.siem.name')}</span>
        <Input name="name" required minLength={2} maxLength={80} />
      </label>
      <label className="space-y-1 text-sm">
        <span>{t('s04Security.siem.kind')}</span>
        <select
          name="kind"
          required
          className="h-10 w-full rounded-md border bg-background px-3 text-sm"
        >
          {SIEM_KINDS.map((k) => (
            <option key={k} value={k}>
              {k}
            </option>
          ))}
        </select>
      </label>
      <label className="space-y-1 text-sm sm:col-span-2">
        <span>{t('s04Security.siem.endpoint')}</span>
        <Input name="endpoint" type="url" required maxLength={500} placeholder="https://" />
      </label>
      <label className="space-y-1 text-sm">
        <span>{t('s04Security.siem.secret')}</span>
        <Input name="secret" type="password" autoComplete="off" minLength={8} maxLength={500} />
      </label>
      <label className="space-y-1 text-sm">
        <span>{t('s04Security.siem.minSeverity')}</span>
        <select
          name="minSeverity"
          defaultValue="low"
          className="h-10 w-full rounded-md border bg-background px-3 text-sm"
        >
          {['info', 'low', 'medium', 'high', 'critical'].map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
      </label>
      <div className="sm:col-span-2">
        <Button type="submit" disabled={busy}>
          {t('s04Security.siem.addDestination')}
        </Button>
        <p aria-live="polite" className="mt-1 text-caption text-muted-foreground">
          {message}
        </p>
      </div>
    </form>
  );
}

export function IocForm(): JSX.Element {
  const { message, busy, run } = useSiemAction();
  async function submit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    const ok = await run({
      action: 'add_ioc',
      iocType: String(data.get('iocType') ?? 'ip_hash'),
      value: String(data.get('value') ?? '')
        .trim()
        .toLowerCase(),
      source: String(data.get('source') ?? ''),
      severity: String(data.get('severity') ?? 'high'),
    });
    if (ok) form.reset();
  }
  return (
    <form
      onSubmit={submit}
      className="grid gap-sp-12 sm:grid-cols-2"
      aria-label={t('s04Security.siem.addIoc')}
    >
      <label className="space-y-1 text-sm">
        <span>{t('s04Security.siem.iocType')}</span>
        <select name="iocType" className="h-10 w-full rounded-md border bg-background px-3 text-sm">
          <option value="ip_hash">ip_hash</option>
          <option value="user_agent_hash">user_agent_hash</option>
          <option value="email_hash">email_hash</option>
        </select>
      </label>
      <label className="space-y-1 text-sm">
        <span>{t('s04Security.siem.iocSource')}</span>
        <Input name="source" required minLength={2} maxLength={80} />
      </label>
      <label className="space-y-1 text-sm sm:col-span-2">
        <span>{t('s04Security.siem.iocValue')}</span>
        <Input
          name="value"
          required
          pattern="[0-9a-fA-F]{64}"
          maxLength={64}
          className="font-mono"
        />
      </label>
      <label className="space-y-1 text-sm">
        <span>{t('s04Security.siem.severity')}</span>
        <select
          name="severity"
          defaultValue="high"
          className="h-10 w-full rounded-md border bg-background px-3 text-sm"
        >
          {['low', 'medium', 'high', 'critical'].map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
      </label>
      <div className="self-end">
        <Button type="submit" disabled={busy}>
          {t('s04Security.siem.addIoc')}
        </Button>
        <p aria-live="polite" className="mt-1 text-caption text-muted-foreground">
          {message}
        </p>
      </div>
    </form>
  );
}
