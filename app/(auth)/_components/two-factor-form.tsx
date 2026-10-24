// path: app/(auth)/_components/two-factor-form.tsx
'use client';
import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { z } from 'zod';
import { FormWrapper, SubmitButton } from '@/components/shared/form-wrapper';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { FormField } from '@/components/ui/form-field';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { t } from '@/lib/i18n';
import { postJson } from './auth-client';

const outcome = z.discriminatedUnion('status', [
  z.object({ status: z.literal('ok'), redirectTo: z.enum(['/dashboard', '/admin']) }),
  z.object({ status: z.literal('two_factor_setup_required') }),
]);

export function TwoFactorForm(): JSX.Element {
  const router = useRouter();
  const [backup, setBackup] = useState(false);
  const [recover, setRecover] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(data: FormData): Promise<void> {
    setError(null);
    const result = await postJson(
      '/api/auth/2fa/verify',
      { code: String(data.get('code') ?? ''), recover: backup && recover },
      outcome,
    );
    if (!result.ok) {
      setError(t('s03Auth.twoFactor.failed'));
      return;
    }
    router.replace(
      result.data.status === 'ok' ? result.data.redirectTo : '/login/two-factor-setup',
    );
  }

  return (
    <FormWrapper onSubmit={submit} className="space-y-sp-16">
      <h1 className="text-h3 font-semibold">{t('s03Auth.twoFactor.title')}</h1>
      <p className="text-sm text-muted-foreground">{t('s03Auth.twoFactor.subtitle')}</p>
      <div aria-live="polite">
        {error ? (
          <Alert variant="destructive">
            <div>{error}</div>
          </Alert>
        ) : null}
      </div>
      <FormField
        id="tf-code"
        label={backup ? t('s03Auth.twoFactor.backupLabel') : t('s03Auth.twoFactor.code')}
        required
      >
        {(props) => (
          <Input
            {...props}
            name="code"
            autoComplete="one-time-code"
            inputMode={backup ? 'text' : 'numeric'}
            maxLength={backup ? 12 : 7}
            pattern={backup ? undefined : '[0-9 ]*'}
            required
            autoFocus
          />
        )}
      </FormField>
      {backup ? (
        <div className="flex items-start gap-2">
          <Checkbox
            id="tf-recover"
            checked={recover}
            onCheckedChange={(v) => setRecover(v === true)}
          />
          <Label htmlFor="tf-recover">{t('s03Auth.twoFactor.lostDevice')}</Label>
        </div>
      ) : null}
      <SubmitButton className="w-full">{t('s03Auth.twoFactor.submit')}</SubmitButton>
      <Button
        type="button"
        variant="ghost"
        className="w-full"
        onClick={() => {
          setBackup(!backup);
          setRecover(false);
        }}
      >
        {backup ? t('s03Auth.twoFactor.useApp') : t('s03Auth.twoFactor.useBackup')}
      </Button>
      <Link
        href="/login"
        className="inline-flex min-h-[44px] items-center text-sm text-primary underline-offset-4 hover:underline"
      >
        {t('s03Auth.common.backToLogin')}
      </Link>
    </FormWrapper>
  );
}
