// path: components/social/automation-forms.tsx
'use client';
import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { NativeSelect } from '@/components/ui/native-select';
import { Textarea } from '@/components/ui/textarea';
import { t, type StringKey } from '@/lib/i18n';

interface Failure {
  error?: { code?: string; message?: string };
}

type Notice = { ok: boolean; text: string } | null;

async function send(
  url: string,
  method: 'POST' | 'PATCH' | 'PUT',
  body: Record<string, unknown>,
  idempotent: boolean,
): Promise<string | null> {
  try {
    const response = await fetch(url, {
      method,
      headers: {
        'content-type': 'application/json',
        ...(idempotent ? { 'idempotency-key': `ui-${crypto.randomUUID()}` } : {}),
      },
      body: JSON.stringify(body),
      cache: 'no-store',
    });
    if (response.ok) return null;
    const json = (await response.json().catch(() => null)) as Failure | null;
    if (json?.error?.code === 'step_up_required') return t('s16Social.common.needStepUp');
    return json?.error?.message ?? t('s16Social.common.failed');
  } catch {
    return t('s16Social.common.failed');
  }
}

const orNull = (v: string): string | null => (v.trim() === '' ? null : v.trim());

export interface Choice {
  id: string;
  label: string;
}

const DAYS = [0, 1, 2, 3, 4, 5, 6] as const;

/** Makes a posting schedule: account, text, days of the week, a time and a time zone. */
export function ScheduleForm({
  accounts,
  groups,
}: {
  accounts: Choice[];
  groups: Choice[];
}): JSX.Element {
  const router = useRouter();
  const [accountId, setAccountId] = useState('');
  const [name, setName] = useState('');
  const [body, setBody] = useState('');
  const [imageUrl, setImageUrl] = useState('');
  const [linkUrl, setLinkUrl] = useState('');
  const [groupId, setGroupId] = useState('');
  const [days, setDays] = useState<number[]>([1, 2, 3, 4, 5]);
  const [time, setTime] = useState('09:00');
  const [zone, setZone] = useState('UTC');
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<Notice>(null);

  async function submit(event: FormEvent): Promise<void> {
    event.preventDefault();
    setBusy(true);
    const problem = await send(
      '/api/social/schedules',
      'POST',
      {
        accountId,
        name,
        body,
        imageUrl: orNull(imageUrl),
        linkUrl: orNull(linkUrl),
        hashtagGroupId: groupId === '' ? null : groupId,
        daysOfWeek: days,
        timeOfDay: time,
        timezone: zone,
      },
      true,
    );
    setNotice(
      problem
        ? { ok: false, text: problem }
        : { ok: true, text: t('s16Social.automation.schedules.done') },
    );
    if (!problem) {
      setName('');
      setBody('');
      router.refresh();
    }
    setBusy(false);
  }

  return (
    <form onSubmit={(e) => void submit(e)} className="space-y-sp-12" noValidate>
      {notice ? <Alert variant={notice.ok ? 'success' : 'destructive'}>{notice.text}</Alert> : null}
      <div className="grid gap-sp-12 sm:grid-cols-2">
        <div className="space-y-1">
          <Label htmlFor="ss-account">{t('s16Social.automation.schedules.account')}</Label>
          <NativeSelect
            id="ss-account"
            value={accountId}
            onChange={(e) => setAccountId(e.target.value)}
          >
            <option value="">{t('s16Social.posts.choose')}</option>
            {accounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.label}
              </option>
            ))}
          </NativeSelect>
        </div>
        <div className="space-y-1">
          <Label htmlFor="ss-name">{t('s16Social.automation.schedules.name')}</Label>
          <Input
            id="ss-name"
            value={name}
            maxLength={100}
            onChange={(e) => setName(e.target.value)}
            autoComplete="off"
          />
        </div>
      </div>
      <div className="space-y-1">
        <Label htmlFor="ss-body">{t('s16Social.automation.schedules.body')}</Label>
        <Textarea
          id="ss-body"
          rows={4}
          value={body}
          maxLength={5000}
          onChange={(e) => setBody(e.target.value)}
        />
      </div>
      <div className="grid gap-sp-12 sm:grid-cols-2">
        <div className="space-y-1">
          <Label htmlFor="ss-image">{t('s16Social.automation.schedules.image')}</Label>
          <Input
            id="ss-image"
            value={imageUrl}
            onChange={(e) => setImageUrl(e.target.value)}
            autoComplete="off"
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="ss-link">{t('s16Social.automation.schedules.link')}</Label>
          <Input
            id="ss-link"
            value={linkUrl}
            onChange={(e) => setLinkUrl(e.target.value)}
            autoComplete="off"
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="ss-group">{t('s16Social.automation.schedules.group')}</Label>
          <NativeSelect id="ss-group" value={groupId} onChange={(e) => setGroupId(e.target.value)}>
            <option value="">{t('s16Social.posts.none')}</option>
            {groups.map((g) => (
              <option key={g.id} value={g.id}>
                {g.label}
              </option>
            ))}
          </NativeSelect>
        </div>
        <div className="space-y-1">
          <Label htmlFor="ss-time">{t('s16Social.automation.schedules.time')}</Label>
          <Input
            id="ss-time"
            value={time}
            maxLength={5}
            onChange={(e) => setTime(e.target.value)}
            autoComplete="off"
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="ss-zone">{t('s16Social.automation.schedules.timezone')}</Label>
          <Input
            id="ss-zone"
            value={zone}
            maxLength={60}
            onChange={(e) => setZone(e.target.value)}
            autoComplete="off"
          />
        </div>
      </div>
      <fieldset className="space-y-1">
        <legend className="text-sm font-medium">{t('s16Social.automation.schedules.days')}</legend>
        <div className="flex flex-wrap gap-3">
          {DAYS.map((d) => (
            <label key={d} className="flex items-center gap-1 text-sm">
              <input
                type="checkbox"
                checked={days.includes(d)}
                onChange={(e) =>
                  setDays(e.target.checked ? [...days, d] : days.filter((x) => x !== d))
                }
              />
              {t(`s16Social.calendar.weekdays.d${d}` as StringKey)}
            </label>
          ))}
        </div>
      </fieldset>
      <Button
        type="submit"
        disabled={busy || accountId === '' || name.trim() === '' || days.length === 0}
      >
        {t('s16Social.automation.schedules.create')}
      </Button>
    </form>
  );
}

