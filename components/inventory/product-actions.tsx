// path: components/inventory/product-actions.tsx
'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { z } from 'zod';
import { Button } from '@/components/ui/button';
import { t } from '@/lib/i18n';

const errorBody = z.object({ error: z.object({ message: z.string() }) });

export function ProductActions({
  id,
  status,
  canArchive,
  canDelete,
}: {
  id: string;
  status: 'active' | 'inactive' | 'archived';
  canArchive: boolean;
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
        setError(err.success ? err.data.error.message : t('s08Crm.products.actionError'));
      }
    } catch {
      setError(t('s08Crm.products.actionError'));
    }
    setBusy(false);
  }

  const setStatus = (next: 'active' | 'inactive' | 'archived'): Promise<void> =>
    call(`/api/products/${id}/status`, 'POST', { status: next }, () => router.refresh());

  return (
    <div className="space-y-sp-8">
      <div className="flex flex-wrap gap-sp-8">
        {canArchive && status !== 'active' ? (
          <Button
            type="button"
            variant="outline"
            disabled={busy}
            onClick={() => void setStatus('active')}
          >
            {t('s08Crm.products.activate')}
          </Button>
        ) : null}
        {canArchive && status === 'active' ? (
          <Button
            type="button"
            variant="outline"
            disabled={busy}
            onClick={() => void setStatus('inactive')}
          >
            {t('s08Crm.products.deactivate')}
          </Button>
        ) : null}
        {canArchive && status !== 'archived' ? (
          <Button
            type="button"
            variant="outline"
            disabled={busy}
            onClick={() => void setStatus('archived')}
          >
            {t('s08Crm.products.archive')}
          </Button>
        ) : null}
        {canDelete ? (
          <Button
            type="button"
            variant="destructive"
            disabled={busy}
            onClick={() => {
              if (window.confirm(t('s08Crm.products.confirmDelete')))
                void call(`/api/products/${id}`, 'DELETE', undefined, () =>
                  router.replace('/products'),
                );
            }}
          >
            {t('s08Crm.products.delete')}
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
