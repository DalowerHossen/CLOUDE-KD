// path: components/inventory/warehouses-manager.tsx
'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { z } from 'zod';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { NativeSelect } from '@/components/ui/native-select';
import { COUNTRY_CODES, countryName } from '@/lib/company/countries';
import { t } from '@/lib/i18n';
import type { WarehouseView } from '@/services/inventory/warehouses';

const errorBody = z.object({ error: z.object({ message: z.string() }) });

interface Draft {
  id: string | null;
  expectedVersion: number | null;
  name: string;
  code: string;
  addressLine1: string;
  addressCity: string;
  addressRegion: string;
  addressPostalCode: string;
  addressCountry: string;
  isActive: boolean;
}
const blank: Draft = {
  id: null,
  expectedVersion: null,
  name: '',
  code: '',
  addressLine1: '',
  addressCity: '',
  addressRegion: '',
  addressPostalCode: '',
  addressCountry: '',
  isActive: true,
};

export function WarehousesManager({
  warehouses,
  canEdit,
}: {
  warehouses: WarehouseView[];
  canEdit: boolean;
}): JSX.Element {
  const router = useRouter();
  const [draft, setDraft] = useState<Draft | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function call(method: 'PUT' | 'POST', body: unknown): Promise<void> {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch('/api/inventory/warehouses', {
        method,
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (response.ok) {
        setDraft(null);
        router.refresh();
      } else {
        const err = errorBody.safeParse(await response.json().catch(() => null));
        setError(err.success ? err.data.error.message : t('s08Crm.inventory.error'));
      }
    } catch {
      setError(t('s08Crm.inventory.error'));
    }
    setBusy(false);
  }

  const edit = (w: WarehouseView): void =>
    setDraft({
      id: w.id,
      expectedVersion: w.version,
      name: w.name,
      code: w.code,
      addressLine1: w.addressLine1,
      addressCity: w.addressCity,
      addressRegion: w.addressRegion,
      addressPostalCode: w.addressPostalCode,
      addressCountry: w.addressCountry ?? '',
      isActive: w.isActive,
    });

  return (
    <div className="space-y-sp-12 text-sm">
      <ul className="divide-y rounded-lg border bg-card">
        {warehouses.map((w) => (
          <li key={w.id} className="flex flex-wrap items-center justify-between gap-sp-8 p-sp-12">
            <div className="min-w-0">
              <p className="font-medium">
                {w.name} <span className="text-muted-foreground">({w.code})</span>
              </p>
              <p className="flex gap-sp-8">
                {w.isDefault ? (
                  <Badge variant="outline">{t('s08Crm.inventory.isDefault')}</Badge>
                ) : null}
                {!w.isActive ? <Badge variant="outline">-</Badge> : null}
              </p>
            </div>
            {canEdit ? (
              <div className="flex flex-wrap gap-sp-8">
                <Button type="button" variant="outline" disabled={busy} onClick={() => edit(w)}>
                  {t('s08Crm.inventory.edit')}
                </Button>
                {!w.isDefault && w.isActive ? (
                  <Button
                    type="button"
                    variant="outline"
                    disabled={busy}
                    onClick={() => void call('POST', { action: 'make_default', id: w.id })}
                  >
                    {t('s08Crm.inventory.makeDefault')}
                  </Button>
                ) : null}
                {!w.isDefault ? (
                  <Button
                    type="button"
                    variant="destructive"
                    disabled={busy}
                    onClick={() => {
                      if (window.confirm(t('s08Crm.inventory.confirmDelete')))
                        void call('POST', { action: 'delete', id: w.id });
                    }}
                  >
                    {t('s08Crm.inventory.delete')}
                  </Button>
                ) : null}
              </div>
            ) : null}
          </li>
        ))}
      </ul>
      {canEdit && !draft ? (
        <Button type="button" onClick={() => setDraft(blank)}>
          {t('s08Crm.inventory.add')}
        </Button>
      ) : null}
      {draft ? (
        <form
          className="space-y-sp-8 rounded-lg border bg-card p-sp-16"
          onSubmit={(e) => {
            e.preventDefault();
            void call('PUT', {
              ...draft,
              addressCountry: draft.addressCountry === '' ? null : draft.addressCountry,
            });
          }}
        >
          <div className="grid gap-sp-8 sm:grid-cols-2">
            <label>
              <span className="block">{t('s08Crm.inventory.name')}</span>
              <Input
                required
                maxLength={100}
                value={draft.name}
                onChange={(e) => setDraft({ ...draft, name: e.target.value })}
              />
            </label>
            <label>
              <span className="block">{t('s08Crm.inventory.code')}</span>
              <Input
                required
                maxLength={20}
                value={draft.code}
                onChange={(e) => setDraft({ ...draft, code: e.target.value })}
              />
            </label>
            <label>
              <span className="block">{t('s08Crm.inventory.address')}</span>
              <Input
                maxLength={200}
                value={draft.addressLine1}
                onChange={(e) => setDraft({ ...draft, addressLine1: e.target.value })}
              />
            </label>
            <label>
              <span className="block">{t('s08Crm.inventory.city')}</span>
              <Input
                maxLength={100}
                value={draft.addressCity}
                onChange={(e) => setDraft({ ...draft, addressCity: e.target.value })}
              />
            </label>
            <label>
              <span className="block">{t('s08Crm.inventory.region')}</span>
              <Input
                maxLength={100}
                value={draft.addressRegion}
                onChange={(e) => setDraft({ ...draft, addressRegion: e.target.value })}
              />
            </label>
            <label>
              <span className="block">{t('s08Crm.inventory.postalCode')}</span>
              <Input
                maxLength={20}
                value={draft.addressPostalCode}
                onChange={(e) => setDraft({ ...draft, addressPostalCode: e.target.value })}
              />
            </label>
            <label>
              <span className="block">{t('s08Crm.inventory.country')}</span>
              <NativeSelect
                value={draft.addressCountry}
                onChange={(e) => setDraft({ ...draft, addressCountry: e.target.value })}
              >
                <option value="">-</option>
                {COUNTRY_CODES.map((c) => (
                  <option key={c} value={c}>
                    {countryName(c)}
                  </option>
                ))}
              </NativeSelect>
            </label>
            <label className="flex items-center gap-sp-8 self-end">
              <input
                type="checkbox"
                checked={draft.isActive}
                onChange={(e) => setDraft({ ...draft, isActive: e.target.checked })}
              />
              {t('s08Crm.inventory.active')}
            </label>
          </div>
          <div className="flex gap-sp-8">
            <Button type="submit" disabled={busy}>
              {t('s08Crm.inventory.save')}
            </Button>
            <Button type="button" variant="outline" onClick={() => setDraft(null)}>
              {t('s08Crm.inventory.cancel')}
            </Button>
          </div>
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