/** Makes a rule: trigger key, accounts, text with names in braces, and what to make. */
export function RuleForm({
  accounts,
  groups,
}: {
  accounts: Choice[];
  groups: Choice[];
}): JSX.Element {
  const router = useRouter();
  const [name, setName] = useState('');
  const [trigger, setTrigger] = useState('');
  const [chosen, setChosen] = useState<string[]>([]);
  const [template, setTemplate] = useState('{title}\n{url}');
  const [groupId, setGroupId] = useState('');
  const [mode, setMode] = useState<'draft' | 'publish'>('draft');
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<Notice>(null);

  async function submit(event: FormEvent): Promise<void> {
    event.preventDefault();
    setBusy(true);
    const problem = await send(
      '/api/social/rules',
      'POST',
      {
        name,
        triggerKey: trigger,
        accountIds: chosen,
        bodyTemplate: template,
        hashtagGroupId: groupId === '' ? null : groupId,
        mode,
      },
      true,
    );
    setNotice(
      problem
        ? { ok: false, text: problem }
        : { ok: true, text: t('s16Social.automation.rules.done') },
    );
    if (!problem) {
      setName('');
      setTrigger('');
      router.refresh();
    }
    setBusy(false);
  }

  return (
    <form onSubmit={(e) => void submit(e)} className="space-y-sp-12" noValidate>
      {notice ? <Alert variant={notice.ok ? 'success' : 'destructive'}>{notice.text}</Alert> : null}
      <div className="grid gap-sp-12 sm:grid-cols-2">
        <div className="space-y-1">
          <Label htmlFor="sr-name">{t('s16Social.automation.rules.name')}</Label>
          <Input
            id="sr-name"
            value={name}
            maxLength={100}
            onChange={(e) => setName(e.target.value)}
            autoComplete="off"
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="sr-trigger">{t('s16Social.automation.rules.trigger')}</Label>
          <Input
            id="sr-trigger"
            value={trigger}
            maxLength={42}
            onChange={(e) => setTrigger(e.target.value)}
            autoComplete="off"
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="sr-group">{t('s16Social.automation.schedules.group')}</Label>
          <NativeSelect id="sr-group" value={groupId} onChange={(e) => setGroupId(e.target.value)}>
            <option value="">{t('s16Social.posts.none')}</option>
            {groups.map((g) => (
              <option key={g.id} value={g.id}>
                {g.label}
              </option>
            ))}
          </NativeSelect>
        </div>
        <div className="space-y-1">
          <Label htmlFor="sr-mode">{t('s16Social.automation.rules.mode')}</Label>
          <NativeSelect
            id="sr-mode"
            value={mode}
            onChange={(e) => setMode(e.target.value === 'publish' ? 'publish' : 'draft')}
          >
            <option value="draft">{t('s16Social.automation.rules.modeDraft')}</option>
            <option value="publish">{t('s16Social.automation.rules.modePublish')}</option>
          </NativeSelect>
        </div>
      </div>
      <fieldset className="space-y-1">
        <legend className="text-sm font-medium">{t('s16Social.automation.rules.accounts')}</legend>
        <div className="flex flex-wrap gap-3">
          {accounts.map((a) => (
            <label key={a.id} className="flex items-center gap-1 text-sm">
              <input
                type="checkbox"
                checked={chosen.includes(a.id)}
                onChange={(e) =>
                  setChosen(e.target.checked ? [...chosen, a.id] : chosen.filter((x) => x !== a.id))
                }
              />
              {a.label}
            </label>
          ))}
        </div>
      </fieldset>
      <div className="space-y-1">
        <Label htmlFor="sr-template">{t('s16Social.automation.rules.template')}</Label>
        <Textarea
          id="sr-template"
          rows={4}
          value={template}
          maxLength={5000}
          onChange={(e) => setTemplate(e.target.value)}
        />
      </div>
      <Button
        type="submit"
        disabled={busy || name.trim() === '' || trigger.trim() === '' || chosen.length === 0}
      >
        {t('s16Social.automation.rules.create')}
      </Button>
    </form>
  );
}

