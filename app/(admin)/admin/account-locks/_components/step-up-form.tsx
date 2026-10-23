// path: app/(admin)/admin/account-locks/_components/step-up-form.tsx
'use client';
import { useState } from 'react';
import { z } from 'zod';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { t } from '@/lib/i18n';

const errorBody = z.object({ error: z.object({ message: z.string() }) });

/** Password plus two-step code. On success the session carries a fresh step-up time for 5 minutes. */
export function StepUpForm({ onDone }: { onDone?: () => void }): JSX.Element {
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  async function submit(): Promise<void> {
    setBusy(true);
    setMessage(null);
    try {
      const response = await fetch('/api/auth/step-up', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ password, code }),
      });
      if (response.ok) {
        setPassword('');
        setCode('');
        setMessage({ ok: true, text: t('s03Auth.locks.stepUpDone') });
        onDone?.();
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
    <section
      className="space-y-sp-12 rounded-lg border bg-card p-sp-16"
      aria-labelledby="stepup-title"
    >
      <h2 id="stepup-title" className="text-h4 font-semibold">
        {t('s03Auth.locks.stepUpTitle')}
      </h2>
      <p className="text-sm text-muted-foreground">{t('s03Auth.locks.stepUpBody')}</p>
      <div className="grid gap-sp-12 sm:grid-cols-2">
        <div className="space-y-1">
          <Label htmlFor="stepup-password">{t('s03Auth.locks.stepUpPassword')}</Label>
          <Input
            id="stepup-password"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            maxLength={256}
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="stepup-code">{t('s03Auth.locks.stepUpCode')}</Label>
          <Input
            id="stepup-code"
            inputMode="numeric"
            autoComplete="one-time-code"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            maxLength={12}
          />
        </div>
      </div>
      <Button
        type="button"
        disabled={busy || password.length === 0 || code.trim().length < 6}
        onClick={submit}
      >
        {t('s03Auth.locks.stepUpSubmit')}
      </Button>
      <div aria-live="polite">
        {message ? (
          <Alert variant={message.ok ? 'success' : 'destructive'}>
            <div>{message.text}</div>
          </Alert>
        ) : null}
      </div>
    </section>
  );
}
