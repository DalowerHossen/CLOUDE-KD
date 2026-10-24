// path: components/dunning/reminder-settings-form.tsx
'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { callJson } from '@/components/invoice/api-call';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { t } from '@/lib/i18n';
import { MAX_STEPS } from '@/lib/schedule/reminders';

export interface ReminderFormValue {
  enabled: boolean;
  steps: number[];
  quietStart: number;
  quietEnd: number;
  businessDaysOnly: boolean;
  ccOwner: boolean;
  message: string;
}

function stepLabel(n: number): string {
  if (n < 0) return t('s09Dunning.reminders.stepBefore', { days: String(-n) });
  if (n === 0) return t('s09Dunning.reminders.stepDue');
  return t('s09Dunning.reminders.stepAfter', { days: String(n) });
}

export function ReminderSettingsForm({
  initial,
  version,
  canManage,
}: {
  initial: ReminderFormValue;
  version: number;
  canManage: boolean;
}): JSX.Element {
  const router = useRouter();
  const [v, setV] = useState<ReminderFormValue>(initial);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<{ ok: boolean; text: string } | null>(null);

  async function save(): Promise<void> {
    setBusy(true);
    setNote(null);
    const r = await callJson('/api/invoices/reminders/settings', 'PUT', {
      expectedVersion: version,
      settings: v,
    });
    if (r.ok) {
      setNote({ ok: true, text: t('s09Dunning.reminders.saved') });
      router.refresh();
    } else if (r.status === 409) setNote({ ok: false, text: t('s09Dunning.reminders.conflict') });
    else setNote({ ok: false, text: r.message ?? t('s09Dunning.reminders.error') });
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
      <fieldset disabled={!canManage} className="space-y-sp-16">
        <label className="flex items-center gap-sp-8">
          <input
            type="checkbox"
            checked={v.enabled}
            onChange={(e) => setV({ ...v, enabled: e.target.checked })}
          />
          {t('s09Dunning.reminders.enabled')}
        </label>
        <div className="space-y-sp-8">
          <h2 className="font-medium">{t('s09Dunning.reminders.steps')}</h2>
          <p className="text-muted-foreground">{t('s09Dunning.reminders.stepsHelp')}</p>
          <ul className="space-y-sp-4">
            {v.steps.map((s, i) => (
              <li key={i} className="flex items-center gap-sp-8">
                <Input
                  type="number"
                  className="w-24"
                  min={-30}
                  max={365}
                  aria-label={t('s09Dunning.reminders.steps')}
                  value={s}
                  onChange={(e) =>
                    setV({
                      ...v,
                      steps: v.steps.map((x, j) =>
                        j === i ? Math.trunc(e.target.valueAsNumber || 0) : x,
                      ),
                    })
                  }
                />
                <span className="text-muted-foreground">{stepLabel(s)}</span>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setV({ ...v, steps: v.steps.filter((_, j) => j !== i) })}
                >
                  {t('s09Dunning.reminders.removeStep')}
                </Button>
              </li>
            ))}
          </ul>
          {v.steps.length < MAX_STEPS ? (
            <Button
              type="button"
              variant="outline"
              onClick={() => setV({ ...v, steps: [...v.steps, 7] })}
            >
              {t('s09Dunning.reminders.addStep')}
            </Button>
          ) : null}
        </div>
        <div className="space-y-sp-8">
          <h2 className="font-medium">{t('s09Dunning.reminders.quiet')}</h2>
          <div className="flex gap-sp-12">
            <label>
              {t('s09Dunning.reminders.quietFrom')}
              <Input
                type="number"
                min={0}
                max={23}
                value={v.quietStart}
                onChange={(e) =>
                  setV({
                    ...v,
                    quietStart: Math.min(23, Math.max(0, Math.trunc(e.target.valueAsNumber || 0))),
                  })
                }
              />
            </label>
            <label>
              {t('s09Dunning.reminders.quietTo')}
              <Input
                type="number"
                min={0}
                max={23}
                value={v.quietEnd}
                onChange={(e) =>
                  setV({
                    ...v,
                    quietEnd: Math.min(23, Math.max(0, Math.trunc(e.target.valueAsNumber || 0))),
                  })
                }
              />
            </label>
          </div>
        </div>
        <label className="flex items-center gap-sp-8">
          <input
            type="checkbox"
            checked={v.businessDaysOnly}
            onChange={(e) => setV({ ...v, businessDaysOnly: e.target.checked })}
          />
          {t('s09Dunning.reminders.businessDays')}
        </label>
        <label className="flex items-center gap-sp-8">
          <input
            type="checkbox"
            checked={v.ccOwner}
            onChange={(e) => setV({ ...v, ccOwner: e.target.checked })}
          />
          {t('s09Dunning.reminders.ccOwner')}
        </label>
        <label className="block">
          {t('s09Dunning.reminders.message')}
          <Input
            maxLength={1000}
            value={v.message}
            onChange={(e) => setV({ ...v, message: e.target.value })}
          />
        </label>
      </fieldset>
      <p className="text-muted-foreground">{t('s09Dunning.reminders.note')}</p>
      {canManage ? (
        <Button type="submit" disabled={busy}>
          {busy ? t('s09Dunning.reminders.saving') : t('s09Dunning.reminders.save')}
        </Button>
      ) : null}
      {note ? (
        <p role={note.ok ? 'status' : 'alert'} className={note.ok ? undefined : 'text-destructive'}>
          {note.text}
        </p>
      ) : null}
    </form>
  );
}