/** Adds an item to the evergreen queue; the texts are separated by a line that holds only three dashes. */
export function EvergreenForm({ accounts }: { accounts: Choice[] }): JSX.Element {
  const router = useRouter();
  const [accountId, setAccountId] = useState('');
  const [name, setName] = useState('');
  const [texts, setTexts] = useState('');
  const [imageUrl, setImageUrl] = useState('');
  const [linkUrl, setLinkUrl] = useState('');
  const [priority, setPriority] = useState('3');
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<Notice>(null);

  async function submit(event: FormEvent): Promise<void> {
    event.preventDefault();
    setBusy(true);
    const variants = texts
      .split(/\n-{3}\n/)
      .map((x) => x.trim())
      .filter((x) => x !== '');
    const problem = await send(
      '/api/social/evergreen/items',
      'POST',
      {
        accountId,
        name,
        variants,
        imageUrl: orNull(imageUrl),
        linkUrl: orNull(linkUrl),
        priority: Number.parseInt(priority, 10) || 3,
      },
      true,
    );
    setNotice(
      problem
        ? { ok: false, text: problem }
        : { ok: true, text: t('s16Social.automation.evergreen.done') },
    );
    if (!problem) {
      setName('');
      setTexts('');
      router.refresh();
    }
    setBusy(false);
  }

  return (
    <form onSubmit={(e) => void submit(e)} className="space-y-sp-12" noValidate>
      {notice ? <Alert variant={notice.ok ? 'success' : 'destructive'}>{notice.text}</Alert> : null}
      <div className="grid gap-sp-12 sm:grid-cols-2">
        <div className="space-y-1">
          <Label htmlFor="se-account">{t('s16Social.automation.evergreen.account')}</Label>
          <NativeSelect
            id="se-account"
            value={accountId}
            onChange={(e) => setAccountId(e.target.value)}
          >
            <option value="">{t('s16Social.posts.choose')}</option>
            {accounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.label}
              </option>
            ))}
          </NativeSelect>
        </div>
        <div className="space-y-1">
          <Label htmlFor="se-name">{t('s16Social.automation.evergreen.name')}</Label>
          <Input
            id="se-name"
            value={name}
            maxLength={100}
            onChange={(e) => setName(e.target.value)}
            autoComplete="off"
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="se-image">{t('s16Social.automation.evergreen.image')}</Label>
          <Input
            id="se-image"
            value={imageUrl}
            onChange={(e) => setImageUrl(e.target.value)}
            autoComplete="off"
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="se-link">{t('s16Social.automation.evergreen.link')}</Label>
          <Input
            id="se-link"
            value={linkUrl}
            onChange={(e) => setLinkUrl(e.target.value)}
            autoComplete="off"
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="se-priority">{t('s16Social.automation.evergreen.priority')}</Label>
          <Input
            id="se-priority"
            inputMode="numeric"
            value={priority}
            maxLength={1}
            onChange={(e) => setPriority(e.target.value)}
          />
        </div>
      </div>
      <div className="space-y-1">
        <Label htmlFor="se-texts">{t('s16Social.automation.evergreen.variants')}</Label>
        <Textarea id="se-texts" rows={5} value={texts} onChange={(e) => setTexts(e.target.value)} />
      </div>
      <Button
        type="submit"
        disabled={busy || accountId === '' || name.trim() === '' || texts.trim() === ''}
      >
        {t('s16Social.automation.evergreen.add')}
      </Button>
    </form>
  );
}

