// path: app/(admin)/admin/incidents/_components/incident-actions.tsx
'use client';
import type { FormEvent } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { t } from '@/lib/i18n';
import { INCIDENT_SEVERITIES } from '@/lib/alerting/policy';
import { useAdminAction } from '@/lib/security/use-admin-action';

const ENDPOINT = '/api/admin/incidents/actions';
const selectClass = 'h-10 w-full rounded-md border bg-background px-3 text-sm';

const NEXT: Readonly<Record<string, readonly string[]>> = {
  detected: ['acknowledged', 'resolved'],
  acknowledged: ['mitigating', 'resolved'],
  mitigating: ['resolved'],
  resolved: ['closed', 'mitigating'],
  closed: [],
};

export function OpenIncidentForm(): JSX.Element {
  const { message, busy, run } = useAdminAction(ENDPOINT);
  async function submit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    const form = event.currentTarget;
    const d = new FormData(form);
    const ok = await run({
      action: 'open',
      title: String(d.get('title') ?? ''),
      severity: String(d.get('severity') ?? 'SEV3'),
      summary: String(d.get('summary') ?? ''),
      impact: String(d.get('impact') ?? ''),
      startedMinutesAgo: Number(d.get('startedMinutesAgo') ?? 0),
    });
    if (ok) form.reset();
  }
  return (
    <form
      onSubmit={submit}
      className="grid gap-sp-12 sm:grid-cols-2"
      aria-label={t('s04Security.incidents.open')}
    >
      <label className="space-y-1 text-sm sm:col-span-2">
        <span>{t('s04Security.incidents.titleField')}</span>
        <Input name="title" required minLength={3} maxLength={200} />
      </label>
      <label className="space-y-1 text-sm">
        <span>{t('s04Security.incidents.severity')}</span>
        <select name="severity" defaultValue="SEV3" className={selectClass}>
          {INCIDENT_SEVERITIES.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
      </label>
      <label className="space-y-1 text-sm">
        <span>{t('s04Security.incidents.startedAgo')}</span>
        <Input name="startedMinutesAgo" type="number" min={0} max={43200} defaultValue={0} />
      </label>
      <label className="space-y-1 text-sm sm:col-span-2">
        <span>{t('s04Security.incidents.summary')}</span>
        <Textarea name="summary" maxLength={4000} rows={3} />
      </label>
      <label className="space-y-1 text-sm sm:col-span-2">
        <span>{t('s04Security.incidents.impact')}</span>
        <Textarea name="impact" maxLength={4000} rows={2} />
      </label>
      <div className="sm:col-span-2">
        <Button type="submit" disabled={busy}>
          {t('s04Security.incidents.open')}
        </Button>
        <p aria-live="polite" className="mt-1 text-caption text-muted-foreground">
          {message}
        </p>
      </div>
    </form>
  );
}

interface ManageProps {
  id: string;
  status: string;
  version: number;
  summary: string;
  impact: string;
  rootCause: string;
  postmortem: string;
  template: string;
}

export function ManageIncident(p: ManageProps): JSX.Element {
  const { message, busy, run } = useAdminAction(ENDPOINT);
  async function save(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    const d = new FormData(event.currentTarget);
    await run({
      action: 'update',
      id: p.id,
      version: p.version,
      summary: String(d.get('summary') ?? ''),
      impact: String(d.get('impact') ?? ''),
      rootCause: String(d.get('rootCause') ?? ''),
      postmortem: String(d.get('postmortem') ?? ''),
    });
  }
  async function note(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    const form = event.currentTarget;
    const ok = await run({
      action: 'note',
      id: p.id,
      body: String(new FormData(form).get('body') ?? ''),
    });
    if (ok) form.reset();
  }
  return (
    <div className="space-y-sp-12">
      <div className="flex flex-wrap gap-2">
        {(NEXT[p.status] ?? []).map((s) => (
          <Button
            key={s}
            type="button"
            size="sm"
            variant="outline"
            disabled={busy}
            onClick={() => run({ action: 'transition', id: p.id, status: s })}
          >
            {t('s04Security.incidents.moveTo', { status: s })}
          </Button>
        ))}
      </div>
      <form
        onSubmit={save}
        className="grid gap-sp-12"
        aria-label={t('s04Security.incidents.details')}
      >
        <label className="space-y-1 text-sm">
          <span>{t('s04Security.incidents.summary')}</span>
          <Textarea name="summary" defaultValue={p.summary} maxLength={4000} rows={2} />
        </label>
        <label className="space-y-1 text-sm">
          <span>{t('s04Security.incidents.impact')}</span>
          <Textarea name="impact" defaultValue={p.impact} maxLength={4000} rows={2} />
        </label>
        <label className="space-y-1 text-sm">
          <span>{t('s04Security.incidents.rootCause')}</span>
          <Textarea name="rootCause" defaultValue={p.rootCause} maxLength={4000} rows={2} />
        </label>
        <label className="space-y-1 text-sm">
          <span>{t('s04Security.incidents.postmortem')}</span>
          <Textarea
            name="postmortem"
            defaultValue={p.postmortem || p.template}
            maxLength={20000}
            rows={8}
          />
        </label>
        <div>
          <Button type="submit" size="sm" disabled={busy}>
            {t('s04Security.incidents.save')}
          </Button>
        </div>
      </form>
      <form onSubmit={note} className="flex gap-2" aria-label={t('s04Security.incidents.addNote')}>
        <Input
          name="body"
          required
          maxLength={2000}
          placeholder={t('s04Security.incidents.addNote')}
        />
        <Button type="submit" size="sm" variant="outline" disabled={busy}>
          {t('s04Security.incidents.addNote')}
        </Button>
      </form>
      <p aria-live="polite" className="text-caption text-muted-foreground">
        {message}
      </p>
    </div>
  );
}
