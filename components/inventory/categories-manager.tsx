// path: components/inventory/categories-manager.tsx
'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { z } from 'zod';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { t } from '@/lib/i18n';
import type { CategoryView } from '@/services/product/categories';

const errorBody = z.object({ error: z.object({ message: z.string() }) });

export function CategoriesManager({
  categories,
  canEdit,
}: {
  categories: CategoryView[];
  canEdit: boolean;
}): JSX.Element {
  const router = useRouter();
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function call(method: 'PUT' | 'DELETE', body: unknown): Promise<void> {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch('/api/products/categories', {
        method,
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (response.ok) {
        setName('');
        router.refresh();
      } else {
        const err = errorBody.safeParse(await response.json().catch(() => null));
        setError(err.success ? err.data.error.message : t('s08Crm.products.categoryError'));
      }
    } catch {
      setError(t('s08Crm.products.categoryError'));
    }
    setBusy(false);
  }

  return (
    <div className="space-y-sp-12 text-sm">
      {categories.length === 0 ? (
        <p className="text-muted-foreground">{t('s08Crm.products.noCategories')}</p>
      ) : null}
      <ul className="divide-y rounded-lg border bg-card">
        {categories.map((c) => (
          <li key={c.id} className="flex flex-wrap items-center justify-between gap-sp-8 p-sp-12">
            <span>
              {c.name}{' '}
              <span className="text-muted-foreground">
                ({t('s08Crm.products.items', { count: c.products })})
              </span>
            </span>
            {canEdit ? (
              <Button
                type="button"
                variant="outline"
                disabled={busy}
                onClick={() => void call('DELETE', { id: c.id })}
              >
                {t('s08Crm.products.removeTier')}
              </Button>
            ) : null}
          </li>
        ))}
      </ul>
      {canEdit ? (
        <form
          className="flex flex-wrap items-end gap-sp-8"
          onSubmit={(e) => {
            e.preventDefault();
            void call('PUT', { id: null, name, position: categories.length });
          }}
        >
          <label>
            <span className="block font-medium">{t('s08Crm.products.categoryName')}</span>
            <Input value={name} maxLength={80} onChange={(e) => setName(e.target.value)} />
          </label>
          <Button type="submit" disabled={busy || name.trim() === ''}>
            {t('s08Crm.products.addCategory')}
          </Button>
        </form>
      ) : null}
      {error ? (
        <p role="alert" className="text-destructive">
          {error}
        </p>
      ) : null}
    </div>
  );
}
