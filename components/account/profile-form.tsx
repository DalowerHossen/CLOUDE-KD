// path: components/account/profile-form.tsx
'use client';
import { useState } from 'react';
import { z } from 'zod';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { FormField } from '@/components/ui/form-field';
import { Input } from '@/components/ui/input';
import { NativeSelect } from '@/components/ui/native-select';
import { t } from '@/lib/i18n';
import { profileInput } from '@/lib/profile/schema';

const answer = z.union([
  z.object({ data: z.object({ version: z.number() }) }),
  z.object({ error: z.object({ message: z.string() }) }),
]);

/** The personal profile: display name and time zone. The login e-mail is shown, not edited. */
export function ProfileForm({
  initial,
  zones,
}: {
  initial: { fullName: string; email: string; timezone: string; version: number };
  zones: readonly string[];
}): JSX.Element {
  const [fullName, setFullName] = useState(initial.fullName);
  const [timezone, setTimezone] = useState(initial.timezone);
  const [version, setVersion] = useState(initial.version);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [nameError, setNameError] = useState<string | undefined>();

  async function save(event: React.FormEvent): Promise<void> {
    event.preventDefault();
    setMessage(null);
    const checked = profileInput.safeParse({ fullName, timezone, expectedVersion: version });
    if (!checked.success) {
      setNameError(checked.error.issues[0]?.message);
      return;
    }
    setNameError(undefined);
    setBusy(true);
    try {
      const response = await fetch('/api/account/profile', {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(checked.data),
      });
      const body = answer.safeParse(await response.json().catch(() => null));
      if (response.ok && body.success && 'data' in body.data) {
        setVersion(body.data.data.version);
        setMessage({ ok: true, text: t('s03Auth.profile.saved') });
      } else {
        setMessage({
          ok: false,
          text:
            body.success && 'error' in body.data
              ? body.data.error.message
              : t('s03Auth.profile.failed'),
        });
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={save} className="max-w-xl space-y-sp-16" noValidate>
      <FormField id="profile-name" label={t('s03Auth.profile.fullName')} required error={nameError}>
        {(props) => (
          <Input
            {...props}
            value={fullName}
            maxLength={200}
            autoComplete="name"
            onChange={(e) => setFullName(e.target.value)}
          />
        )}
      </FormField>
      <FormField
        id="profile-email"
        label={t('s03Auth.profile.email')}
        description={t('s03Auth.profile.emailHint')}
      >
        {(props) => <Input {...props} value={initial.email} readOnly disabled />}
      </FormField>
      <FormField id="profile-zone" label={t('s03Auth.profile.timezone')}>
        {(props) => (
          <NativeSelect {...props} value={timezone} onChange={(e) => setTimezone(e.target.value)}>
            {zones.map((z) => (
              <option key={z} value={z}>
                {z}
              </option>
            ))}
          </NativeSelect>
        )}
      </FormField>
      <div aria-live="polite">
        {message ? (
          <Alert variant={message.ok ? 'success' : 'destructive'}>
            <div>{message.text}</div>
          </Alert>
        ) : null}
      </div>
      <Button type="submit" disabled={busy}>
        {t('s03Auth.profile.save')}
      </Button>
    </form>
  );
}
