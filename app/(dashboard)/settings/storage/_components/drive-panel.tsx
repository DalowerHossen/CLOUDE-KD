// path: app/(dashboard)/settings/storage/_components/drive-panel.tsx
'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { z } from 'zod';
import { Button } from '@/components/ui/button';
import { t } from '@/lib/i18n';

const answer = z.object({
  data: z.object({ url: z.string().url() }).optional(),
  error: z.object({ message: z.string() }).optional(),
});

interface Props {
  state: 'connected' | 'revoked' | 'error' | 'none';
  available: boolean;
  filesOnDrive: number;
}

export function DrivePanel({ state, available, filesOnDrive }: Props): JSX.Element {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [confirmForce, setConfirmForce] = useState(false);

  async function post(path: string, body: unknown): Promise<z.infer<typeof answer> | null> {
    setBusy(true);
    setMessage(null);
    try {
      const response = await fetch(path, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      });
      const parsed = answer.safeParse(await response.json().catch(() => null));
      if (!response.ok) {
        setMessage(
          parsed.success && parsed.data.error
            ? parsed.data.error.message
            : t('s05Storage.storage.genericError'),
        );
        return null;
      }
      return parsed.success ? parsed.data : {};
    } catch {
      setMessage(t('s05Storage.storage.genericError'));
      return null;
    } finally {
      setBusy(false);
    }
  }

  async function connect(): Promise<void> {
    const result = await post('/api/storage/drive/connect', {});
    if (result?.data?.url) window.location.assign(result.data.url);
  }

  async function disconnect(force: boolean): Promise<void> {
    const result = await post('/api/storage/drive/disconnect', { force });
    if (result) {
      setConfirmForce(false);
      router.refresh();
    } else if (filesOnDrive > 0) {
      setConfirmForce(true);
    }
  }

  const linked = state !== 'none';
  return (
    <div className="space-y-sp-12">
      <div className="flex flex-wrap gap-2">
        {available ? (
          <Button type="button" disabled={busy} onClick={connect}>
            {busy
              ? t('s05Storage.storage.working')
              : linked
                ? t('s05Storage.storage.reconnect')
                : t('s05Storage.storage.connect')}
          </Button>
        ) : null}
        {linked ? (
          <Button
            type="button"
            variant="outline"
            disabled={busy}
            onClick={() => disconnect(confirmForce)}
          >
            {confirmForce
              ? t('s05Storage.storage.disconnectForce')
              : t('s05Storage.storage.disconnect')}
          </Button>
        ) : null}
      </div>
      {confirmForce ? (
        <p className="text-sm text-muted-foreground">{t('s05Storage.storage.disconnectWarning')}</p>
      ) : null}
      <p aria-live="polite" className="text-sm text-destructive">
        {message}
      </p>
    </div>
  );
}
