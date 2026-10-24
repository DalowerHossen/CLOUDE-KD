// path: components/project/time-tracker.tsx
'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { z } from 'zod';
import { callJson } from '@/components/invoice/api-call';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { NativeSelect } from '@/components/ui/native-select';
import { t } from '@/lib/i18n';

const stopBody = z.object({ hours: z.string() });

export interface ProjectChoice {
  id: string;
  name: string;
  billable: boolean;
}

export function TimeTracker({
  projects,
  running,
  today,
}: {
  projects: ProjectChoice[];
  running: { projectName: string; startedAt: string } | null;
  today: string;
}): JSX.Element {
  const router = useRouter();
  const [projectId, setProjectId] = useState(projects[0]?.id ?? '');
  const [note, setNote] = useState('');
  const [billable, setBillable] = useState(true);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [now, setNow] = useState<number | null>(null);
  const [date, setDate] = useState(today);
  const [hours, setHours] = useState('');

  useEffect(() => {
    if (!running) return undefined;
    const first = setTimeout(() => setNow(Date.now()), 0);
    const timer = setInterval(() => setNow(Date.now()), 30_000);
    return () => {
      clearTimeout(first);
      clearInterval(timer);
    };
  }, [running]);

  async function timer(method: 'POST' | 'DELETE'): Promise<void> {
    setBusy(true);
    setMessage(null);
    const r = await callJson(
      '/api/time/timer',
      method,
      method === 'POST' ? { projectId, description: note, billable } : undefined,
    );
    if (r.ok) {
      if (method === 'DELETE') {
        const parsed = stopBody.safeParse(r.data);
        setMessage({
          ok: true,
          text: t('s09Projects.time.timer.saved', {
            hours: parsed.success ? parsed.data.hours : '',
          }),
        });
      }
      setNote('');
      router.refresh();
    } else setMessage({ ok: false, text: r.message ?? t('s09Projects.time.error') });
    setBusy(false);
  }

  async function addManual(): Promise<void> {
    setBusy(true);
    setMessage(null);
    const r = await callJson(
      '/api/time',
      'POST',
      {
        projectId,
        workDate: date,
        hours: hours.trim(),
        description: note,
        billable,
        milestoneId: null,
      },
      { 'idempotency-key': crypto.randomUUID() },
    );
    if (r.ok) {
      setHours('');
      setNote('');
      setMessage({ ok: true, text: t('s09Projects.time.saved') });
      router.refresh();
    } else setMessage({ ok: false, text: r.message ?? t('s09Projects.time.error') });
    setBusy(false);
  }

  const elapsed =
    running && now !== null
      ? `${String(Math.floor((now - Date.parse(running.startedAt)) / 3_600_000)).padStart(2, '0')}:${String(Math.floor(((now - Date.parse(running.startedAt)) % 3_600_000) / 60_000)).padStart(2, '0')}`
      : '';
  return (
    <section className="space-y-sp-12 rounded-lg border bg-card p-sp-12 text-sm print:hidden">
      <h2 className="text-lg font-semibold">{t('s09Projects.time.timer.title')}</h2>
      {running ? (
        <div className="flex flex-wrap items-center gap-sp-12">
          <p aria-live="polite">
            {t('s09Projects.time.timer.running', {
              time: elapsed,
              project: running.projectName,
            })}
          </p>
          <Button type="button" disabled={busy} onClick={() => void timer('DELETE')}>
            {t('s09Projects.time.timer.stop')}
          </Button>
        </div>
      ) : projects.length === 0 ? (
        <p className="text-muted-foreground">{t('s09Projects.empty')}</p>
      ) : (
        <form
          className="grid gap-sp-8 sm:grid-cols-4"
          onSubmit={(e) => {
            e.preventDefault();
          }}
        >
          <label>
            {t('s09Projects.time.project')}
            <NativeSelect
              value={projectId}
              onChange={(e) => {
                setProjectId(e.target.value);
                setBillable(projects.find((p) => p.id === e.target.value)?.billable ?? true);
              }}
            >
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </NativeSelect>
          </label>
          <label className="sm:col-span-3">
            {t('s09Projects.time.note')}
            <Input maxLength={1000} value={note} onChange={(e) => setNote(e.target.value)} />
          </label>
          <label>
            {t('s09Projects.time.date')}
            <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </label>
          <label>
            {t('s09Projects.time.hours')}
            <Input
              inputMode="decimal"
              placeholder="1.5"
              value={hours}
              onChange={(e) => setHours(e.target.value)}
            />
          </label>
          <label className="flex items-end gap-sp-8 pb-sp-4">
            <input
              type="checkbox"
              checked={billable}
              onChange={(e) => setBillable(e.target.checked)}
            />
            {t('s09Projects.time.billable')}
          </label>
          <div className="flex items-end gap-sp-8">
            <Button
              type="button"
              disabled={busy || projectId === ''}
              onClick={() => void timer('POST')}
            >
              {t('s09Projects.time.timer.start')}
            </Button>
            <Button
              type="button"
              variant="outline"
              disabled={busy || hours.trim() === ''}
              onClick={() => void addManual()}
            >
              {t('s09Projects.time.add')}
            </Button>
          </div>
        </form>
      )}
      {message ? (
        <p
          role={message.ok ? 'status' : 'alert'}
          className={message.ok ? undefined : 'text-destructive'}
        >
          {message.text}
        </p>
      ) : null}
    </section>
  );
}