/** Approve or refuse one post; a refusal needs a reason. */
export function DecisionButtons({ id }: { id: string }): JSX.Element {
  const router = useRouter();
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function decide(decision: 'approve' | 'reject'): Promise<void> {
    setBusy(true);
    setError(null);
    const problem = await send(
      `/api/social/posts/${id}/decide`,
      'POST',
      { decision, reason },
      true,
    );
    if (problem) setError(problem);
    else router.refresh();
    setBusy(false);
  }

  return (
    <div className="space-y-1">
      <div className="flex flex-wrap items-center gap-2">
        <Button type="button" size="sm" disabled={busy} onClick={() => void decide('approve')}>
          {t('s16Social.approvals.approve')}
        </Button>
        <Input
          aria-label={t('s16Social.approvals.reason')}
          placeholder={t('s16Social.approvals.reason')}
          value={reason}
          maxLength={300}
          className="w-56"
          onChange={(e) => setReason(e.target.value)}
        />
        <Button
          type="button"
          size="sm"
          variant="destructive"
          disabled={busy || reason.trim().length < 3}
          onClick={() => void decide('reject')}
        >
          {t('s16Social.approvals.reject')}
        </Button>
      </div>
      {error ? <Alert variant="destructive">{error}</Alert> : null}
    </div>
  );
}

/** Moves a scheduled post to another time (the field shows the local time of the browser). */
export function RescheduleForm({ id, version }: { id: string; version: number }): JSX.Element {
  const router = useRouter();
  const [when, setWhen] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function move(event: FormEvent): Promise<void> {
    event.preventDefault();
    setBusy(true);
    setError(null);
    const problem = await send(
      `/api/social/posts/${id}`,
      'PATCH',
      { version, scheduledAt: new Date(when).toISOString() },
      false,
    );
    if (problem) setError(problem);
    else router.refresh();
    setBusy(false);
  }

  return (
    <form onSubmit={(e) => void move(e)} className="space-y-1" noValidate>
      <div className="flex flex-wrap items-center gap-1">
        <Input
          type="datetime-local"
          aria-label={t('s16Social.calendar.moveTo')}
          value={when}
          className="w-52"
          onChange={(e) => setWhen(e.target.value)}
        />
        <Button type="submit" size="sm" variant="outline" disabled={busy || when === ''}>
          {t('s16Social.calendar.move')}
        </Button>
      </div>
      {error ? <Alert variant="destructive">{error}</Alert> : null}
    </form>
  );
}
