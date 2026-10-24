// path: components/whatsapp/automation-forms.tsx
'use client';
import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { NativeSelect } from '@/components/ui/native-select';
import { t, type StringKey } from '@/lib/i18n';
import { toInt } from '@/lib/reports/numbers';

interface Failure {
  error?: { code?: string; message?: string };
}

async function failure(response: Response): Promise<string> {
  const json = (await response.json().catch(() => null)) as Failure | null;
  if (json?.error?.code === 'step_up_required') return t('s16Whatsapp.common.needStepUp');
  return json?.error?.message ?? t('s16Whatsapp.common.failed');
}

const key = (): string => `ui-${crypto.randomUUID()}`;

export interface TemplateChoice {
  id: string;
  label: string;
  variables: string[];
}

function ValueInputs({
  variables,
  values,
  onChange,
  help,
  prefix,
}: {
  variables: string[];
  values: Record<string, string>;
  onChange: (next: Record<string, string>) => void;
  help: string;
  prefix: string;
}): JSX.Element | null {
  if (variables.length === 0) return null;
  return (
    <div className="space-y-sp-8">
      <p className="text-sm text-muted-foreground">{help}</p>
      {variables.map((v) => (
        <div key={v} className="space-y-1">
          <Label htmlFor={`${prefix}-${v}`}>
            {t('s16Whatsapp.rules.value')} {`{{${v}}}`}
          </Label>
          <Input
            id={`${prefix}-${v}`}
            value={values[v] ?? ''}
            maxLength={500}
            onChange={(e) => onChange({ ...values, [v]: e.target.value })}
            autoComplete="off"
          />
        </div>
      ))}
    </div>
  );
}

