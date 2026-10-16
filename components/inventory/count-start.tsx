// path: components/inventory/count-start.tsx
'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { z } from 'zod';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { NativeSelect } from '@/components/ui/native-select';
import { t } from '@/lib/i18n';
import type { WarehouseView } from '@/services/inventory/warehouses';

const errorBody = z.object({ error: z.object({ message: z.string() }) });

export function CountStart({ warehouses }: { warehouses: WarehouseView[] }): JSX.Element {
  const router = useRouter();
  const active = warehouses.filter((w) => w.isActive);
  const [warehouseId, setWarehouseId] = useState(
    active.find((w) => w.isDefault)?.id ?? active[0]?.id ?? '',
  );
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function start(): Promise<void> {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch('/api/inventory/counts', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ warehouseId, note }),
      });
      const json: unknown = await response.json().catch(() => null);
      if (response.ok) {
        const id = z.object({ data: z.object({ id: z.string() }) }).safeParse(json);
        router.push(id.success ? `/inventory/counts/${id.data.data.id}` : '/inventory/counts');
        router.refresh();
        return;
      }
      const err = errorBody.safeParse(json);
      setError(err.success ? err.data.error.message : t('s08Crm.counts.error'));
    } catch {
      setError(t('s08Crm.counts.error'));
    }
    setBusy(false);
  }

  return (
    <form
      className="flex flex-wrap items-end gap-sp-8 rounded-lg border bg-card p-sp-12 text-sm"
      onSubmit={(e) => {
        e.preventDefault();
        void start();
      }}
    >
      <label>
        <span className="block font-medium">{t('s08Crm.counts.warehouse')}</span>
        <NativeSelect value={warehouseId} onChange={(e) => setWarehouseId(e.target.value)}>
          {active.map((w) => (
            <option key={w.id} value={w.id}>
              {w.name}
            </option>
          ))}
        </NativeSelect>
      </label>
      <label>
        <span className="block font-medium">{t('s08Crm.counts.note')}</span>
        <Input value={note} maxLength={500} onChange={(e) => setNote(e.target.value)} />
      </label>
      <Button type="submit" disabled={busy || warehouseId === ''}>
        {t('s08Crm.counts.start')}
      </Button>
      {error ? (
        <p role="alert" className="w-full text-destructive">
          {error}
        </p>
      ) : null}
    </form>
  );
}
