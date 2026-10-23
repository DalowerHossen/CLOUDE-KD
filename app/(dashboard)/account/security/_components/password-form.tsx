// path: app/(dashboard)/account/security/_components/password-form.tsx
'use client';
import { useState } from 'react';
import { FormWrapper, SubmitButton } from '@/components/shared/form-wrapper';
import { Alert } from '@/components/ui/alert';
import { t } from '@/lib/i18n';
import { PasswordField } from '../../../../(auth)/_components/password-field';
import { call } from './api';

export function PasswordForm({ email }: { email: string }): JSX.Element {
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  async function submit(data: FormData): Promise<void> {
    setMessage(null);
    const result = await call('/api/auth/password/change', {
      currentPassword: String(data.get('currentPassword') ?? ''),
      newPassword: String(data.get('newPassword') ?? ''),
    });
    setMessage(
      result.ok
        ? { ok: true, text: t('s03Auth.security.passwordChanged') }
        : { ok: false, text: result.message },
    );
  }

  return (
    <FormWrapper onSubmit={submit} className="space-y-sp-12 rounded-lg border bg-card p-sp-16">
      <h2 className="text-h4 font-semibold">{t('s03Auth.security.passwordTitle')}</h2>
      <PasswordField
        name="currentPassword"
        label={t('s03Auth.security.currentPassword')}
        autoComplete="current-password"
      />
      <PasswordField
        name="newPassword"
        label={t('s03Auth.common.newPassword')}
        autoComplete="new-password"
        showRules
        email={email}
      />
      <SubmitButton>{t('s03Auth.security.changePassword')}</SubmitButton>
      <div aria-live="polite">
        {message ? (
          <Alert variant={message.ok ? 'success' : 'destructive'}>
            <div>{message.text}</div>
          </Alert>
        ) : null}
      </div>
    </FormWrapper>
  );
}
