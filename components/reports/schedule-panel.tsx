// path: components/reports/schedule-panel.tsx
'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { callJson } from '@/components/invoice/api-call';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { NativeSelect } from '@/components/ui/native-select';
import { t, type StringKey } from '@/lib/i18n';
import { RANGE_KEYS, type RangeKey } from '@/lib/reports/ranges';

export interface ScheduleRow {
  id: string;
  name: string;
  reportKey: string;
  frequency: 'weekly' | 'monthly';
  format: string;
  enabled: boolean;
  nextRunOn: string;
  lastRunOn: string | null;
  lastError: string;
  recipients: string[];
}

export function SchedulePanel({
  reportKey,
  groupable,
  schedules,
}: {
  reportKey: string;
  groupable: boolean;
  schedules: ScheduleRow[];
}): JSX.Element {
  const router = useRouter();
  const [name, setName] = useState('');
  const [range, setRange] = useState<RangeKey>('last_month');
  const [format, setFormat] = useState<'csv' | 'xlsx' | 'pdf'>('pdf');
  const [frequency, setFrequency] = useState<'weekly' | 'monthly'>('monthly');
  const [weekday, setWeekday] = useState(1);
  const [monthDay, setMonthDay] = useState(1);
  const [recipients, setRecipients] = useState('');
  const [groupBy, setGroupBy] = useState<'project' | 'person'>('project');
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<{ ok: boolean; text: string } | null>(null);

  async function create(): Promise<void> {
    setBusy(true);
    setNote(null);
    const r = await callJson('/api/reports/schedules', 'POST', {
      reportKey,
      name: name.trim(),
      range,
      ...(groupable ? { groupBy } : {}),
      format,
      frequency,
      weekday: frequency === 'weekly' ? weekday : null,
      monthDay: frequency === 'monthly' ? monthDay : null,
      recipients: recipients
        .split(',')
        .map((x) => x.trim())
        .filter((x) => x !== ''),
      enabled: true,
    });
    if (r.ok) {
      setName('');
      setRecipients('');
      setNote({ ok: true, text: t('s09Reports.schedule.created') });
      router.refresh();
    } else setNote({ ok: false, text: r.message ?? t('s09Reports.schedule.error') });
    setBusy(false);
  }

  async function act(id: string, action: 'toggle' | 'delete', enabled?: boolean): Promise<void> {
    setBusy(true);
    const r =
      action === 'delete'
        ? await callJson(`/api/reports/schedules/${id}`, 'DELETE')
        : await callJson(`/api/reports/schedules/${id}`, 'PATCH', { enabled });
    if (r.ok) router.refresh();
    else setNote({ ok: false, text: r.message ?? t('s09Reports.schedule.error') });
    setBusy(false);
  }

  return (
    <section className="space-y-sp-12 text-sm print:hidden">
      <h3 className="font-medium">{t('s09Reports.schedule.title')}</h3>
      <p className="text-muted-foreground">{t('s09Reports.schedule.help')}</p>
      <div>
        <h4 className="font-medium">{t('s09Reports.schedule.existing')}</h4>
        {schedules.length === 0 ? (
          <p className="text-muted-foreground">{t('s09Reports.schedule.none')}</p>
        ) : (
          <ul className="space-y-sp-8">
            {schedules.map((s) => (
              <li key={s.id} className="rounded-lg border p-sp-8">
                <p>
                  <strong>{s.name}</strong> ({s.reportKey}, {s.format.toUpperCase()},{' '}
                  {t(`s09Reports.schedule.${s.frequency}` as StringKey)}) -{' '}
                  {s.enabled ? t('s09Reports.schedule.on') : t('s09Reports.schedule.off')}
                </p>
                <p className="text-muted-foreground">
                  {s.recipients.join(', ')} -{' '}
                  {t('s09Reports.schedule.nextRun', { date: s.nextRunOn })}
                  {s.lastRunOn
                    ? ` - ${t('s09Reports.schedule.lastRun', { date: s.lastRunOn })}`
                    : ''}
                </p>
                {s.lastError ? (
                  <p className="text-destructive">
                    {t('s09Reports.schedule.failed', { error: s.lastError })}
                  </p>
                ) : null}
                <div className="mt-sp-4 flex gap-sp-8">
                  <Button
                    type="button"
                    variant="outline"
                    disabled={busy}
                    onClick={() => void act(s.id, 'toggle', !s.enabled)}
                  >
                    {s.enabled ? t('s09Reports.schedule.turnOff') : t('s09Reports.schedule.turnOn')}
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    disabled={busy}
                    onClick={() => void act(s.id, 'delete')}
                  >
                    {t('s09Reports.schedule.delete')}
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
      <form
        className="grid gap-sp-8 sm:grid-cols-3"
        onSubmit={(e) => {
          e.preventDefault();
          void create();
        }}
      >
        <label>
          {t('s09Reports.schedule.name')}
          <Input required maxLength={80} value={name} onChange={(e) => setName(e.target.value)} />
        </label>
        <label>
          {t('s09Reports.schedule.range')}
          <NativeSelect
            value={range}
            onChange={(e) => setRange(RANGE_KEYS.find((k) => k === e.target.value) ?? 'last_month')}
          >
            {RANGE_KEYS.map((k) => (
              <option key={k} value={k}>
                {t(`s09Dashboard.ranges.${k}` as StringKey)}
              </option>
            ))}
          </NativeSelect>
        </label>
        <label>
          {t('s09Reports.schedule.format')}
          <NativeSelect
            value={format}
            onChange={(e) =>
              setFormat(
                e.target.value === 'csv' ? 'csv' : e.target.value === 'xlsx' ? 'xlsx' : 'pdf',
              )
            }
          >
            <option value="pdf">PDF</option>
            <option value="xlsx">Excel</option>
            <option value="csv">CSV</option>
          </NativeSelect>
        </label>
        <label>
          {t('s09Reports.schedule.frequency')}
          <NativeSelect
            value={frequency}
            onChange={(e) => setFrequency(e.target.value === 'weekly' ? 'weekly' : 'monthly')}
          >
            <option value="monthly">{t('s09Reports.schedule.monthly')}</option>
            <option value="weekly">{t('s09Reports.schedule.weekly')}</option>
          </NativeSelect>
        </label>
        {frequency === 'weekly' ? (
          <label>
            {t('s09Reports.schedule.weekday')}
            <NativeSelect
              value={String(weekday)}
              onChange={(e) =>
                setWeekday(Math.min(7, Math.max(1, Math.trunc(Number(e.target.value)) || 1)))
              }
            >
              {(['1', '2', '3', '4', '5', '6', '7'] as const).map((d) => (
                <option key={d} value={d}>
                  {t(`s09Reports.schedule.weekdays.${d}`)}
                </option>
              ))}
            </NativeSelect>
          </label>
        ) : (
          <label>
            {t('s09Reports.schedule.monthDay')}
            <Input
              type="number"
              min={1}
              max={28}
              value={monthDay}
              onChange={(e) =>
                setMonthDay(Math.min(28, Math.max(1, Math.trunc(e.target.valueAsNumber) || 1)))
              }
            />
          </label>
        )}
        {groupable ? (
          <label>
            {t('s09Reports.filters.groupBy')}
            <NativeSelect
              value={groupBy}
              onChange={(e) => setGroupBy(e.target.value === 'person' ? 'person' : 'project')}
            >
              <option value="project">{t('s09Reports.filters.byProject')}</option>
              <option value="person">{t('s09Reports.filters.byPerson')}</option>
            </NativeSelect>
          </label>
        ) : null}
        <label className="sm:col-span-3">
          {t('s09Reports.schedule.recipients')}
          <Input required value={recipients} onChange={(e) => setRecipients(e.target.value)} />
        </label>
        <div>
          <Button type="submit" disabled={busy}>
            {t('s09Reports.schedule.create')}
          </Button>
        </div>
      </form>
      {note ? (
        <p role={note.ok ? 'status' : 'alert'} className={note.ok ? undefined : 'text-destructive'}>
          {note.text}
        </p>
      ) : null}
    </section>
  );
}
