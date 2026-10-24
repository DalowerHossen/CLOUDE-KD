// path: components/settings/sso-panel.tsx
'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { z } from 'zod';
import { Button } from '@/components/ui/button';
import { t, type StringKey } from '@/lib/i18n';
import type { SsoReadiness } from '@/services/company/sso';

const errorBody = z.object({ error: z.object({ message: z.string() }) });
const okBody = z.object({ data: z.object({ number: z.string() }) });

export function SsoPanel({ readiness }: { readiness: SsoReadiness }): JSX.Element {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<{ ok: boolean; text: string } | null>(null);

  async function request(): Promise<void> {
    setBusy(true);
    setNote(null);
    try {
      const response = await fetch('/api/settings/sso', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ action: 'request' }),
      });
      const json: unknown = await response.json().catch(() => null);
      if (response.ok) {
        const ok = okBody.safeParse(json);
        setNote({
          ok: true,
          text: t('s07Company.sso.requestDone', { number: ok.success ? ok.data.data.number : '' }),
        });
        router.refresh();
      } else {
        const err = errorBody.safeParse(json);
        setNote({
          ok: false,
          text: err.success ? err.data.error.message : t('s07Company.sso.error'),
        });
      }
    } catch {
      setNote({ ok: false, text: t('s07Company.sso.error') });
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="space-y-sp-8 rounded-lg border bg-card p-sp-16">
      <h2 className="text-h4 font-semibold">{t('s07Company.sso.checklist')}</h2>
      <ul className="space-y-1 text-sm">
        {readiness.checks.map((c) => (
          <li key={c.key} className="flex justify-between gap-sp-8">
            <span>{t(`s07Company.sso.checks.${c.key}` as StringKey)}</span>
            <span className={c.ok ? '' : 'text-muted-foreground'}>
              {c.ok ? t('s07Company.sso.ok') : t('s07Company.sso.missing')}
            </span>
          </li>
        ))}
      </ul>
      {readiness.requestedAt ? (
        <p role="status" className="text-sm">
          {t('s07Company.sso.requested', { date: readiness.requestedAt.slice(0, 10) })}
        </p>
      ) : readiness.ready ? (
        <Button type="button" disabled={busy} onClick={() => void request()}>
          {t('s07Company.sso.request')}
        </Button>
      ) : (
        <p className="text-sm text-muted-foreground">{t('s07Company.sso.notReady')}</p>
      )}
      {note ? (
        <p
          role={note.ok ? 'status' : 'alert'}
          className={note.ok ? 'text-sm' : 'text-sm text-destructive'}
        >
          {note.text}
        </p>
      ) : null}
    </section>
  );
}
