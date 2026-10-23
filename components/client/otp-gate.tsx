// path: components/client/otp-gate.tsx
'use client';
import { useState, type FormEvent } from 'react';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { t } from '@/lib/i18n';

interface OtpGateProps {
  token: string;
}

type Phase = 'idle' | 'sending' | 'sent' | 'checking' | 'wrong' | 'failed';

async function post(path: string, body: Record<string, string>): Promise<Response> {
  return fetch(path, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
    cache: 'no-store',
  });
}

/** The one-time code step. The link stays in the page address; the code is checked on the server and opens this link only. */
export function OtpGate({ token }: OtpGateProps): JSX.Element {
  const [phase, setPhase] = useState<Phase>('idle');
  const [code, setCode] = useState('');

  async function send(): Promise<void> {
    setPhase('sending');
    try {
      const response = await post('/api/portal/otp/send', { token });
      setPhase(response.ok ? 'sent' : 'failed');
    } catch {
      setPhase('failed');
    }
  }

  async function verify(event: FormEvent): Promise<void> {
    event.preventDefault();
    setPhase('checking');
    try {
      const response = await post('/api/portal/otp/verify', { token, code });
      const result: unknown = await response.json();
      const ok =
        typeof result === 'object' &&
        result !== null &&
        (result as { data?: { ok?: unknown } }).data?.ok === true;
      if (ok) {
        window.location.reload();
        return;
      }
      setPhase(response.ok ? 'wrong' : 'failed');
    } catch {
      setPhase('failed');
    }
  }

  const busy = phase === 'sending' || phase === 'checking';
  return (
    <div className="space-y-sp-16">
      <Button
        type="button"
        variant="secondary"
        className="w-full"
        disabled={busy}
        onClick={() => void send()}
      >
        {phase === 'sent' || phase === 'wrong'
          ? t('s13Portal.otp.resend')
          : t('s13Portal.otp.send')}
      </Button>
      {phase === 'sent' ? <Alert variant="info">{t('s13Portal.otp.sent')}</Alert> : null}
      <form className="space-y-sp-12" onSubmit={(event) => void verify(event)}>
        <Label htmlFor="portal-code">{t('s13Portal.otp.codeLabel')}</Label>
        <Input
          id="portal-code"
          inputMode="numeric"
          autoComplete="one-time-code"
          pattern="\d{6}"
          maxLength={6}
          value={code}
          onChange={(event) => setCode(event.target.value.replace(/\D/g, ''))}
        />
        {phase === 'wrong' ? <Alert variant="destructive">{t('s13Portal.otp.wrong')}</Alert> : null}
        {phase === 'failed' ? (
          <Alert variant="destructive">{t('s13Portal.otp.failed')}</Alert>
        ) : null}
        <Button type="submit" className="w-full" disabled={busy || code.length !== 6}>
          {t('s13Portal.otp.verify')}
        </Button>
      </form>
    </div>
  );
}
