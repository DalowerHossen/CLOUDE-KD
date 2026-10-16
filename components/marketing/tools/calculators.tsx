// path: components/marketing/tools/calculators.tsx
'use client';
import { useState } from 'react';
import { Input } from '@/components/ui/input';
import { NativeSelect } from '@/components/ui/native-select';
import { trackConversion } from '@/lib/analytics/start-provider';
import { t } from '@/lib/i18n';
import { formatUsd, lateFee, salesTax } from '@/lib/marketing/tools';

function Row({
  label,
  value,
  strong,
}: {
  label: string;
  value: string;
  strong?: boolean;
}): JSX.Element {
  return (
    <div className={`flex justify-between ${strong ? 'border-t pt-1 text-base font-bold' : ''}`}>
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}

function useCountOnce(): () => void {
  const [counted, setCounted] = useState(false);
  return () => {
    if (!counted) {
      setCounted(true);
      trackConversion('free_tool_used');
    }
  };
}

export function LateFeeCalculator(): JSX.Element {
  const [amount, setAmount] = useState('1000');
  const [rate, setRate] = useState('10');
  const [days, setDays] = useState('30');
  const [flat, setFlat] = useState('0');
  const count = useCountOnce();
  const result = lateFee(amount, rate, days, flat);
  return (
    <div className="grid gap-sp-24 md:grid-cols-2">
      <form
        className="space-y-sp-12"
        onSubmit={(e) => e.preventDefault()}
        aria-label={t('s06Public.tools.late.title')}
      >
        <label className="block space-y-1 text-sm">
          <span>{t('s06Public.tools.late.amount')}</span>
          <Input
            inputMode="decimal"
            value={amount}
            onChange={(e) => {
              setAmount(e.target.value);
              count();
            }}
          />
        </label>
        <label className="block space-y-1 text-sm">
          <span>{t('s06Public.tools.late.rate')}</span>
          <Input
            inputMode="decimal"
            value={rate}
            onChange={(e) => {
              setRate(e.target.value);
              count();
            }}
          />
        </label>
        <label className="block space-y-1 text-sm">
          <span>{t('s06Public.tools.late.days')}</span>
          <Input
            inputMode="numeric"
            value={days}
            onChange={(e) => {
              setDays(e.target.value);
              count();
            }}
          />
        </label>
        <label className="block space-y-1 text-sm">
          <span>{t('s06Public.tools.late.flat')}</span>
          <Input
            inputMode="decimal"
            value={flat}
            onChange={(e) => {
              setFlat(e.target.value);
              count();
            }}
          />
        </label>
      </form>
      <div aria-live="polite" className="rounded-lg border bg-card p-sp-16">
        {result ? (
          <dl className="space-y-1 text-sm">
            <Row label={t('s06Public.tools.late.interest')} value={formatUsd(result.interest)} />
            <Row label={t('s06Public.tools.late.flat')} value={formatUsd(result.flatFee)} />
            <Row label={t('s06Public.tools.late.fees')} value={formatUsd(result.total)} />
            <Row strong label={t('s06Public.tools.late.due')} value={formatUsd(result.amountDue)} />
          </dl>
        ) : (
          <p role="alert" className="text-sm text-destructive">
            {t('s06Public.tools.invalid')}
          </p>
        )}
        <p className="mt-sp-12 text-caption text-muted-foreground">
          {t('s06Public.tools.late.note')}
        </p>
      </div>
    </div>
  );
}

export function SalesTaxCalculator(): JSX.Element {
  const [amount, setAmount] = useState('100');
  const [rate, setRate] = useState('8');
  const [mode, setMode] = useState<'add' | 'extract'>('add');
  const count = useCountOnce();
  const result = salesTax(amount, rate, mode);
  return (
    <div className="grid gap-sp-24 md:grid-cols-2">
      <form
        className="space-y-sp-12"
        onSubmit={(e) => e.preventDefault()}
        aria-label={t('s06Public.tools.tax.title')}
      >
        <label className="block space-y-1 text-sm">
          <span>{t('s06Public.tools.tax.mode')}</span>
          <NativeSelect
            value={mode}
            onChange={(e) => {
              setMode(e.target.value as 'add' | 'extract');
              count();
            }}
          >
            <option value="add">{t('s06Public.tools.tax.add')}</option>
            <option value="extract">{t('s06Public.tools.tax.extract')}</option>
          </NativeSelect>
        </label>
        <label className="block space-y-1 text-sm">
          <span>{t('s06Public.tools.tax.amount')}</span>
          <Input
            inputMode="decimal"
            value={amount}
            onChange={(e) => {
              setAmount(e.target.value);
              count();
            }}
          />
        </label>
        <label className="block space-y-1 text-sm">
          <span>{t('s06Public.tools.tax.rate')}</span>
          <Input
            inputMode="decimal"
            value={rate}
            onChange={(e) => {
              setRate(e.target.value);
              count();
            }}
          />
        </label>
      </form>
      <div aria-live="polite" className="rounded-lg border bg-card p-sp-16">
        {result ? (
          <dl className="space-y-1 text-sm">
            <Row label={t('s06Public.tools.tax.net')} value={formatUsd(result.net)} />
            <Row label={t('s06Public.tools.tax.tax')} value={formatUsd(result.tax)} />
            <Row strong label={t('s06Public.tools.tax.gross')} value={formatUsd(result.gross)} />
          </dl>
        ) : (
          <p role="alert" className="text-sm text-destructive">
            {t('s06Public.tools.invalid')}
          </p>
        )}
      </div>
    </div>
  );
}