/** Makes a rule: a trigger (an event or days before the due date), a template, its values, a delay. It starts as a dry run. */
export function RuleForm({
  templates,
  events,
}: {
  templates: TemplateChoice[];
  events: readonly string[];
}): JSX.Element {
  const router = useRouter();
  const [name, setName] = useState('');
  const [kind, setKind] = useState<'event' | 'due_soon'>('event');
  const [eventName, setEventName] = useState(events[0] ?? '');
  const [days, setDays] = useState('3');
  const [templateId, setTemplateId] = useState('');
  const [values, setValues] = useState<Record<string, string>>({});
  const [delay, setDelay] = useState('0');
  const [dryRun, setDryRun] = useState(true);
  const [enabled, setEnabled] = useState(false);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<{ ok: boolean; text: string } | null>(null);
  const chosen = templates.find((x) => x.id === templateId);

  async function submit(event: FormEvent): Promise<void> {
    event.preventDefault();
    setBusy(true);
    setNotice(null);
    try {
      const wanted = Object.fromEntries((chosen?.variables ?? []).map((v) => [v, values[v] ?? '']));
      const response = await fetch('/api/whatsapp/rules', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'idempotency-key': key() },
        body: JSON.stringify({
          name,
          triggerKind: kind,
          eventName: kind === 'event' ? eventName : null,
          daysBefore: kind === 'due_soon' ? toInt(days, 0) : null,
          templateId,
          values: wanted,
          delayMinutes: toInt(delay, 0),
          dryRun,
          enabled,
        }),
        cache: 'no-store',
      });
      if (!response.ok) setNotice({ ok: false, text: await failure(response) });
      else {
        setNotice({ ok: true, text: t('s16Whatsapp.common.done') });
        setName('');
        router.refresh();
      }
    } catch {
      setNotice({ ok: false, text: t('s16Whatsapp.common.failed') });
    }
    setBusy(false);
  }

  return (
    <form onSubmit={(e) => void submit(e)} className="space-y-sp-12" noValidate>
      {notice ? <Alert variant={notice.ok ? 'success' : 'destructive'}>{notice.text}</Alert> : null}
      <div className="grid gap-sp-12 sm:grid-cols-2">
        <div className="space-y-1">
          <Label htmlFor="rl-name">{t('s16Whatsapp.rules.name')}</Label>
          <Input
            id="rl-name"
            value={name}
            maxLength={100}
            onChange={(e) => setName(e.target.value)}
            autoComplete="off"
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="rl-kind">{t('s16Whatsapp.rules.trigger')}</Label>
          <NativeSelect
            id="rl-kind"
            value={kind}
            onChange={(e) => setKind(e.target.value === 'due_soon' ? 'due_soon' : 'event')}
          >
            <option value="event">{t('s16Whatsapp.rules.triggers.event')}</option>
            <option value="due_soon">{t('s16Whatsapp.rules.triggers.due_soon')}</option>
          </NativeSelect>
        </div>
        {kind === 'event' ? (
          <div className="space-y-1">
            <Label htmlFor="rl-event">{t('s16Whatsapp.rules.event')}</Label>
            <NativeSelect
              id="rl-event"
              value={eventName}
              onChange={(e) => setEventName(e.target.value)}
            >
              {events.map((x) => (
                <option key={x} value={x}>
                  {t(`s16Whatsapp.rules.events.${x}` as StringKey)}
                </option>
              ))}
            </NativeSelect>
          </div>
        ) : (
          <div className="space-y-1">
            <Label htmlFor="rl-days">{t('s16Whatsapp.rules.days')}</Label>
            <Input
              id="rl-days"
              inputMode="numeric"
              value={days}
              onChange={(e) => setDays(e.target.value)}
            />
          </div>
        )}
        <div className="space-y-1">
          <Label htmlFor="rl-template">{t('s16Whatsapp.rules.template')}</Label>
          <NativeSelect
            id="rl-template"
            value={templateId}
            onChange={(e) => setTemplateId(e.target.value)}
          >
            <option value="">{t('s16Whatsapp.rules.choose')}</option>
            {templates.map((x) => (
              <option key={x.id} value={x.id}>
                {x.label}
              </option>
            ))}
          </NativeSelect>
        </div>
        <div className="space-y-1">
          <Label htmlFor="rl-delay">{t('s16Whatsapp.rules.delay')}</Label>
          <Input
            id="rl-delay"
            inputMode="numeric"
            value={delay}
            onChange={(e) => setDelay(e.target.value)}
          />
        </div>
      </div>
      <ValueInputs
        variables={chosen?.variables ?? []}
        values={values}
        onChange={setValues}
        help={t('s16Whatsapp.rules.valueHelp')}
        prefix="rl-v"
      />
      <label className="flex items-center gap-2 text-sm" htmlFor="rl-dry">
        <input
          id="rl-dry"
          type="checkbox"
          checked={dryRun}
          onChange={(e) => setDryRun(e.target.checked)}
        />
        {t('s16Whatsapp.rules.dryRun')}
      </label>
      <label className="flex items-center gap-2 text-sm" htmlFor="rl-on">
        <input
          id="rl-on"
          type="checkbox"
          checked={enabled}
          onChange={(e) => setEnabled(e.target.checked)}
        />
        {t('s16Whatsapp.rules.enabled')}
      </label>
      <Button type="submit" disabled={busy || name.trim() === '' || templateId === ''}>
        {t('s16Whatsapp.rules.make')}
      </Button>
    </form>
  );
}

