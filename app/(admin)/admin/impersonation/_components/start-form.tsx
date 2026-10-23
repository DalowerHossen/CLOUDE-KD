// path: app/(admin)/admin/impersonation/_components/start-form.tsx
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

export function StartImpersonationForm(): JSX.Element {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function start(): Promise<void> {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch('/api/admin/impersonation/start', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ targetEmail: email, reason }),
      });
      if (response.ok) {
        router.replace('/dashboard');
        router.refresh();
        return;
      }
      const parsed = errorBody.safeParse(await response.json().catch(() => null));
      setError(parsed.success ? parsed.data.error.message : t('s03Auth.common.genericError'));
    } catch {
      setError(t('s03Auth.common.genericError'));
    }
    setBusy(false);
  }

  return (
    <section
      className="space-y-sp-12 rounded-lg border bg-card p-sp-16"
      aria-labelledby="imp-title"
    >
      <h2 id="imp-title" className="text-h4 font-semibold">
        {t('s03Auth.impersonation.startTitle')}
      </h2>
      <p className="text-sm text-muted-foreground">{t('s03Auth.impersonation.startBody')}</p>
      <div className="space-y-1">
        <Label htmlFor="imp-email">{t('s03Auth.impersonation.targetEmail')}</Label>
        <Input
          id="imp-email"
          type="email"
          value={email}
          maxLength={254}
          onChange={(e) => setEmail(e.target.value)}
        />
      </div>
      <div className="space-y-1">
        <Label htmlFor="imp-reason">{t('s03Auth.impersonation.reason')}</Label>
        <Input
          id="imp-reason"
          value={reason}
          maxLength={1000}
          onChange={(e) => setReason(e.target.value)}
        />
      </div>
      <Button
        type="button"
        disabled={busy || reason.trim().length < 10 || !email.includes('@')}
        onClick={start}
      >
        {t('s03Auth.impersonation.start')}
      </Button>
      <div aria-live="polite">
        {error ? (
          <Alert variant="destructive">
            <div>{error}</div>
          </Alert>
        ) : null}
      </div>
    </section>
  );
}
