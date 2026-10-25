// path: components/payment/admin/health-board.tsx
'use client';
import { useCallback, useEffect, useState } from 'react';
import { z } from 'zod';
import { Alert } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { t, type StringKey } from '@/lib/i18n';
import type { HealthView } from '@/services/payment/health';

const REFRESH_MS = 15_000;
const errorBody = z.object({
  error: z.object({ code: z.string().optional(), message: z.string() }),
});
const listBody = z.object({ data: z.array(z.object({ id: z.string() }).passthrough()) });
const checkBody = z.object({
  data: z.object({
    status: z.string(),
    responseMs: z.number().nullable(),
    error: z.string().nullable(),
  }),
});
const testBody = z.object({
  data: z.object({ ok: z.boolean(), message: z.string().optional() }).passthrough(),
});

const utc = (v: string | null): string =>
  v ? v.replace('T', ' ').slice(0, 19) + ' UTC' : t('s10Processors.health.never');
const SQUARE: Record<string, string> = {
  healthy: '[+]',
  degraded: '[~]',
  down: '[x]',
  unknown: '[ ]',
};

/** The health of all processors, refreshed by itself, with a live check and a "test and enable again" button. */
export function HealthBoard({ initial }: { initial: HealthView[] }): JSX.Element {
  const [rows, setRows] = useState<HealthView[]>(initial);
  const [stamp, setStamp] = useState<string>(() => new Date().toISOString().slice(11, 19));
  const [busy, setBusy] = useState<string | null>(null);
  const [note, setNote] = useState<{ ok: boolean; text: string } | null>(null);

  const refresh = useCallback(async (): Promise<void> => {
    try {
      const response = await fetch('/api/admin/processors/health', { cache: 'no-store' });
      const json: unknown = await response.json().catch(() => null);
      if (response.ok && listBody.safeParse(json).success) {
        setRows((json as { data: HealthView[] }).data);
        setStamp(new Date().toISOString().slice(11, 19));
      }
    } catch {
      // keep the last list; the next refresh tries again
    }
  }, []);

  useEffect(() => {
    const timer = setInterval(() => void refresh(), REFRESH_MS);
    return () => clearInterval(timer);
  }, [refresh]);

  const fail = (json: unknown): string => {
    const parsed = errorBody.safeParse(json);
    if (parsed.success && parsed.data.error.code === 'step_up_required')
      return t('s10Processors.health.needStepUp');
    return parsed.success ? parsed.data.error.message : t('s10Processors.health.failed');
  };

  async function checkNow(row: HealthView): Promise<void> {
    setBusy(row.id);
    setNote(null);
    try {
      const response = await fetch(`/api/admin/processors/${row.id}/health`, { cache: 'no-store' });
      const json: unknown = await response.json().catch(() => null);
      const parsed = checkBody.safeParse(json);
      if (response.ok && parsed.success) {
        const detail = parsed.data.data.error ? ` - ${parsed.data.data.error}` : '';
        setNote({
          ok: parsed.data.data.status !== 'down',
          text: t('s10Processors.health.checkResult', {
            name: row.name,
            status: t(`s10Processors.health.status.${parsed.data.data.status}` as StringKey),
            detail,
          }),
        });
        await refresh();
      } else {
        setNote({ ok: false, text: fail(json) });
      }
    } catch {
      setNote({ ok: false, text: t('s10Processors.health.failed') });
    } finally {
      setBusy(null);
    }
  }

  async function reenable(row: HealthView): Promise<void> {
    setBusy(row.id);
    setNote(null);
    const post = (body: unknown): Promise<Response> =>
      fetch(`/api/admin/processors/${row.id}/actions`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      });
    try {
      const tested = await post({ action: 'test' });
      const testJson: unknown = await tested.json().catch(() => null);
      const result = testBody.safeParse(testJson);
      if (!tested.ok || !result.success) {
        setNote({ ok: false, text: fail(testJson) });
        return;
      }
      if (!result.data.data.ok) {
        setNote({
          ok: false,
          text: t('s10Processors.health.testFailed', {
            name: row.name,
            message: result.data.data.message ?? '',
          }),
        });
        return;
      }
      const enabled = await post({ action: 'enable', expectedVersion: null });
      if (!enabled.ok) {
        setNote({ ok: false, text: fail(await enabled.json().catch(() => null)) });
        return;
      }
      setNote({ ok: true, text: t('s10Processors.health.reenabled', { name: row.name }) });
      await refresh();
    } catch {
      setNote({ ok: false, text: t('s10Processors.health.failed') });
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="space-y-sp-12">
      <p className="text-sm text-muted-foreground" aria-live="polite">
        {t('s10Processors.health.refreshed', { time: stamp })}
      </p>
      {note ? <Alert variant={note.ok ? 'success' : 'destructive'}>{note.text}</Alert> : null}
      <ul className="space-y-sp-8">
        {rows.map((row) => (
          <li key={row.id} className="space-y-2 rounded-lg border bg-card p-sp-12 text-sm">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-base font-semibold">{row.name}</span>
              <Badge
                variant={
                  row.status === 'down'
                    ? 'destructive'
                    : row.status === 'healthy'
                      ? 'default'
                      : 'outline'
                }
              >
                {t(`s10Processors.health.status.${row.status}` as StringKey)}
              </Badge>
              <Badge variant={row.autoDisabled ? 'destructive' : 'outline'}>
                {!row.available
                  ? t('s10Processors.health.state.notAvailable')
                  : row.autoDisabled
                    ? t('s10Processors.health.state.autoDisabled')
                    : row.enabled
                      ? t('s10Processors.health.state.enabled')
                      : t('s10Processors.health.state.disabled')}
              </Badge>
              {row.environment ? <Badge variant="outline">{row.environment}</Badge> : null}
            </div>
            <dl className="grid gap-x-sp-16 gap-y-1 sm:grid-cols-2 lg:grid-cols-4">
              <div>
                <dt className="text-muted-foreground">
                  {t('s10Processors.health.columns.response')}
                </dt>
                <dd>{row.responseMs === null ? '-' : `${row.responseMs} ms`}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">
                  {t('s10Processors.health.columns.checked')}
                </dt>
                <dd>{utc(row.lastCheckedAt)}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">
                  {t('s10Processors.health.columns.failures')}
                </dt>
                <dd>
                  {row.consecutiveFailures} / {row.allowedFailures}
                </dd>
              </div>
              <div>
                <dt className="text-muted-foreground">
                  {t(('s10Processors.health.probe.' + row.probe) as StringKey)}
                </dt>
                <dd>{t('s10Processors.health.interval', { minutes: row.intervalMinutes })}</dd>
              </div>
            </dl>
            <p className="font-mono text-xs" aria-label="recent checks">
              {row.recent.map((s) => SQUARE[s] ?? '[ ]').join(' ') || '-'}
            </p>
            <p className="text-xs text-muted-foreground">
              {t('s10Processors.health.lastOk', { time: utc(row.lastOkAt) })}
            </p>
            {row.lastError ? <p className="text-xs text-destructive">{row.lastError}</p> : null}
            {row.disabledReason && !row.enabled ? (
              <p className="text-xs text-muted-foreground">{row.disabledReason}</p>
            ) : null}
            {row.available ? (
              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  disabled={busy !== null}
                  onClick={() => void checkNow(row)}
                >
                  {busy === row.id
                    ? t('s10Processors.health.checking')
                    : t('s10Processors.health.checkNow')}
                </Button>
                {!row.enabled ? (
                  <Button
                    type="button"
                    size="sm"
                    disabled={busy !== null}
                    onClick={() => void reenable(row)}
                  >
                    {busy === row.id
                      ? t('s10Processors.health.reenabling')
                      : t('s10Processors.health.reenable')}
                  </Button>
                ) : null}
              </div>
            ) : null}
          </li>
        ))}
      </ul>
      <p className="text-xs text-muted-foreground">{t('s10Processors.health.notice')}</p>
    </div>
  );
}
