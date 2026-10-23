// path: app/(admin)/admin/account-locks/_components/lock-actions.tsx
'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { z } from 'zod';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { t } from '@/lib/i18n';

const errorBody = z.object({ error: z.object({ message: z.string() }) });

interface Props {
  userId: string;
  pending: { id: string; status: string } | null;
}

export function LockActions({ userId, pending }: Props): JSX.Element {
  const router = useRouter();
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  async function call(url: string, body: unknown, okText: string): Promise<void> {
    setBusy(true);
    setMessage(null);
    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (response.ok) {
        setMessage({ ok: true, text: okText });
        router.refresh();
      } else {
        const parsed = errorBody.safeParse(await response.json().catch(() => null));
        setMessage({
          ok: false,
          text: parsed.success ? parsed.data.error.message : t('s03Auth.common.genericError'),
        });
      }
    } catch {
      setMessage({ ok: false, text: t('s03Auth.common.genericError') });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-2">
      {pending === null ? (
        <>
          <Label htmlFor={`reason-${userId}`}>{t('s03Auth.locks.reasonLabel')}</Label>
          <Input
            id={`reason-${userId}`}
            value={reason}
            maxLength={1000}
            onChange={(e) => setReason(e.target.value)}
          />
          <Button
            type="button"
            size="sm"
            disabled={busy || reason.trim().length < 3}
            onClick={() =>
              call(
                '/api/admin/account-locks/request',
                { userId, reason },
                t('s03Auth.locks.requested'),
              )
            }
          >
            {t('s03Auth.locks.requestUnlock')}
          </Button>
        </>
      ) : null}
      {pending?.status === 'confirmed' ? (
        <Button
          type="button"
          size="sm"
          disabled={busy}
          onClick={() =>
            call(`/api/admin/account-locks/${pending.id}/unlock`, {}, t('s03Auth.locks.unlocked'))
          }
        >
          {t('s03Auth.locks.completeUnlock')}
        </Button>
      ) : null}
      <div aria-live="polite">
        {message ? (
          <Alert variant={message.ok ? 'success' : 'destructive'}>
            <div>{message.text}</div>
          </Alert>
        ) : null}
      </div>
    </div>
  );
}
