// path: app/(dashboard)/account/security/_components/two-factor-panel.tsx
'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { z } from 'zod';
import { Alert } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { t } from '@/lib/i18n';
import { TwoFactorSetup } from '../../../../(auth)/_components/two-factor-setup';
import { call } from './api';

interface Props {
  active: boolean;
  backupCodesLeft: number;
  canDisable: boolean;
  mustHave: boolean;
}

const codesBody = z.object({ data: z.object({ backupCodes: z.array(z.string()) }) });

export function TwoFactorPanel({
  active,
  backupCodesLeft,
  canDisable,
  mustHave,
}: Props): JSX.Element {
  const router = useRouter();
  const [setup, setSetup] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [codes, setCodes] = useState<string[] | null>(null);

  async function regenerate(): Promise<void> {
    setMessage(null);
    const result = await call('/api/auth/2fa/backup-codes', {});
    if (!result.ok) return setMessage({ ok: false, text: result.message });
    setCodes(codesBody.parse(result.json).data.backupCodes);
    router.refresh();
  }

  async function disable(): Promise<void> {
    if (!window.confirm(t('s03Auth.security.disableConfirm'))) return;
    setMessage(null);
    const result = await call('/api/auth/2fa/disable', { confirm: true });
    if (!result.ok) return setMessage({ ok: false, text: result.message });
    router.refresh();
  }

  if (setup) {
    return (
      <TwoFactorSetup
        endpoints={{ begin: '/api/auth/2fa/enroll/begin', confirm: '/api/auth/2fa/enroll/confirm' }}
        onFinished={() => {
          setSetup(false);
          router.refresh();
        }}
      />
    );
  }

  return (
    <section className="space-y-sp-12 rounded-lg border bg-card p-sp-16" aria-labelledby="tf-title">
      <div className="flex flex-wrap items-center gap-2">
        <h2 id="tf-title" className="text-h4 font-semibold">
          {t('s03Auth.security.twoFactorTitle')}
        </h2>
        <Badge variant={active ? 'success' : 'warning'}>
          {active ? t('s03Auth.security.twoFactorOn') : t('s03Auth.security.twoFactorOff')}
        </Badge>
      </div>
      {!active && mustHave ? (
        <Alert variant="warning">
          <div>{t('s03Auth.security.twoFactorRequired')}</div>
        </Alert>
      ) : null}
      {active ? (
        <>
          <p className="text-sm text-muted-foreground">
            {t('s03Auth.security.backupLeft', { count: backupCodesLeft })}
          </p>
          <p className="text-caption text-muted-foreground">
            {t('s03Auth.security.regenerateHelp')}
          </p>
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="outline" onClick={regenerate}>
              {t('s03Auth.security.regenerate')}
            </Button>
            {canDisable ? (
              <Button type="button" variant="outline" onClick={disable}>
                {t('s03Auth.security.disable')}
              </Button>
            ) : (
              <p className="self-center text-caption text-muted-foreground">
                {t('s03Auth.security.disableNotAllowed')}
              </p>
            )}
          </div>
        </>
      ) : (
        <Button type="button" onClick={() => setSetup(true)}>
          {t('s03Auth.security.enable')}
        </Button>
      )}
      {codes ? (
        <ul
          className="grid grid-cols-2 gap-2 rounded-md border p-sp-16 font-mono text-sm"
          aria-label={t('s03Auth.twoFactor.backupTitle')}
        >
          {codes.map((c) => (
            <li key={c}>{c}</li>
          ))}
        </ul>
      ) : null}
      <div aria-live="polite">
        {message ? (
          <Alert variant={message.ok ? 'success' : 'destructive'}>
            <div>{message.text}</div>
          </Alert>
        ) : null}
      </div>
    </section>
  );
}
