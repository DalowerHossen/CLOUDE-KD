// path: app/(admin)/admin/fraud/_components/fraud-actions.tsx
'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { z } from 'zod';
import { Button } from '@/components/ui/button';
import { t } from '@/lib/i18n';

const errorBody = z.object({ error: z.object({ message: z.string() }) });

interface Props {
  subjectType: string;
  refValue: string;
}

export function FraudActions({ subjectType, refValue }: Props): JSX.Element {
  const router = useRouter();
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const isUser = subjectType === 'user' && /^[0-9a-f-]{36}$/.test(refValue);
  const isIp = subjectType === 'ip' && /^[0-9a-f]{64}$/.test(refValue);

  async function run(body: unknown): Promise<void> {
    setBusy(true);
    setMessage(null);
    try {
      const response = await fetch('/api/admin/fraud/actions', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (response.ok) {
        setMessage(t('s04Security.fraud.done'));
        router.refresh();
      } else {
        const parsed = errorBody.safeParse(await response.json().catch(() => null));
        setMessage(parsed.success ? parsed.data.error.message : t('s03Auth.common.genericError'));
      }
    } catch {
      setMessage(t('s03Auth.common.genericError'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-1">
      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={busy}
          onClick={() => run({ action: 'clear_risk', subjectType, ref: refValue })}
        >
          {t('s04Security.fraud.clear')}
        </Button>
        {isUser ? (
          <>
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={busy}
              onClick={() => run({ action: 'terminate_sessions', userId: refValue })}
            >
              {t('s04Security.fraud.terminate')}
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={busy}
              onClick={() => run({ action: 'lock_user', userId: refValue })}
            >
              {t('s04Security.fraud.lock')}
            </Button>
          </>
        ) : null}
        {isIp ? (
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={busy}
            onClick={() => run({ action: 'ban_ip', ipHash: refValue, hours: 24 })}
          >
            {t('s04Security.fraud.ban')}
          </Button>
        ) : null}
      </div>
      <p aria-live="polite" className="text-caption text-muted-foreground">
        {message}
      </p>
    </div>
  );
}
