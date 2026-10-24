// path: components/inventory/bill-actions.tsx
'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { z } from 'zod';
import { Button } from '@/components/ui/button';
import { t } from '@/lib/i18n';

const errorBody = z.object({ error: z.object({ message: z.string() }) });

export function BillActions({
  id,
  status,
  mismatch,
  canWrite,
  canOverride,
}: {
  id: string;
  status: string;
  mismatch: boolean;
  canWrite: boolean;
  canOverride: boolean;
}): JSX.Element {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<{ ok: boolean; text: string } | null>(null);

  async function run(body: unknown): Promise<void> {
    setBusy(true);
    setNote(null);
    try {
      const response = await fetch(`/api/bills/${id}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (response.ok) {
        setNote({ ok: true, text: t('s08Crm.bills.done') });
        router.refresh();
      } else {
        const err = errorBody.safeParse(await response.json().catch(() => null));
        setNote({
          ok: false,
          text: err.success ? err.data.error.message : t('s08Crm.bills.error'),
        });
        router.refresh();
      }
    } catch {
      setNote({ ok: false, text: t('s08Crm.bills.error') });
    }
    setBusy(false);
  }

  if (!canWrite) return <></>;
  return (
    <div className="space-y-sp-8 print:hidden">
      <div className="flex flex-wrap gap-sp-8">
        {status === 'draft' ? (
          <Button
            type="button"
            disabled={busy}
            onClick={() => void run({ action: 'post', override: false })}
          >
            {t('s08Crm.bills.post')}
          </Button>
        ) : null}
        {status === 'draft' && mismatch && canOverride ? (
          <Button
            type="button"
            variant="outline"
            disabled={busy}
            onClick={() => void run({ action: 'post', override: true })}
          >
            {t('s08Crm.bills.postOverride')}
          </Button>
        ) : null}
        {status === 'draft' || status === 'open' ? (
          <Button
            type="button"
            variant="outline"
            disabled={busy}
            onClick={() => {
              if (window.confirm(t('s08Crm.bills.confirmVoid'))) void run({ action: 'void' });
            }}
          >
            {t('s08Crm.bills.void')}
          </Button>
        ) : null}
      </div>
      {note ? (
        <p role="status" className={note.ok ? 'text-sm' : 'text-sm text-destructive'}>
          {note.text}
        </p>
      ) : null}
    </div>
  );
}
