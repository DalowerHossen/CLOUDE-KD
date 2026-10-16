// path: app/(auth)/_components/login-form.tsx
'use client';
import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { z } from 'zod';
import { FormWrapper, SubmitButton } from '@/components/shared/form-wrapper';
import { Alert } from '@/components/ui/alert';
import { Checkbox } from '@/components/ui/checkbox';
import { FormField } from '@/components/ui/form-field';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { t } from '@/lib/i18n';
import { postJson } from './auth-client';
import { PasswordField } from './password-field';
import { Turnstile } from './turnstile';

const outcome = z.discriminatedUnion('status', [
  z.object({ status: z.literal('ok'), redirectTo: z.enum(['/dashboard', '/admin']) }),
  z.object({ status: z.literal('two_factor_required') }),
  z.object({ status: z.literal('two_factor_setup_required') }),
]);

export function LoginForm({ siteKey }: { siteKey: string }): JSX.Element {
  const router = useRouter();
  const [message, setMessage] = useState<string | null>(null);
  const [needCaptcha, setNeedCaptcha] = useState(false);
  const [token, setToken] = useState<string | null>(null);
  const [resetKey, setResetKey] = useState(0);
  const [remember, setRemember] = useState(false);

  async function submit(data: FormData): Promise<void> {
    setMessage(null);
    const result = await postJson(
      '/api/auth/login',
      {
        email: String(data.get('email') ?? ''),
        password: String(data.get('password') ?? ''),
        rememberMe: remember,
        turnstileToken: token,
      },
      outcome,
    );
    if (result.ok) {
      if (result.data.status === 'ok') router.replace(result.data.redirectTo);
      else if (result.data.status === 'two_factor_required') router.replace('/login/two-factor');
      else router.replace('/login/two-factor-setup');
      return;
    }
    if (result.issues.some((i) => i.path === 'turnstileToken')) setNeedCaptcha(true);
    setMessage(result.status === 429 ? t('s03Auth.login.rateLimited') : t('s03Auth.login.failed'));
    setResetKey((k) => k + 1);
  }

  return (
    <FormWrapper onSubmit={submit} className="space-y-sp-16">
      <h1 className="text-h3 font-semibold">{t('s03Auth.login.title')}</h1>
      <p className="text-sm text-muted-foreground">{t('s03Auth.login.subtitle')}</p>
      <div aria-live="polite">
        {message ? (
          <Alert variant="destructive">
            <div>{message}</div>
          </Alert>
        ) : null}
      </div>
      <FormField id="login-email" label={t('s03Auth.common.email')} required>
        {(props) => (
          <Input
            {...props}
            name="email"
            type="email"
            autoComplete="username"
            inputMode="email"
            maxLength={254}
            required
          />
        )}
      </FormField>
      <PasswordField
        name="password"
        label={t('s03Auth.common.password')}
        autoComplete="current-password"
      />
      <div className="flex min-h-[44px] items-center gap-2">
        <Checkbox
          id="login-remember"
          checked={remember}
          onCheckedChange={(v) => setRemember(v === true)}
        />
        <Label htmlFor="login-remember">{t('s03Auth.login.remember')}</Label>
      </div>
      {needCaptcha ? <Turnstile siteKey={siteKey} onToken={setToken} resetKey={resetKey} /> : null}
      <SubmitButton className="w-full">{t('s03Auth.login.submit')}</SubmitButton>
      <div className="flex flex-col gap-1 text-sm">
        <Link
          href="/forgot-password"
          className="inline-flex min-h-[44px] items-center text-primary underline-offset-4 hover:underline"
        >
          {t('s03Auth.login.forgot')}
        </Link>
        <span>
          {t('s03Auth.login.noAccount')}{' '}
          <Link
            href="/signup"
            className="inline-flex min-h-[44px] items-center text-primary underline-offset-4 hover:underline"
          >
            {t('s03Auth.login.createAccount')}
          </Link>
        </span>
      </div>
    </FormWrapper>
  );
}
