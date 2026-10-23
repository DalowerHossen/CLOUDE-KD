// path: components/inventory/rates-panel.tsx
'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { z } from 'zod';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Money } from '@/lib/utils/currency';
import { formatMoney } from '@/lib/utils/formatting';
import { t } from '@/lib/i18n';
import type { ClientRate } from '@/services/product/client-rates';

const errorBody = z.object({ error: z.object({ message: z.string() }) });
const clientHits = z.object({
  data: z.object({ rows: z.array(z.object({ id: z.string(), name: z.string() })) }),
});

export function RatesPanel({
  productId,
  rates,
  canEdit,
}: {
  productId: string;
  rates: ClientRate[];
  canEdit: boolean;
}): JSX.Element {
  const router = useRouter();
  const [q, setQ] = useState('');
  const [hits, setHits] = useState<{ id: string; name: string }[]>([]);
  const [chosen, setChosen] = useState<{ id: string; name: string } | null>(null);
  const [price, setPrice] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function search(text: string): Promise<void> {
    setQ(text);
    if (text.trim().length < 2) {
      setHits([]);
      return;
    }
    try {
      const response = await fetch(
        `/api/clients?${new URLSearchParams({ q: text.trim(), status: 'active' }).toString()}`,
      );
      const parsed = clientHits.safeParse(await response.json().catch(() => null));
      setHits(parsed.success ? parsed.data.data.rows.slice(0, 8) : []);
    } catch {
      setHits([]);
    }
  }

  async function put(clientId: string, unitPrice: string | null): Promise<void> {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch('/api/products/rates', {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ clientId, productId, unitPrice }),
      });
      if (response.ok) {
        setChosen(null);
        setPrice('');
        setQ('');
        setHits([]);
        router.refresh();
      } else {
        const err = errorBody.safeParse(await response.json().catch(() => null));
        setError(err.success ? err.data.error.message : t('s08Crm.products.actionError'));
      }
    } catch {
      setError(t('s08Crm.products.actionError'));
    }
    setBusy(false);
  }

  return (
    <section
      className="space-y-sp-8 rounded-lg border bg-card p-sp-16 text-sm"
      aria-label={t('s08Crm.products.ratesTitle')}
    >
      <h2 className="text-h4 font-semibold">{t('s08Crm.products.ratesTitle')}</h2>
      <p className="text-muted-foreground">{t('s08Crm.products.ratesHelp')}</p>
      {rates.length === 0 ? (
        <p className="text-muted-foreground">{t('s08Crm.products.noRates')}</p>
      ) : (
        <ul className="divide-y">
          {rates.map((r) => (
            <li
              key={r.clientId}
              className="flex flex-wrap items-center justify-between gap-sp-8 py-1"
            >
              <span>
                {r.clientName}: <strong>{formatMoney(Money.parse(r.unitPrice))}</strong>
              </span>
              {canEdit ? (
                <Button
                  type="button"
                  variant="outline"
                  disabled={busy}
                  onClick={() => void put(r.clientId, null)}
                >
                  {t('s08Crm.products.removeRate')}
                </Button>
              ) : null}
            </li>
          ))}
        </ul>
      )}
      {canEdit ? (
        <div className="space-y-sp-8">
          <label className="block">
            <span className="block font-medium">{t('s08Crm.products.searchClient')}</span>
            <Input
              value={chosen ? chosen.name : q}
              maxLength={80}
              onChange={(e) => {
                setChosen(null);
                void search(e.target.value);
              }}
            />
          </label>
          {!chosen && hits.length > 0 ? (
            <ul className="rounded-md border">
              {hits.map((h) => (
                <li key={h.id}>
                  <button
                    type="button"
                    className="w-full px-3 py-1 text-left hover:bg-muted"
                    onClick={() => {
                      setChosen(h);
                      setHits([]);
                    }}
                  >
                    {h.name}
                  </button>
                </li>
              ))}
            </ul>
          ) : null}
          <label className="block">
            <span className="block font-medium">{t('s08Crm.products.ratePrice')}</span>
            <Input
              inputMode="decimal"
              value={price}
              maxLength={20}
              onChange={(e) => setPrice(e.target.value)}
            />
          </label>
          <Button
            type="button"
            disabled={busy || !chosen || price.trim() === ''}
            onClick={() => chosen && void put(chosen.id, price.trim())}
          >
            {t('s08Crm.products.setRate')}
          </Button>
        </div>
      ) : null}
      {error ? (
        <p role="alert" className="text-destructive">
          {error}
        </p>
      ) : null}
    </section>
  );
}
