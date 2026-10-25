// path: app/(auth)/_components/signup-form.tsx
'use client';
import { useState } from 'react';
import Link from 'next/link';
import { z } from 'zod';
import { FormWrapper, SubmitButton } from '@/components/shared/form-wrapper';
import { SuccessState } from '@/components/shared/state-views';
import { Alert } from '@/components/ui/alert';
import { Checkbox } from '@/components/ui/checkbox';
import { FormField } from '@/components/ui/form-field';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { NativeSelect } from '@/components/ui/native-select';
import { t } from '@/lib/i18n';
import { postJson } from './auth-client';
import { PasswordField } from './password-field';
import { ResendForm } from './resend-form';
import { Turnstile } from './turnstile';

export interface PlanChoice {
  slug: string;
  name: string;
  priceMonthly: string;
  trialDays: number;
}

export function SignupForm({
  siteKey,
  plans,
  defaultPlan,
}: {
  siteKey: string;
  plans: PlanChoice[];
  defaultPlan: string;
}): JSX.Element {
  const [done, setDone] = useState(false);
  const [token, setToken] = useState<string | null>(null);
  const [terms, setTerms] = useState(false);
  const [email, setEmail] = useState('');
  const [plan, setPlan] = useState(defaultPlan);
  const [errors, setErrors] = useState<string[]>([]);
  const [resetKey, setResetKey] = useState(0);

  async function submit(data: FormData): Promise<void> {
    setErrors([]);
    if (!token || !terms) {
      setErrors([t('s03Auth.common.securityCheckFailed')]);
      return;
    }
    const result = await postJson(
      '/api/auth/signup',
      {
        email: String(data.get('email') ?? ''),
        password: String(data.get('password') ?? ''),
        fullName: String(data.get('fullName') ?? ''),
        companyName: String(data.get('companyName') ?? ''),
        acceptTerms: true,
        ...(plan ? { plan } : {}),
        turnstileToken: token,
        website: '',
      },
      z.object({ message: z.string() }),
    );
    if (result.ok) {
      setDone(true);
      return;
    }
    setErrors(
      result.issues.length > 0
        ? result.issues.map((i) => i.message)
        : [result.message || t('s03Auth.common.genericError')],
    );
    setResetKey((k) => k + 1);
  }

  if (done) {
    return (
      <div className="space-y-sp-16">
        <SuccessState
          title={t('s03Auth.signup.doneTitle')}
          description={t('s03Auth.signup.done')}
        />
        <ResendForm siteKey={siteKey} initialEmail={email} heading={false} />
      </div>
    );
  }

  return (
    <FormWrapper onSubmit={submit} className="space-y-sp-16">
      <h1 className="text-h3 font-semibold">{t('s03Auth.signup.title')}</h1>
      <p className="text-sm text-muted-foreground">{t('s03Auth.signup.subtitle')}</p>
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
      <FormField id="signup-name" label={t('s03Auth.signup.fullName')} required>
        {(props) => (
          <Input {...props} name="fullName" autoComplete="name" maxLength={200} required />
        )}
      </FormField>
      <FormField id="signup-company" label={t('s03Auth.signup.companyName')} required>
        {(props) => (
          <Input
            {...props}
            name="companyName"
            autoComplete="organization"
            maxLength={200}
            required
          />
        )}
      </FormField>
      {plans.length > 0 ? (
        <FormField id="signup-plan" label={t('s03Auth.signup.plan')}>
          {(props) => (
            <NativeSelect
              {...props}
              name="plan"
              value={plan}
              onChange={(e) => setPlan(e.target.value)}
            >
              <option value="">{t('s03Auth.signup.planNone')}</option>
              {plans.map((p) => (
                <option key={p.slug} value={p.slug}>
                  {p.name}
                </option>
              ))}
            </NativeSelect>
          )}
        </FormField>
      ) : null}
      <FormField id="signup-email" label={t('s03Auth.common.email')} required>
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
      <PasswordField
        name="password"
        label={t('s03Auth.common.newPassword')}
        autoComplete="new-password"
        showRules
        email={email}
      />
      <div className="flex min-h-[44px] items-center gap-2">
        <Checkbox id="signup-terms" checked={terms} onCheckedChange={(v) => setTerms(v === true)} />
        <Label htmlFor="signup-terms">{t('s03Auth.signup.terms')}</Label>
      </div>
      <Turnstile siteKey={siteKey} onToken={setToken} resetKey={resetKey} />
      <SubmitButton className="w-full">{t('s03Auth.signup.submit')}</SubmitButton>
      <p className="text-sm">
        {t('s03Auth.signup.haveAccount')}{' '}
        <Link
          href="/login"
          className="inline-flex min-h-[44px] items-center text-primary underline-offset-4 hover:underline"
        >
          {t('s03Auth.login.title')}
        </Link>
      </p>
    </FormWrapper>
  );
}
