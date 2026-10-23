// path: components/inventory/remittance-cancel.tsx
'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { z } from 'zod';
import { Button } from '@/components/ui/button';
import { t } from '@/lib/i18n';

const errorBody = z.object({ error: z.object({ message: z.string() }) });

export function RemittanceCancel({ id }: { id: string }): JSX.Element {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function cancel(): Promise<void> {
    if (!window.confirm(t('s08Crm.bills.statement.confirmCancel'))) return;
    setBusy(true);
    setError(null);
    try {
      const response = await fetch(`/api/remittances/${id}`, { method: 'DELETE' });
      if (response.ok) router.refresh();
      else {
        const err = errorBody.safeParse(await response.json().catch(() => null));
        setError(err.success ? err.data.error.message : t('s08Crm.bills.error'));
      }
    } catch {
      setError(t('s08Crm.bills.error'));
    }
    setBusy(false);
  }

  return (
    <span className="print:hidden">
      <Button type="button" variant="outline" disabled={busy} onClick={() => void cancel()}>
        {t('s08Crm.bills.statement.cancel')}
      </Button>
      {error ? (
        <span role="alert" className="ml-sp-8 text-sm text-destructive">
          {error}
        </span>
      ) : null}
    </span>
  );
}
