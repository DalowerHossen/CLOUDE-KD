// path: components/invoice/batch-live.tsx
'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { callJson } from '@/components/invoice/api-call';
import { Button } from '@/components/ui/button';
import { t } from '@/lib/i18n';
import { batchPercent } from '@/lib/invoice/batch';

/** Reloads the page every few seconds while a batch is waiting or running, and shows the progress bar. */
export function BatchLive({
  id,
  status,
  counts,
  canAct,
}: {
  id: string;
  status: 'queued' | 'running' | 'done' | 'cancelled';
  counts: { total: number; done: number; failed: number; skipped: number };
  canAct: boolean;
}): JSX.Element {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const live = status === 'queued' || status === 'running';
  useEffect(() => {
    if (!live) return undefined;
    const timer = setInterval(() => router.refresh(), 4000);
    return () => clearInterval(timer);
  }, [live, router]);
  const percent = batchPercent(counts);

  async function act(kind: 'retry' | 'cancel'): Promise<void> {
    if (kind === 'cancel' && !window.confirm(t('s09Batches.detail.confirmCancel'))) return;
    setBusy(true);
    setError(null);
    const r =
      kind === 'retry'
        ? await callJson(`/api/invoices/batches/${id}/retry`, 'POST')
        : await callJson(`/api/invoices/batches/${id}`, 'DELETE');
    if (r.ok) router.refresh();
    else setError(r.message ?? t('s09Batches.detail.error'));
    setBusy(false);
  }

  return (
    <div className="space-y-sp-8 text-sm">
      <div
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={percent}
        aria-label={t('s09Batches.title')}
        className="h-3 w-full overflow-hidden rounded bg-muted"
      >
        <div className="h-full bg-primary" style={{ width: `${percent}%` }} />
      </div>
      <p aria-live="polite">
        {t('s09Batches.progress', {
          done: String(counts.done),
          failed: String(counts.failed),
          skipped: String(counts.skipped),
          total: String(counts.total),
        })}
      </p>
      {live ? <p className="text-muted-foreground">{t('s09Batches.detail.refreshing')}</p> : null}
      {canAct ? (
        <div className="flex flex-wrap gap-sp-8 print:hidden">
          {counts.failed > 0 && status !== 'cancelled' ? (
            <Button type="button" disabled={busy} onClick={() => void act('retry')}>
              {t('s09Batches.detail.retry')}
            </Button>
          ) : null}
          {live ? (
            <Button
              type="button"
              variant="outline"
              disabled={busy}
              onClick={() => void act('cancel')}
            >
              {t('s09Batches.detail.cancel')}
            </Button>
          ) : null}
        </div>
      ) : null}
      {error ? (
        <p role="alert" className="text-destructive">
          {error}
        </p>
      ) : null}
    </div>
  );
}