/** Switches a rule on or off, or between dry run and live (with the version for the optimistic lock). */
export function RulePatchButton({
  id,
  version,
  patch,
  label,
}: {
  id: string;
  version: number;
  patch: { enabled?: boolean; dryRun?: boolean };
  label: string;
}): JSX.Element {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function run(): Promise<void> {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch(`/api/whatsapp/rules/${id}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ version, ...patch }),
        cache: 'no-store',
      });
      if (!response.ok) setError(await failure(response));
      else router.refresh();
    } catch {
      setError(t('s16Whatsapp.common.failed'));
    }
    setBusy(false);
  }
  return (
    <span className="inline-flex flex-col gap-1">
      <Button type="button" size="sm" variant="outline" disabled={busy} onClick={() => void run()}>
        {label}
      </Button>
      {error ? <Alert variant="destructive">{error}</Alert> : null}
    </span>
  );
}

/** Makes a campaign: template, values, the segment (with a count of the people it reaches) and dry run. */
export function CampaignForm({ templates }: { templates: TemplateChoice[] }): JSX.Element {
  const router = useRouter();
  const [name, setName] = useState('');
  const [templateId, setTemplateId] = useState('');
  const [values, setValues] = useState<Record<string, string>>({});
  const [tags, setTags] = useState('');
  const [minBalance, setMinBalance] = useState('');
  const [maxBalance, setMaxBalance] = useState('');
  const [lastBefore, setLastBefore] = useState('');
  const [open, setOpen] = useState('any');
  const [optedInOnly, setOptedInOnly] = useState(true);
  const [dryRun, setDryRun] = useState(true);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<{ ok: boolean; text: string } | null>(null);
  const chosen = templates.find((x) => x.id === templateId);

  const segment = (): Record<string, unknown> => ({
    tags: tags
      .split(';')
      .map((x) => x.trim())
      .filter(Boolean),
    minBalance: minBalance.trim() === '' ? null : minBalance.trim(),
    maxBalance: maxBalance.trim() === '' ? null : maxBalance.trim(),
    lastInvoiceBefore: lastBefore.trim() === '' ? null : lastBefore.trim(),
    hasOpenInvoices: open === 'any' ? null : open === 'yes',
    optedInOnly,
  });

  async function preview(): Promise<void> {
    setBusy(true);
    setNotice(null);
    try {
      const response = await fetch('/api/whatsapp/campaigns/preview', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ segment: segment() }),
        cache: 'no-store',
      });
      if (!response.ok) setNotice({ ok: false, text: await failure(response) });
      else {
        const json = (await response.json()) as { data: { pending: number; skipped: number } };
        setNotice({
          ok: true,
          text: `${t('s16Whatsapp.campaigns.previewResult')}: ${json.data.pending}, ${t('s16Whatsapp.campaigns.previewSkipped')}: ${json.data.skipped}`,
        });
      }
    } catch {
      setNotice({ ok: false, text: t('s16Whatsapp.common.failed') });
    }
    setBusy(false);
  }

  async function submit(event: FormEvent): Promise<void> {
    event.preventDefault();
    setBusy(true);
    setNotice(null);
    try {
      const wanted = Object.fromEntries((chosen?.variables ?? []).map((v) => [v, values[v] ?? '']));
      const response = await fetch('/api/whatsapp/campaigns', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'idempotency-key': key() },
        body: JSON.stringify({ name, templateId, values: wanted, segment: segment(), dryRun }),
        cache: 'no-store',
      });
      if (!response.ok) setNotice({ ok: false, text: await failure(response) });
      else {
        setNotice({ ok: true, text: t('s16Whatsapp.common.done') });
        setName('');
        router.refresh();
      }
    } catch {
      setNotice({ ok: false, text: t('s16Whatsapp.common.failed') });
    }
    setBusy(false);
  }

  return (
    <form onSubmit={(e) => void submit(e)} className="space-y-sp-12" noValidate>
      {notice ? <Alert variant={notice.ok ? 'success' : 'destructive'}>{notice.text}</Alert> : null}
      <div className="grid gap-sp-12 sm:grid-cols-2">
        <div className="space-y-1">
          <Label htmlFor="cp-name">{t('s16Whatsapp.campaigns.name')}</Label>
          <Input
            id="cp-name"
            value={name}
            maxLength={100}
            onChange={(e) => setName(e.target.value)}
            autoComplete="off"
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="cp-template">{t('s16Whatsapp.campaigns.template')}</Label>
          <NativeSelect
            id="cp-template"
            value={templateId}
            onChange={(e) => setTemplateId(e.target.value)}
          >
            <option value="">{t('s16Whatsapp.campaigns.choose')}</option>
            {templates.map((x) => (
              <option key={x.id} value={x.id}>
                {x.label}
              </option>
            ))}
          </NativeSelect>
        </div>
      </div>
      <ValueInputs
        variables={chosen?.variables ?? []}
        values={values}
        onChange={setValues}
        help={t('s16Whatsapp.campaigns.valueHelp')}
        prefix="cp-v"
      />
      <fieldset className="space-y-sp-8">
        <legend className="text-sm font-medium">{t('s16Whatsapp.campaigns.segmentTitle')}</legend>
        <div className="grid gap-sp-12 sm:grid-cols-2">
          <div className="space-y-1">
            <Label htmlFor="cp-tags">{t('s16Whatsapp.campaigns.tags')}</Label>
            <Input
              id="cp-tags"
              value={tags}
              onChange={(e) => setTags(e.target.value)}
              autoComplete="off"
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="cp-open">{t('s16Whatsapp.campaigns.openInvoices')}</Label>
            <NativeSelect id="cp-open" value={open} onChange={(e) => setOpen(e.target.value)}>
              <option value="any">{t('s16Whatsapp.campaigns.openAny')}</option>
              <option value="yes">{t('s16Whatsapp.campaigns.openYes')}</option>
              <option value="no">{t('s16Whatsapp.campaigns.openNo')}</option>
            </NativeSelect>
          </div>
          <div className="space-y-1">
            <Label htmlFor="cp-min">{t('s16Whatsapp.campaigns.minBalance')}</Label>
            <Input
              id="cp-min"
              inputMode="decimal"
              value={minBalance}
              onChange={(e) => setMinBalance(e.target.value)}
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="cp-max">{t('s16Whatsapp.campaigns.maxBalance')}</Label>
            <Input
              id="cp-max"
              inputMode="decimal"
              value={maxBalance}
              onChange={(e) => setMaxBalance(e.target.value)}
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="cp-last">{t('s16Whatsapp.campaigns.lastInvoiceBefore')}</Label>
            <Input
              id="cp-last"
              value={lastBefore}
              placeholder="YYYY-MM-DD"
              onChange={(e) => setLastBefore(e.target.value)}
            />
          </div>
        </div>
        <label className="flex items-center gap-2 text-sm" htmlFor="cp-opt">
          <input
            id="cp-opt"
            type="checkbox"
            checked={optedInOnly}
            onChange={(e) => setOptedInOnly(e.target.checked)}
          />
          {t('s16Whatsapp.campaigns.optedInOnly')}
        </label>
      </fieldset>
      <label className="flex items-center gap-2 text-sm" htmlFor="cp-dry">
        <input
          id="cp-dry"
          type="checkbox"
          checked={dryRun}
          onChange={(e) => setDryRun(e.target.checked)}
        />
        {t('s16Whatsapp.campaigns.dryRun')}
      </label>
      <div className="flex flex-wrap gap-2">
        <Button type="button" variant="outline" disabled={busy} onClick={() => void preview()}>
          {t('s16Whatsapp.campaigns.preview')}
        </Button>
        <Button type="submit" disabled={busy || name.trim() === '' || templateId === ''}>
          {t('s16Whatsapp.campaigns.make')}
        </Button>
      </div>
    </form>
  );
}

/** One action on a campaign (start, pause, resume, cancel, send the failed ones again). */
export function CampaignActionButton({
  id,
  action,
  label,
  variant = 'outline',
}: {
  id: string;
  action: 'start' | 'pause' | 'cancel' | 'retry';
  label: string;
  variant?: 'outline' | 'destructive';
}): JSX.Element {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function run(): Promise<void> {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch(`/api/whatsapp/campaigns/${id}/${action}`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          ...(action === 'start' || action === 'retry' ? { 'idempotency-key': key() } : {}),
        },
        body: JSON.stringify(action === 'start' ? { scheduledAt: null } : {}),
        cache: 'no-store',
      });
      if (!response.ok) setError(await failure(response));
      else router.refresh();
    } catch {
      setError(t('s16Whatsapp.common.failed'));
    }
    setBusy(false);
  }
  return (
    <span className="inline-flex flex-col gap-1">
      <Button type="button" size="sm" variant={variant} disabled={busy} onClick={() => void run()}>
        {label}
      </Button>
      {error ? <Alert variant="destructive">{error}</Alert> : null}
    </span>
  );
}
