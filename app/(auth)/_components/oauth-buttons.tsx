// path: app/(auth)/_components/oauth-buttons.tsx
'use client';
import { useState } from 'react';
import { z } from 'zod';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { isAllowedAuthorizeUrl, type OAuthProvider } from '@/lib/auth/oauth';
import { t } from '@/lib/i18n';
import { postJson } from './auth-client';

export function OAuthButtons({
  providers,
  mode = 'login',
}: {
  providers: readonly OAuthProvider[];
  mode?: 'login' | 'link';
}): JSX.Element | null {
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  if (providers.length === 0) return null;

  async function start(provider: OAuthProvider): Promise<void> {
    setBusy(true);
    setError(null);
    const result = await postJson(
      `/api/auth/oauth/${provider}/start`,
      { mode },
      z.object({ url: z.string().url() }),
    );
    if (result.ok && isAllowedAuthorizeUrl(result.data.url)) {
      window.location.assign(result.data.url);
      return;
    }
    setError(t('s03Auth.oauth.failed'));
    setBusy(false);
  }

  return (
    <div className="space-y-sp-12">
      <div className="flex items-center gap-3 text-caption text-muted-foreground" role="separator">
        <span className="h-px flex-1 bg-border" />
        {t('s03Auth.oauth.divider')}
        <span className="h-px flex-1 bg-border" />
      </div>
      <div className="grid gap-2 sm:grid-cols-2">
        {providers.map((provider) => (
          <Button
            key={provider}
            type="button"
            variant="outline"
            disabled={busy}
            onClick={() => start(provider)}
          >
            {provider === 'google' ? t('s03Auth.oauth.google') : t('s03Auth.oauth.github')}
          </Button>
        ))}
      </div>
      <div aria-live="polite">
        {error ? (
          <Alert variant="destructive">
            <div>{error}</div>
          </Alert>
        ) : null}
      </div>
    </div>
  );
}
