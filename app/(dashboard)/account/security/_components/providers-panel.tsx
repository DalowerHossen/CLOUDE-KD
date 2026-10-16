// path: app/(dashboard)/account/security/_components/providers-panel.tsx
'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Alert } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import type { OAuthProvider } from '@/lib/auth/oauth';
import { t } from '@/lib/i18n';
import { OAuthButtons } from '../../../../(auth)/_components/oauth-buttons';
import { call } from './api';

interface Props {
  linked: readonly OAuthProvider[];
  available: readonly OAuthProvider[];
}

export function ProvidersPanel({ linked, available }: Props): JSX.Element | null {
  const router = useRouter();
  const [message, setMessage] = useState<string | null>(null);
  if (available.length === 0 && linked.length === 0) return null;

  async function unlink(provider: OAuthProvider): Promise<void> {
    setMessage(null);
    const result = await call('/api/auth/oauth/unlink', { provider });
    if (result.ok) router.refresh();
    else setMessage(result.message);
  }

  return (
    <section
      className="space-y-sp-12 rounded-lg border bg-card p-sp-16"
      aria-labelledby="prov-title"
    >
      <h2 id="prov-title" className="text-h4 font-semibold">
        {t('s03Auth.security.providersTitle')}
      </h2>
      <ul className="space-y-2">
        {(['google', 'github'] as const)
          .filter((p) => available.includes(p) || linked.includes(p))
          .map((p) => (
            <li key={p} className="flex items-center justify-between gap-2">
              <span className="text-sm">
                {p === 'google' ? 'Google' : 'GitHub'}{' '}
                <Badge variant={linked.includes(p) ? 'success' : 'outline'}>
                  {linked.includes(p)
                    ? t('s03Auth.security.linked')
                    : t('s03Auth.security.notLinked')}
                </Badge>
              </span>
              {linked.includes(p) ? (
                <Button type="button" size="sm" variant="outline" onClick={() => unlink(p)}>
                  {t('s03Auth.security.unlink')}
                </Button>
              ) : null}
            </li>
          ))}
      </ul>
      <OAuthButtons providers={available.filter((p) => !linked.includes(p))} mode="link" />
      <div aria-live="polite">
        {message ? (
          <Alert variant="destructive">
            <div>{message}</div>
          </Alert>
        ) : null}
      </div>
    </section>
  );
}
