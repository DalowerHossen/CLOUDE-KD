// path: components/crm/statement-mail-button.tsx
'use client';
import { useState } from 'react';
import { z } from 'zod';
import { Button } from '@/components/ui/button';
import { t } from '@/lib/i18n';

const errorBody = z.object({ error: z.object({ message: z.string() }) });
const okBody = z.object({ data: z.object({ sentTo: z.string() }) });

export function StatementMailButton({
  clientId,
  from,
  to,
}: {
  clientId: string;
  from: string;
  to: string;
}): JSX.Element {
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<{ ok: boolean; text: string } | null>(null);

  async function send(): Promise<void> {
    setBusy(true);
    setNote(null);
    try {
      const response = await fetch(`/api/clients/${clientId}/statement-mail`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ from, to }),
      });
      const json: unknown = await response.json().catch(() => null);
      if (response.ok) {
        const ok = okBody.safeParse(json);
        setNote({
          ok: true,
          text: t('s08Crm.data.emailSent', { to: ok.success ? ok.data.data.sentTo : '' }),
        });
      } else {
        const err = errorBody.safeParse(json);
        setNote({
          ok: false,
          text: err.success ? err.data.error.message : t('s08Crm.data.emailError'),
        });
      }
    } catch {
      setNote({ ok: false, text: t('s08Crm.data.emailError') });
    }
    setBusy(false);
  }

  return (
    <div className="space-y-sp-8 print:hidden">
      <Button type="button" variant="outline" disabled={busy} onClick={() => void send()}>
        {t('s08Crm.data.emailStatement')}
      </Button>
      {note ? (
        <p
          role={note.ok ? 'status' : 'alert'}
          className={note.ok ? 'text-sm' : 'text-sm text-destructive'}
        >
          {note.text}
        </p>
      ) : null}
    </div>
  );
}
