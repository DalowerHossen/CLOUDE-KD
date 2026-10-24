// path: components/inventory/supplier-actions.tsx
'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { z } from 'zod';
import { Button } from '@/components/ui/button';
import { t } from '@/lib/i18n';

const errorBody = z.object({ error: z.object({ message: z.string() }) });

export function SupplierActions({
  id,
  status,
  canWrite,
  canDelete,
}: {
  id: string;
  status: 'active' | 'archived';
  canWrite: boolean;
  canDelete: boolean;
}): JSX.Element {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function call(
    url: string,
    method: 'POST' | 'DELETE',
    body: unknown,
    after: () => void,
  ): Promise<void> {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch(url, {
        method,
        headers: { 'content-type': 'application/json' },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
      if (response.ok) after();
      else {
        const err = errorBody.safeParse(await response.json().catch(() => null));
        setError(err.success ? err.data.error.message : t('s08Crm.suppliers.actionError'));
      }
    } catch {
      setError(t('s08Crm.suppliers.actionError'));
    }
    setBusy(false);
  }

  return (
    <div className="space-y-sp-8">
      <div className="flex flex-wrap gap-sp-8">
        {canWrite ? (
          <Button
            type="button"
            variant="outline"
            disabled={busy}
            onClick={() =>
              void call(
                `/api/suppliers/${id}/status`,
                'POST',
                { action: status === 'active' ? 'archive' : 'reactivate' },
                () => router.refresh(),
              )
            }
          >
            {status === 'active' ? t('s08Crm.suppliers.archive') : t('s08Crm.suppliers.reactivate')}
          </Button>
        ) : null}
        {canDelete ? (
          <Button
            type="button"
            variant="destructive"
            disabled={busy}
            onClick={() => {
              if (window.confirm(t('s08Crm.suppliers.confirmDelete')))
                void call(`/api/suppliers/${id}`, 'DELETE', undefined, () =>
                  router.replace('/suppliers'),
                );
            }}
          >
            {t('s08Crm.suppliers.delete')}
          </Button>
        ) : null}
      </div>
      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}
    </div>
  );
}
