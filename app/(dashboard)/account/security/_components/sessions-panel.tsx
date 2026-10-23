// path: app/(dashboard)/account/security/_components/sessions-panel.tsx
'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Alert } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { t } from '@/lib/i18n';
import type { SessionItem } from '@/services/auth/account-ops';
import { call } from './api';

export function SessionsPanel({
  sessions,
  ownerView,
}: {
  sessions: readonly SessionItem[];
  ownerView: boolean;
}): JSX.Element {
  const router = useRouter();
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  async function run(url: string, body: unknown): Promise<void> {
    setBusy(true);
    setMessage(null);
    const result = await call(url, body);
    setMessage(
      result.ok
        ? { ok: true, text: t('s03Auth.security.revoked') }
        : { ok: false, text: result.message },
    );
    setBusy(false);
    if (result.ok) router.refresh();
  }

  return (
    <section
      className="space-y-sp-12 rounded-lg border bg-card p-sp-16"
      aria-labelledby="sess-title"
    >
      <h2 id="sess-title" className="text-h4 font-semibold">
        {ownerView ? t('s03Auth.security.staffSessions') : t('s03Auth.security.sessionsTitle')}
      </h2>
      <ul className="divide-y" aria-label={t('s03Auth.security.sessionsCaption')}>
        {sessions.length === 0 ? (
          <li className="py-2 text-sm text-muted-foreground">
            {t('s03Auth.security.emptySessions')}
          </li>
        ) : null}
        {sessions.map((s) => (
          <li key={s.id} className="flex flex-wrap items-center justify-between gap-2 py-sp-12">
            <div className="min-w-0 space-y-0.5 text-sm">
              <p className="font-medium">
                {s.device}{' '}
                {s.current ? (
                  <Badge variant="info">{t('s03Auth.security.thisDevice')}</Badge>
                ) : null}
              </p>
              <p className="text-muted-foreground">
                {s.network} -{' '}
                <time dateTime={s.lastActiveAt}>
                  {s.lastActiveAt.replace('T', ' ').slice(0, 16)}
                </time>
              </p>
            </div>
            {!s.current ? (
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={busy}
                onClick={() => run('/api/auth/sessions/revoke', { sessionId: s.id })}
              >
                {t('s03Auth.security.revoke')}
              </Button>
            ) : null}
          </li>
        ))}
      </ul>
      {!ownerView ? (
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant="outline"
            disabled={busy}
            onClick={() => run('/api/auth/sessions/revoke-others', {})}
          >
            {t('s03Auth.security.revokeOthers')}
          </Button>
          <Button
            type="button"
            variant="outline"
            disabled={busy}
            onClick={async () => {
              await call('/api/auth/logout', { everywhere: true });
              router.replace('/login');
              router.refresh();
            }}
          >
            {t('s03Auth.security.signOutAll')}
          </Button>
        </div>
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
