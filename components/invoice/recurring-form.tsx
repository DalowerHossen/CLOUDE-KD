// path: components/invoice/recurring-form.tsx
'use client';
import { useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { z } from 'zod';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { NativeSelect } from '@/components/ui/native-select';
import { t, type StringKey } from '@/lib/i18n';
import type { InvoiceInput } from '@/lib/invoice/input';
import {
  MAX_EVERY,
  RECURRENCE_PRESETS,
  RECURRENCE_UNITS,
  previewDates,
  type RecurrenceUnit,
} from '@/lib/schedule/recurrence';
import { callJson } from './api-call';

const idBody = z.object({ id: z.string(), version: z.number() });

export interface RecurringFormValue {
  name: string;
  unit: RecurrenceUnit;
  every: number;
  monthEnd: boolean;
  startDate: string;
  endDate: string | null;
  maxOccurrences: number | null;
  autoSend: boolean;
  sendMessage: string;
}

export function RecurringForm({
  scheduleId,
  version,
  template,
  summary,
  initial,
  isOwner,
  occurrencesDone,
  locked,
}: {
  scheduleId: string | null;
  version: number;
  template: InvoiceInput;
  summary: string;
  initial: RecurringFormValue;
  isOwner: boolean;
  occurrencesDone: number;
  /** True when the schedule already made invoices: the repeat rule can no longer change. */
  locked: boolean;
}): JSX.Element {
  const router = useRouter();
  const [v, setV] = useState<RecurringFormValue>(initial);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<{ ok: boolean; text: string } | null>(null);
  const key = useRef(crypto.randomUUID());
  const upcoming = useMemo(
    () =>
      v.every >= 1 && v.every <= MAX_EVERY[v.unit] && v.startDate !== ''
        ? previewDates(v, occurrencesDone, 5)
        : [],
    [v, occurrencesDone],
  );
  const preset = RECURRENCE_PRESETS.find((p) => p.unit === v.unit && p.every === v.every);

  async function save(): Promise<void> {
    setBusy(true);
    setNote(null);
    const schedule = {
      name: v.name,
      template,
      unit: v.unit,
      every: v.every,
      monthEnd: v.monthEnd,
      startDate: v.startDate,
      endDate: v.endDate === '' ? null : v.endDate,
      maxOccurrences: v.maxOccurrences,
      autoSend: v.autoSend,
      sendMessage: v.sendMessage,
    };
    const r = scheduleId
      ? await callJson(`/api/invoices/recurring/${scheduleId}`, 'PUT', {
          expectedVersion: version,
          schedule,
        })
      : await callJson('/api/invoices/recurring', 'POST', schedule, {
          'idempotency-key': key.current,
        });
    if (r.ok) {
      const saved = idBody.safeParse(r.data);
      setNote({ ok: true, text: t('s09Recurring.form.created') });
      if (!scheduleId && saved.success) router.replace(`/invoices/recurring/${saved.data.id}`);
      router.refresh();
    } else if (r.status === 409) setNote({ ok: false, text: t('s09Recurring.form.conflict') });
    else setNote({ ok: false, text: r.message ?? t('s09Recurring.form.error') });
    setBusy(false);
  }

  return (
    <form
      className="space-y-sp-16 text-sm"
      onSubmit={(e) => {
        e.preventDefault();
        void save();
      }}
    >
      <p className="rounded-lg border bg-card p-sp-12">
        <span className="font-medium">{t('s09Recurring.form.template')}:</span>{' '}
        {template.billTo.name} - {summary}
      </p>
      <label className="block">
        {t('s09Recurring.form.name')}
        <Input
          required
          maxLength={100}
          value={v.name}
          onChange={(e) => setV({ ...v, name: e.target.value })}
        />
      </label>
      <fieldset disabled={locked} className="grid gap-sp-12 sm:grid-cols-2">
        <label>
          {t('s09Recurring.form.repeat')}
          <NativeSelect
            value={preset?.key ?? 'custom'}
            onChange={(e) => {
              const p = RECURRENCE_PRESETS.find((x) => x.key === e.target.value);
              if (p) setV({ ...v, unit: p.unit, every: p.every });
            }}
          >
            {RECURRENCE_PRESETS.map((p) => (
              <option key={p.key} value={p.key}>
                {t(`s09Recurring.presets.${p.key}` as StringKey)}
              </option>
            ))}
            <option value="custom">{t('s09Recurring.presets.custom')}</option>
          </NativeSelect>
        </label>
        <div className="flex gap-sp-8">
          <label className="flex-1">
            {t('s09Recurring.form.every')}
            <Input
              type="number"
              min={1}
              max={MAX_EVERY[v.unit]}
              value={v.every}
              onChange={(e) => setV({ ...v, every: Math.max(1, e.target.valueAsNumber || 1) })}
            />
          </label>
          <label className="flex-1">
            {t('s09Recurring.form.unit')}
            <NativeSelect
              value={v.unit}
              onChange={(e) =>
                setV({ ...v, unit: RECURRENCE_UNITS.find((u) => u === e.target.value) ?? 'month' })
              }
            >
              {RECURRENCE_UNITS.map((u) => (
                <option key={u} value={u}>
                  {t(`s09Recurring.units.${u}` as StringKey)}
                </option>
              ))}
            </NativeSelect>
          </label>
        </div>
        {v.unit === 'month' || v.unit === 'year' ? (
          <label className="flex items-center gap-sp-8 sm:col-span-2">
            <input
              type="checkbox"
              checked={v.monthEnd}
              onChange={(e) => setV({ ...v, monthEnd: e.target.checked })}
            />
            {t('s09Recurring.form.monthEnd')}
          </label>
        ) : null}
        <label>
          {t('s09Recurring.form.startDate')}
          <Input
            type="date"
            required
            value={v.startDate}
            onChange={(e) => setV({ ...v, startDate: e.target.value })}
          />
        </label>
      </fieldset>
      <div className="grid gap-sp-12 sm:grid-cols-2">
        <label>
          {t('s09Recurring.form.endDate')}
          <Input
            type="date"
            value={v.endDate ?? ''}
            onChange={(e) => setV({ ...v, endDate: e.target.value === '' ? null : e.target.value })}
          />
        </label>
        <label>
          {t('s09Recurring.form.maxOccurrences')}
          <Input
            type="number"
            min={1}
            max={1000}
            value={v.maxOccurrences ?? ''}
            onChange={(e) =>
              setV({
                ...v,
                maxOccurrences:
                  e.target.value === '' ? null : Math.max(1, e.target.valueAsNumber || 1),
              })
            }
          />
        </label>
      </div>
      <label className="flex items-center gap-sp-8">
        <input
          type="checkbox"
          checked={v.autoSend}
          disabled={!isOwner}
          onChange={(e) => setV({ ...v, autoSend: e.target.checked })}
        />
        {t('s09Recurring.form.autoSend')}
        {!isOwner ? (
          <span className="text-muted-foreground">{t('s09Recurring.form.autoSendOwner')}</span>
        ) : null}
      </label>
      <label className="block">
        {t('s09Recurring.form.sendMessage')}
        <Input
          maxLength={1000}
          value={v.sendMessage}
          onChange={(e) => setV({ ...v, sendMessage: e.target.value })}
        />
      </label>
      <p className="text-muted-foreground">{t('s09Recurring.form.placeholders')}</p>
      {upcoming.length > 0 ? (
        <p>
          {t('s09Recurring.form.upcoming')}: {upcoming.join(', ')}
        </p>
      ) : null}
      <Button type="submit" disabled={busy}>
        {busy ? t('s09Recurring.form.saving') : t('s09Recurring.form.save')}
      </Button>
      {note ? (
        <p role={note.ok ? 'status' : 'alert'} className={note.ok ? undefined : 'text-destructive'}>
          {note.text}
        </p>
      ) : null}
    </form>
  );
}
