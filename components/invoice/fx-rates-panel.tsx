// path: components/invoice/fx-rates-panel.tsx
'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { NativeSelect } from '@/components/ui/native-select';
import { FX_CURRENCIES } from '@/lib/fx/rates';
import { t } from '@/lib/i18n';
import type { FxRateView } from '@/services/fx/rates';
import { callJson } from './api-call';

export function FxRatesPanel({
  rates,
  today,
  canManage,
}: {
  rates: FxRateView[];
  today: string;
  canManage: boolean;
}): JSX.Element {
  const router = useRouter();
  const [currency, setCurrency] = useState<string>(FX_CURRENCIES[0] ?? 'EUR');
  const [rate, setRate] = useState('');
  const [asOf, setAsOf] = useState(today);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<{ ok: boolean; text: string } | null>(null);
  const byCurrency = new Map(rates.map((r) => [r.currency, r]));

  async function save(): Promise<void> {
    setBusy(true);
    setNote(null);
    const result = await callJson('/api/invoices/fx', 'PUT', { currency, rate, asOf });
    if (result.ok) {
      setNote({ ok: true, text: t('s09Invoicing.tax.saved') });
      setRate('');
      router.refresh();
    } else setNote({ ok: false, text: result.message ?? t('s09Invoicing.tax.error') });
    setBusy(false);
  }

  return (
    <section className="space-y-sp-12">
      <h2 className="text-lg font-semibold">{t('s09Invoicing.tax.fxTitle')}</h2>
      <p className="text-sm text-muted-foreground">{t('s09Invoicing.tax.fxHelp')}</p>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <caption className="sr-only">{t('s09Invoicing.tax.fxTitle')}</caption>
          <thead>
            <tr className="text-left">
              <th scope="col">{t('s09Invoicing.tax.fxCurrency')}</th>
              <th scope="col" className="text-right">
                {t('s09Invoicing.tax.fxRate')}
              </th>
              <th scope="col">{t('s09Invoicing.tax.fxDate')}</th>
              <th scope="col" className="hidden sm:table-cell">
                {t('s09Invoicing.tax.fxSource')}
              </th>
            </tr>
          </thead>
          <tbody>
            {FX_CURRENCIES.map((c) => {
              const r = byCurrency.get(c);
              return (
                <tr key={c}>
                  <td>{c}</td>
                  <td className="text-right">{r ? r.rate : '-'}</td>
                  <td>{r ? r.asOf : t('s09Invoicing.tax.fxNone')}</td>
                  <td className="hidden sm:table-cell">
                    {r
                      ? r.source === 'manual'
                        ? t('s09Invoicing.tax.fxManual')
                        : t('s09Invoicing.tax.fxProvider')
                      : ''}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {canManage ? (
        <form
          className="grid gap-sp-8 rounded-lg border bg-card p-sp-12 text-sm sm:grid-cols-4"
          onSubmit={(e) => {
            e.preventDefault();
            void save();
          }}
        >
          <label>
            {t('s09Invoicing.tax.fxCurrency')}
            <NativeSelect value={currency} onChange={(e) => setCurrency(e.target.value)}>
              {FX_CURRENCIES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </NativeSelect>
          </label>
          <label>
            {t('s09Invoicing.tax.fxRate')}
            <Input
              inputMode="decimal"
              value={rate}
              maxLength={21}
              required
              onChange={(e) => setRate(e.target.value)}
            />
          </label>
          <label>
            {t('s09Invoicing.tax.fxDate')}
            <Input
              type="date"
              value={asOf}
              max={today}
              required
              onChange={(e) => setAsOf(e.target.value)}
            />
          </label>
          <div className="self-end">
            <Button type="submit" disabled={busy}>
              {t('s09Invoicing.tax.fxSave')}
            </Button>
          </div>
        </form>
      ) : null}
      {note ? (
        <p
          role={note.ok ? 'status' : 'alert'}
          className={note.ok ? 'text-sm' : 'text-sm text-destructive'}
        >
          {note.text}
        </p>
      ) : null}
    </section>
  );
}
