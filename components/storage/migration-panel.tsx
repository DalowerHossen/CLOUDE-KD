// path: components/storage/migration-panel.tsx
'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { z } from 'zod';
import { Button } from '@/components/ui/button';
import { t } from '@/lib/i18n';

const errorBody = z.object({ error: z.object({ message: z.string() }) });

export interface MigrationRow {
  id: string;
  target: 'google_drive' | 'supabase';
  status: string;
  total: number;
  done: number;
  failed: number;
  skipped: number;
  lastError: string | null;
  startedAt: string;
  companyId?: string | null;
}

interface Props {
  migrations: MigrationRow[];
  /** Tenant page: a company can start a move. Admin page: the list only. */
  canStart?: { driveReady: boolean; filesOnDrive: number; filesOnSupabase: number };
  /** Endpoint that accepts PATCH {id, op} (tenant) or POST {action:'control_migration', id, op} (admin). */
  mode: 'tenant' | 'admin';
}

export function MigrationPanel({ migrations, canStart, mode }: Props): JSX.Element {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [deleteSource, setDeleteSource] = useState(false);
  const running = migrations.some((m) => m.status === 'running');

  useEffect(() => {
    if (!running) return;
    const timer = window.setInterval(() => router.refresh(), 5000);
    return () => window.clearInterval(timer);
  }, [running, router]);

  async function send(path: string, method: 'POST' | 'PATCH', body: unknown): Promise<void> {
    setBusy(true);
    setMessage(null);
    try {
      const response = await fetch(path, {
        method,
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (response.ok) {
        router.refresh();
      } else {
        const parsed = errorBody.safeParse(await response.json().catch(() => null));
        setMessage(
          parsed.success ? parsed.data.error.message : t('s05Storage.storage.genericError'),
        );
      }
    } catch {
      setMessage(t('s05Storage.storage.genericError'));
    } finally {
      setBusy(false);
    }
  }

  const control = (id: string, op: 'pause' | 'resume' | 'cancel'): Promise<void> =>
    mode === 'tenant'
      ? send('/api/storage/migrations', 'PATCH', { id, op })
      : send('/api/admin/storage/actions', 'POST', { action: 'control_migration', id, op });

  return (
    <div className="space-y-sp-12">
      {canStart ? (
        <div className="space-y-2">
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={deleteSource}
              onChange={(e) => setDeleteSource(e.target.checked)}
            />
            {t('s05Storage.migration.deleteSource')}
          </label>
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="outline"
              disabled={busy || running || canStart.filesOnSupabase === 0 || !canStart.driveReady}
              onClick={() =>
                send('/api/storage/migrations', 'POST', { target: 'google_drive', deleteSource })
              }
            >
              {t('s05Storage.migration.toDrive', { count: canStart.filesOnSupabase })}
            </Button>
            <Button
              type="button"
              variant="outline"
              disabled={busy || running || canStart.filesOnDrive === 0}
              onClick={() =>
                send('/api/storage/migrations', 'POST', { target: 'supabase', deleteSource })
              }
            >
              {t('s05Storage.migration.toPlatform', { count: canStart.filesOnDrive })}
            </Button>
          </div>
        </div>
      ) : null}
      <p aria-live="polite" className="text-sm text-destructive">
        {message}
      </p>
      {migrations.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t('s05Storage.migration.none')}</p>
      ) : (
        <ul className="space-y-sp-12" aria-label={t('s05Storage.migration.listLabel')}>
          {migrations.map((m) => {
            const finished = m.done + m.failed + m.skipped;
            const percent = m.total > 0 ? Math.round((finished / m.total) * 100) : 100;
            return (
              <li key={m.id} className="space-y-1 rounded-md border p-sp-12">
                <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
                  <span>
                    {m.target === 'google_drive'
                      ? t('s05Storage.migration.toDriveShort')
                      : t('s05Storage.migration.toPlatformShort')}{' '}
                    -{' '}
                    {t(
                      `s05Storage.migration.status_${m.status as 'running' | 'paused' | 'done' | 'cancelled'}`,
                    )}
                  </span>
                  <span className="text-muted-foreground">
                    {m.startedAt.replace('T', ' ').slice(0, 16)} UTC
                  </span>
                </div>
                <div
                  role="progressbar"
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-valuenow={percent}
                  aria-label={t('s05Storage.migration.progress')}
                  className="h-2 w-full overflow-hidden rounded-full bg-muted"
                >
                  <div className="h-full bg-primary" style={{ width: `${percent}%` }} />
                </div>
                <p className="text-xs text-muted-foreground">
                  {t('s05Storage.migration.counts', {
                    done: m.done,
                    total: m.total,
                    failed: m.failed,
                    skipped: m.skipped,
                  })}
                </p>
                {m.lastError ? <p className="text-xs text-destructive">{m.lastError}</p> : null}
                {m.status === 'running' || m.status === 'paused' ? (
                  <div className="flex gap-2">
                    {m.status === 'running' ? (
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        disabled={busy}
                        onClick={() => control(m.id, 'pause')}
                      >
                        {t('s05Storage.migration.pause')}
                      </Button>
                    ) : (
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        disabled={busy}
                        onClick={() => control(m.id, 'resume')}
                      >
                        {t('s05Storage.migration.resume')}
                      </Button>
                    )}
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      disabled={busy}
                      onClick={() => control(m.id, 'cancel')}
                    >
                      {t('s05Storage.migration.cancel')}
                    </Button>
                  </div>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
