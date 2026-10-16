// path: app/(auth)/_components/two-factor-setup.tsx
'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { z } from 'zod';
import { ErrorState, LoadingState } from '@/components/shared/state-views';
import { FormWrapper, SubmitButton } from '@/components/shared/form-wrapper';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { FormField } from '@/components/ui/form-field';
import { Input } from '@/components/ui/input';
import { t } from '@/lib/i18n';
import { postJson } from './auth-client';

const begin = z.object({
  manualCode: z.string(),
  qrDataUrl: z.string().startsWith('data:image/png;base64,'),
});
const confirm = z.object({
  backupCodes: z.array(z.string()),
  redirectTo: z.enum(['/dashboard', '/admin']),
});

type Phase =
  | { name: 'loading' }
  | { name: 'failed' }
  | { name: 'scan'; manualCode: string; qr: string }
  | { name: 'codes'; codes: string[]; redirectTo: string };

/** Setup step used both in the sign-in flow and (with another API base) on the security page. */
export function TwoFactorSetup(): JSX.Element {
  const router = useRouter();
  const [phase, setPhase] = useState<Phase>({ name: 'loading' });
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let active = true;
    postJson('/api/auth/2fa/setup/begin', {}, begin).then((result) => {
      if (!active) return;
      setPhase(
        result.ok
          ? { name: 'scan', manualCode: result.data.manualCode, qr: result.data.qrDataUrl }
          : { name: 'failed' },
      );
    });
    return () => {
      active = false;
    };
  }, []);

  async function submit(data: FormData): Promise<void> {
    setError(null);
    const result = await postJson(
      '/api/auth/2fa/setup/confirm',
      { code: String(data.get('code') ?? '') },
      confirm,
    );
    if (!result.ok) {
      setError(t('s03Auth.twoFactor.failed'));
      return;
    }
    setPhase({ name: 'codes', codes: result.data.backupCodes, redirectTo: result.data.redirectTo });
  }

  if (phase.name === 'loading') return <LoadingState rows={3} />;
  if (phase.name === 'failed') {
    return (
      <div className="space-y-sp-16">
        <ErrorState description={t('s03Auth.twoFactor.loadFailed')} />
        <Link
          href="/login"
          className="inline-flex min-h-[44px] items-center text-sm text-primary underline-offset-4 hover:underline"
        >
          {t('s03Auth.common.backToLogin')}
        </Link>
      </div>
    );
  }
  if (phase.name === 'codes') {
    const text = phase.codes.join('\n');
    const download = (): void => {
      const url = URL.createObjectURL(new Blob([`${text}\n`], { type: 'text/plain' }));
      const link = document.createElement('a');
      link.href = url;
      link.download = 'backup-codes.txt';
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
    };
    return (
      <div className="space-y-sp-16">
        <h1 className="text-h3 font-semibold">{t('s03Auth.twoFactor.backupTitle')}</h1>
        <p className="text-sm text-muted-foreground">{t('s03Auth.twoFactor.backupBody')}</p>
        <ul
          className="grid grid-cols-2 gap-2 rounded-md border p-sp-16 font-mono text-sm"
          aria-label={t('s03Auth.twoFactor.backupTitle')}
        >
          {phase.codes.map((c) => (
            <li key={c}>{c}</li>
          ))}
        </ul>
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant="outline"
            onClick={() => {
              void navigator.clipboard.writeText(text).then(() => setCopied(true));
            }}
          >
            {t('s03Auth.twoFactor.copyCodes')}
          </Button>
          <Button type="button" variant="outline" onClick={download}>
            {t('s03Auth.twoFactor.downloadCodes')}
          </Button>
          <span aria-live="polite" className="self-center text-caption text-muted-foreground">
            {copied ? t('s03Auth.twoFactor.copied') : ''}
          </span>
        </div>
        <Button type="button" className="w-full" onClick={() => router.replace(phase.redirectTo)}>
          {t('s03Auth.twoFactor.backupSaved')}
        </Button>
      </div>
    );
  }
  return (
    <FormWrapper onSubmit={submit} className="space-y-sp-16">
      <h1 className="text-h3 font-semibold">{t('s03Auth.twoFactor.setupTitle')}</h1>
      <p className="text-sm text-muted-foreground">{t('s03Auth.twoFactor.setupSubtitle')}</p>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={phase.qr}
        alt={t('s03Auth.twoFactor.qrAlt')}
        width={220}
        height={220}
        className="mx-auto rounded-md border bg-white p-2"
      />
      <p className="text-sm">
        {t('s03Auth.twoFactor.manual')}{' '}
        <span className="break-all font-mono">{phase.manualCode}</span>
      </p>
      <div aria-live="polite">
        {error ? (
          <Alert variant="destructive">
            <div>{error}</div>
          </Alert>
        ) : null}
      </div>
      <FormField id="tf-setup-code" label={t('s03Auth.twoFactor.code')} required>
        {(props) => (
          <Input
            {...props}
            name="code"
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={7}
            pattern="[0-9 ]*"
            required
          />
        )}
      </FormField>
      <SubmitButton className="w-full">{t('s03Auth.twoFactor.confirm')}</SubmitButton>
    </FormWrapper>
  );
}
