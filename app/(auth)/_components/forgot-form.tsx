// path: app/(auth)/_components/forgot-form.tsx
'use client';
import { useState } from 'react';
import Link from 'next/link';
import { z } from 'zod';
import { FormWrapper, SubmitButton } from '@/components/shared/form-wrapper';
import { SuccessState } from '@/components/shared/state-views';
import { Alert } from '@/components/ui/alert';
import { FormField } from '@/components/ui/form-field';
import { Input } from '@/components/ui/input';
import { t } from '@/lib/i18n';
import { postJson } from './auth-client';
import { Turnstile } from './turnstile';

export function ForgotForm({ siteKey }: { siteKey: string }): JSX.Element {
  const [done, setDone] = useState(false);
  const [token, setToken] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [resetKey, setResetKey] = useState(0);

  async function submit(data: FormData): Promise<void> {
    setError(null);
    if (!token) {
      setError(t('s03Auth.common.securityCheckFailed'));
      return;
    }
    const result = await postJson(
      '/api/auth/forgot-password',
      { email: String(data.get('email') ?? ''), turnstileToken: token },
      z.object({ message: z.string() }),
    );
    if (result.ok) setDone(true);
    else {
      setError(t('s03Auth.common.genericError'));
      setResetKey((k) => k + 1);
    }
  }

  if (done)
    return (
      <SuccessState title={t('s03Auth.forgot.title')} description={t('s03Auth.forgot.done')} />
    );
  return (
    <FormWrapper onSubmit={submit} className="space-y-sp-16">
      <h1 className="text-h3 font-semibold">{t('s03Auth.forgot.title')}</h1>
      <p className="text-sm text-muted-foreground">{t('s03Auth.forgot.subtitle')}</p>
      <div aria-live="polite">
        {error ? (
          <Alert variant="destructive">
            <div>{error}</div>
          </Alert>
        ) : null}
      </div>
      <FormField id="forgot-email" label={t('s03Auth.common.email')} required>
        {(props) => (
          <Input
            {...props}
            name="email"
            type="email"
            autoComplete="email"
            inputMode="email"
            maxLength={254}
            required
          />
        )}
      </FormField>
      <Turnstile siteKey={siteKey} onToken={setToken} resetKey={resetKey} />
      <SubmitButton className="w-full">{t('s03Auth.forgot.submit')}</SubmitButton>
      <Link
        href="/login"
        className="inline-flex min-h-[44px] items-center text-sm text-primary underline-offset-4 hover:underline"
      >
        {t('s03Auth.common.backToLogin')}
      </Link>
    </FormWrapper>
  );
}
