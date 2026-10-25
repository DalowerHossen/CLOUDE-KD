// path: components/payment/card-search.tsx
'use client';
import { useState } from 'react';
import { z } from 'zod';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { t } from '@/lib/i18n';
import type { CardSearchRow } from '@/lib/payment/card-search-rules';

const errorBody = z.object({ error: z.object({ message: z.string() }) });

interface Props {
  endpoint: string;
  /** Platform staff also give a reason and may limit the search to one company. */
  platform: boolean;
}

function when(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : `${d.toISOString().slice(0, 16).replace('T', ' ')} UTC`;
}

export function CardSearch({ endpoint, platform }: Props): JSX.Element {
  const [values, setValues] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [rows, setRows] = useState<CardSearchRow[] | null>(null);
  const set = (name: string, value: string): void => setValues({ ...values, [name]: value });

  async function submit(event: React.FormEvent): Promise<void> {
    event.preventDefault();
    setBusy(true);
    setError(null);
    const body: Record<string, string> = {};
    for (const [k, v] of Object.entries(values)) if (v.trim() !== '') body[k] = v.trim();
    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
        cache: 'no-store',
      });
      const json: unknown = await response.json().catch(() => null);
      if (!response.ok) {
        const parsed = errorBody.safeParse(json);
        throw new Error(
          parsed.success ? parsed.data.error.message : t('s10Payments.cardSearch.failed'),
        );
      }
      const data = (json as { data?: CardSearchRow[] } | null)?.data;
      setRows(Array.isArray(data) ? data : []);
    } catch (thrown) {
      setRows(null);
      setError(thrown instanceof Error ? thrown.message : t('s10Payments.cardSearch.failed'));
    }
    setBusy(false);
  }

  const field = (
    name: string,
    label: string,
    extra?: { max?: number; type?: string },
  ): JSX.Element => (
    <div className="space-y-1">
      <Label htmlFor={`cs-${name}`}>{label}</Label>
      <Input
        id={`cs-${name}`}
        type={extra?.type ?? 'text'}
        value={values[name] ?? ''}
        maxLength={extra?.max}
        autoComplete="off"
        onChange={(e) => set(name, e.target.value)}
      />
    </div>
  );

  return (
    <div className="space-y-sp-16">
      <form onSubmit={(e) => void submit(e)} className="space-y-sp-12" noValidate>
        {error ? <Alert variant="destructive">{error}</Alert> : null}
        <div className="grid gap-sp-12 sm:grid-cols-2">
          {field('last4', t('s10Payments.cardSearch.last4'), { max: 4 })}
          {field('brand', t('s10Payments.cardSearch.brand'), { max: 20 })}
          {field('from', t('s10Payments.cardSearch.from'), { type: 'date' })}
          {field('to', t('s10Payments.cardSearch.to'), { type: 'date' })}
          {field('amountMin', t('s10Payments.cardSearch.amountMin'), { max: 17 })}
          {field('amountMax', t('s10Payments.cardSearch.amountMax'), { max: 17 })}
          {platform ? field('companyId', t('s10Payments.cardSearch.company'), { max: 36 }) : null}
          {platform ? field('reason', t('s10Payments.cardSearch.reason'), { max: 300 }) : null}
        </div>
        <Button type="submit" disabled={busy}>
          {busy ? t('s10Payments.cardSearch.searching') : t('s10Payments.cardSearch.search')}
        </Button>
      </form>
      {rows !== null && rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t('s10Payments.cardSearch.none')}</p>
      ) : null}
      {rows !== null && rows.length > 0 ? (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <caption className="sr-only">{t('s10Payments.cardSearch.title')}</caption>
            <thead>
              <tr>
                {(
                  [
                    'when',
                    'amount',
                    'card',
                    'merchant',
                    'payer',
                    'contact',
                    'address',
                    'status',
                  ] as const
                ).map((c) => (
                  <th key={c} scope="col" className="p-2 font-medium">
                    {t(`s10Payments.cardSearch.columns.${c}`)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.paymentId} className="border-t align-top">
                  <td className="p-2">{when(r.at)}</td>
                  <td className="p-2">USD {r.amount}</td>
                  <td className="p-2">
                    {r.card.brand ?? ''} ...{r.card.last4}
                  </td>
                  <td className="p-2">
                    {r.merchant.name}
                    {(r.merchant.store ?? r.merchant.website) ? (
                      <div className="text-muted-foreground">
                        {r.merchant.store ?? r.merchant.website}
                      </div>
                    ) : null}
                    {r.invoiceNumber ? (
                      <div className="text-muted-foreground">{r.invoiceNumber}</div>
                    ) : null}
                  </td>
                  <td className="p-2">{r.payer.name}</td>
                  <td className="p-2">
                    {r.payer.email ?? ''}
                    {r.payer.phone ? <div>{r.payer.phone}</div> : null}
                  </td>
                  <td className="p-2">{r.payer.address ?? r.payer.country ?? ''}</td>
                  <td className="p-2">{r.status}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </div>
  );
}
