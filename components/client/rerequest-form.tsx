// path: components/client/rerequest-form.tsx
'use client';
import { useState } from 'react';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { t } from '@/lib/i18n';

interface RerequestFormProps {
  token: string;
}

/** Asks the sender for a new link. The answer is the same for every link. */
export function RerequestForm({ token }: RerequestFormProps): JSX.Element {
  const [phase, setPhase] = useState<'idle' | 'sending' | 'sent' | 'failed'>('idle');

  async function ask(): Promise<void> {
    setPhase('sending');
    try {
      const response = await fetch('/api/portal/rerequest', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ token }),
        cache: 'no-store',
      });
      setPhase(response.ok ? 'sent' : 'failed');
    } catch {
      setPhase('failed');
    }
  }

  if (phase === 'sent') return <Alert variant="success">{t('s13Portal.state.expiredSent')}</Alert>;
  return (
    <div className="space-y-sp-12">
      {phase === 'failed' ? (
        <Alert variant="destructive">{t('s13Portal.state.expiredFailed')}</Alert>
      ) : null}
      <Button
        type="button"
        className="w-full"
        disabled={phase === 'sending'}
        onClick={() => void ask()}
      >
        {t('s13Portal.state.expiredAction')}
      </Button>
    </div>
  );
}
