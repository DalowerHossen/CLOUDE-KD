// path: components/project/time-settings-form.tsx
'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { callJson } from '@/components/invoice/api-call';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { NativeSelect } from '@/components/ui/native-select';
import { t } from '@/lib/i18n';

const STEPS = [0, 5, 6, 10, 15, 30, 60] as const;

export function TimeSettingsForm({
  initial,
  version,
}: {
  initial: { requireApproval: boolean; roundMinutes: number; lockThrough: string | null };
  version: number;
}): JSX.Element {
  const router = useRouter();
  const [v, setV] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<{ ok: boolean; text: string } | null>(null);

  async function save(): Promise<void> {
    setBusy(true);
    setNote(null);
    const r = await callJson('/api/time/settings', 'PUT', { ...v, expectedVersion: version });
    if (r.ok) {
      setNote({ ok: true, text: t('s09Projects.time.saved') });
      router.refresh();
    } else setNote({ ok: false, text: r.message ?? t('s09Projects.time.error') });
    setBusy(false);
  }

  return (
    <form
      className="space-y-sp-12 text-sm"
      onSubmit={(e) => {
        e.preventDefault();
        void save();
      }}
    >
      <h2 className="text-lg font-semibold">{t('s09Projects.time.settings.title')}</h2>
      <label className="flex items-center gap-sp-8">
        <input
          type="checkbox"
          checked={v.requireApproval}
          onChange={(e) => setV({ ...v, requireApproval: e.target.checked })}
        />
        {t('s09Projects.time.settings.requireApproval')}
      </label>
      <label className="block">
        {t('s09Projects.time.settings.round')}
        <NativeSelect
          value={String(v.roundMinutes)}
          onChange={(e) =>
            setV({ ...v, roundMinutes: STEPS.find((s) => String(s) === e.target.value) ?? 0 })
          }
        >
          {STEPS.map((s) => (
            <option key={s} value={s}>
              {s === 0 ? t('s09Projects.time.settings.noRound') : String(s)}
            </option>
          ))}
        </NativeSelect>
      </label>
      <label className="block">
        {t('s09Projects.time.settings.lock')}
        <Input
          type="date"
          value={v.lockThrough ?? ''}
          onChange={(e) =>
            setV({ ...v, lockThrough: e.target.value === '' ? null : e.target.value })
          }
        />
        <span className="text-muted-foreground">{t('s09Projects.time.settings.lockHelp')}</span>
      </label>
      <Button type="submit" disabled={busy}>
        {t('s09Projects.time.settings.save')}
      </Button>
      {note ? (
        <p role={note.ok ? 'status' : 'alert'} className={note.ok ? undefined : 'text-destructive'}>
          {note.text}
        </p>
      ) : null}
    </form>
  );
}
