// path: app/(auth)/_components/resend-form.tsx
'use client';
import { useEffect, useState } from 'react';
import { z } from 'zod';
import { FormWrapper, SubmitButton } from '@/components/shared/form-wrapper';
import { Alert } from '@/components/ui/alert';
import { FormField } from '@/components/ui/form-field';
import { Input } from '@/components/ui/input';
import { t } from '@/lib/i18n';
import { postJson } from './auth-client';
import { Turnstile } from './turnstile';

const COOLDOWN_SECONDS = 60;

/**
 * Asks for a new confirmation link. The answer is always the same, whether the address exists or not. After a send the
 * button waits a minute (the server also limits it), and the box says to look in the spam folder.
 */
export function ResendForm({
  siteKey,
  initialEmail = '',
  heading = true,
}: {
  siteKey: string;
  initialEmail?: string;
  heading?: boolean;
}): JSX.Element {
  const [email, setEmail] = useState(initialEmail);
  const [token, setToken] = useState<string | null>(null);
  const [resetKey, setResetKey] = useState(0);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [wait, setWait] = useState(0);

  useEffect(() => {
    if (wait <= 0) return;
    const timer = setTimeout(() => setWait((w) => w - 1), 1000);
    return () => clearTimeout(timer);
  }, [wait]);

  async function submit(): Promise<void> {
    setError(null);
    if (wait > 0) return;
    if (!token) {
      setError(t('s03Auth.common.securityCheckFailed'));
      return;
    }
    const result = await postJson(
      '/api/auth/resend-verification',
      { email: email.trim(), turnstileToken: token },
      z.object({ message: z.string() }),
    );
    setToken(null);
    setResetKey((k) => k + 1);
    if (result.ok) {
      setSent(true);
      setWait(COOLDOWN_SECONDS);
    } else {
      setError(
        result.status === 429 ? t('s03Auth.login.rateLimited') : t('s03Auth.common.genericError'),
      );
    }
  }

  return (
    <FormWrapper onSubmit={submit} className="space-y-sp-12">
      {heading ? (
        <>
          <h1 className="text-h3 font-semibold">{t('s03Auth.verify.resendTitle')}</h1>
          <p className="text-sm text-muted-foreground">{t('s03Auth.verify.resendHelp')}</p>
        </>
      ) : (
        <p className="text-sm font-medium">{t('s03Auth.verify.noMail')}</p>
      )}
      <div aria-live="polite" className="space-y-sp-8">
        {sent ? (
          <Alert variant="success">
            <div>{t('s03Auth.verify.resent')}</div>
            <div>{t('s03Auth.verify.checkSpam')}</div>
          </Alert>
        ) : null}
        {error ? (
          <Alert variant="destructive">
            <div>{error}</div>
          </Alert>
        ) : null}
      </div>
      <FormField id="resend-email" label={t('s03Auth.common.email')} required>
        {(props) => (
          <Input
            {...props}
            name="email"
            type="email"
            autoComplete="email"
            inputMode="email"
            maxLength={254}
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        )}
      </FormField>
      <Turnstile siteKey={siteKey} onToken={setToken} resetKey={resetKey} />
      <SubmitButton className="w-full" disabled={wait > 0}>
        {wait > 0
          ? t('s03Auth.verify.waitSeconds', { seconds: wait })
          : sent
            ? t('s03Auth.verify.resendAgain')
            : t('s03Auth.verify.resend')}
      </SubmitButton>
    </FormWrapper>
  );
}
