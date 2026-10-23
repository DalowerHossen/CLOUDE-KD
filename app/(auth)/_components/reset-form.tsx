// path: app/(auth)/_components/reset-form.tsx
'use client';
import { useState } from 'react';
import Link from 'next/link';
import { z } from 'zod';
import { FormWrapper, SubmitButton } from '@/components/shared/form-wrapper';
import { SuccessState } from '@/components/shared/state-views';
import { Alert } from '@/components/ui/alert';
import { t } from '@/lib/i18n';
import { postJson } from './auth-client';
import { PasswordField } from './password-field';
import { Turnstile } from './turnstile';

export function ResetForm({
  siteKey,
  identifier,
  token,
}: {
  siteKey: string;
  identifier: string;
  token: string;
}): JSX.Element {
  const [done, setDone] = useState(false);
  const [captcha, setCaptcha] = useState<string | null>(null);
  const [errors, setErrors] = useState<string[]>([]);
  const [resetKey, setResetKey] = useState(0);

  async function submit(data: FormData): Promise<void> {
    setErrors([]);
    if (!captcha) {
      setErrors([t('s03Auth.common.securityCheckFailed')]);
      return;
    }
    const result = await postJson(
      '/api/auth/reset-password',
      { identifier, token, password: String(data.get('password') ?? ''), turnstileToken: captcha },
      z.object({ reset: z.boolean() }),
    );
    if (result.ok) {
      setDone(true);
      return;
    }
    setErrors(
      result.issues.length > 0
        ? result.issues.map((i) => i.message)
        : [result.message || t('s03Auth.reset.invalidLink')],
    );
    setResetKey((k) => k + 1);
  }

  if (done) {
    return (
      <div className="space-y-sp-16">
        <SuccessState title={t('s03Auth.reset.title')} description={t('s03Auth.reset.done')} />
        <Link
          href="/login"
          className="inline-flex min-h-[44px] items-center text-sm text-primary underline-offset-4 hover:underline"
        >
          {t('s03Auth.common.backToLogin')}
        </Link>
      </div>
    );
  }
  return (
    <FormWrapper onSubmit={submit} className="space-y-sp-16">
      <h1 className="text-h3 font-semibold">{t('s03Auth.reset.title')}</h1>
      <div aria-live="polite">
        {errors.length > 0 ? (
          <Alert variant="destructive">
            <ul className="list-disc pl-4">
              {errors.map((e) => (
                <li key={e}>{e}</li>
              ))}
            </ul>
          </Alert>
        ) : null}
      </div>
      <PasswordField
        name="password"
        label={t('s03Auth.common.newPassword')}
        autoComplete="new-password"
        showRules
      />
      <Turnstile siteKey={siteKey} onToken={setCaptcha} resetKey={resetKey} />
      <SubmitButton className="w-full">{t('s03Auth.reset.submit')}</SubmitButton>
    </FormWrapper>
  );
}
