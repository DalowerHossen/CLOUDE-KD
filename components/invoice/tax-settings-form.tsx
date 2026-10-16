// path: components/invoice/tax-settings-form.tsx
'use client';
import { clampInt } from '@/lib/reports/numbers';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { NativeSelect } from '@/components/ui/native-select';
import { CASH_ROUNDING_STEPS, PRECISIONS } from '@/lib/invoice/rounding';
import { t } from '@/lib/i18n';
import { US_STATES } from '@/lib/tax/templates';
import type { TaxSettingsView } from '@/services/tax/settings';
import { callJson } from './api-call';

export function TaxSettingsForm({
  settings,
  canManage,
}: {
  settings: TaxSettingsView;
  canManage: boolean;
}): JSX.Element {
  const router = useRouter();
  const [s, setS] = useState(settings);
  const [nexus, setNexus] = useState(settings.nexusRegions.join(', '));
  const [codes, setCodes] = useState(settings.defaultTaxCodes.join(', '));
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<{ ok: boolean; text: string } | null>(null);
  const list = (v: string): string[] =>
    v
      .split(',')
      .map((x) => x.trim().toUpperCase())
      .filter((x) => x !== '');

  async function save(): Promise<void> {
    setBusy(true);
    setNote(null);
    const { version, ...rest } = s;
    const result = await callJson('/api/invoices/tax/settings', 'PUT', {
      expectedVersion: version,
      settings: {
        ...rest,
        nexusRegions: list(nexus).filter((x) => (US_STATES as readonly string[]).includes(x)),
        defaultTaxCodes: list(codes),
      },
    });
    if (result.ok) {
      setNote({ ok: true, text: t('s09Invoicing.tax.saved') });
      router.refresh();
    } else
      setNote({
        ok: false,
        text:
          result.status === 409
            ? t('s09Invoicing.tax.conflict')
            : (result.message ?? t('s09Invoicing.tax.error')),
      });
    setBusy(false);
  }

  const off = !canManage;
  return (
    <form
      className="grid gap-sp-12 text-sm sm:grid-cols-2"
      onSubmit={(e) => {
        e.preventDefault();
        void save();
      }}
    >
      <h2 className="text-lg font-semibold sm:col-span-2">{t('s09Invoicing.tax.settingsTitle')}</h2>
      <label>
        {t('s09Invoicing.tax.priceMode')}
        <NativeSelect
          disabled={off}
          value={s.priceMode}
          onChange={(e) =>
            setS({ ...s, priceMode: e.target.value === 'inclusive' ? 'inclusive' : 'exclusive' })
          }
        >
          <option value="exclusive">{t('s09Invoicing.tax.priceExclusive')}</option>
          <option value="inclusive">{t('s09Invoicing.tax.priceInclusive')}</option>
        </NativeSelect>
      </label>
      <label>
        {t('s09Invoicing.tax.discountOrder')}
        <NativeSelect
          disabled={off}
          value={s.discountOrder}
          onChange={(e) =>
            setS({
              ...s,
              discountOrder: e.target.value === 'after_tax' ? 'after_tax' : 'before_tax',
            })
          }
        >
          <option value="before_tax">{t('s09Invoicing.tax.discountBefore')}</option>
          <option value="after_tax">{t('s09Invoicing.tax.discountAfter')}</option>
        </NativeSelect>
      </label>
      <label>
        {t('s09Invoicing.tax.roundingPolicy')}
        <NativeSelect
          disabled={off}
          value={s.roundingPolicy}
          onChange={(e) =>
            setS({ ...s, roundingPolicy: e.target.value === 'on_total' ? 'on_total' : 'per_line' })
          }
        >
          <option value="per_line">{t('s09Invoicing.tax.roundPerLine')}</option>
          <option value="on_total">{t('s09Invoicing.tax.roundOnTotal')}</option>
        </NativeSelect>
      </label>
      <label>
        {t('s09Invoicing.tax.roundingMode')}
        <NativeSelect
          disabled={off}
          value={s.roundingMode}
          onChange={(e) =>
            setS({ ...s, roundingMode: e.target.value === 'half_even' ? 'half_even' : 'half_up' })
          }
        >
          <option value="half_up">{t('s09Invoicing.tax.halfUp')}</option>
          <option value="half_even">{t('s09Invoicing.tax.halfEven')}</option>
        </NativeSelect>
      </label>
      <label>
        {t('s09Invoicing.tax.precision')}
        <NativeSelect
          disabled={off}
          value={String(s.precision)}
          onChange={(e) =>
            setS({ ...s, precision: PRECISIONS.find((p) => String(p) === e.target.value) ?? 2 })
          }
        >
          {PRECISIONS.map((p) => (
            <option key={p} value={p}>
              {p}
            </option>
          ))}
        </NativeSelect>
      </label>
      <label>
        {t('s09Invoicing.tax.cashRounding')}
        <NativeSelect
          disabled={off}
          value={s.cashRounding}
          onChange={(e) =>
            setS({
              ...s,
              cashRounding: CASH_ROUNDING_STEPS.find((c) => c === e.target.value) ?? '0',
            })
          }
        >
          {CASH_ROUNDING_STEPS.map((c) => (
            <option key={c} value={c}>
              {c === '0' ? t('s09Invoicing.tax.cashNone') : c}
            </option>
          ))}
        </NativeSelect>
      </label>
      <label>
        {t('s09Invoicing.tax.fiscalYear')}
        <NativeSelect
          disabled={off}
          value={String(s.fiscalYearStartMonth)}
          onChange={(e) =>
            setS({
              ...s,
              fiscalYearStartMonth: clampInt(e.target.value, 1, 12, 1),
            })
          }
        >
          {MONTH_NAMES.map((m, i) => (
            <option key={m} value={i + 1}>
              {m}
            </option>
          ))}
        </NativeSelect>
      </label>
      <label>
        {t('s09Invoicing.tax.defaultWithholding')}
        <Input
          disabled={off}
          inputMode="decimal"
          value={s.defaultWithholding}
          maxLength={9}
          onChange={(e) => setS({ ...s, defaultWithholding: e.target.value })}
        />
      </label>
      <label>
        {t('s09Invoicing.tax.sellerTaxLabel')}
        <Input
          disabled={off}
          value={s.sellerTaxLabel}
          maxLength={30}
          onChange={(e) => setS({ ...s, sellerTaxLabel: e.target.value })}
        />
      </label>
      <label>
        {t('s09Invoicing.tax.sellerTaxId')}
        <Input
          disabled={off}
          value={s.sellerTaxId}
          maxLength={40}
          onChange={(e) => setS({ ...s, sellerTaxId: e.target.value })}
        />
      </label>
      <label>
        {t('s09Invoicing.tax.sellerCountry')}
        <Input
          disabled={off}
          value={s.sellerCountry ?? ''}
          maxLength={2}
          onChange={(e) =>
            setS({
              ...s,
              sellerCountry: e.target.value === '' ? null : e.target.value.toUpperCase(),
            })
          }
        />
      </label>
      <label>
        {t('s09Invoicing.tax.defaultTaxCodes')}
        <Input
          disabled={off}
          value={codes}
          maxLength={120}
          onChange={(e) => setCodes(e.target.value)}
        />
      </label>
      <label className="sm:col-span-2">
        {t('s09Invoicing.tax.nexus')}
        <Input
          disabled={off}
          value={nexus}
          maxLength={200}
          onChange={(e) => setNexus(e.target.value)}
        />
      </label>
      <label className="flex items-center gap-sp-8 sm:col-span-2">
        <input
          type="checkbox"
          disabled={off}
          checked={s.reverseCharge}
          onChange={(e) => setS({ ...s, reverseCharge: e.target.checked })}
        />
        {t('s09Invoicing.tax.reverseCharge')}
      </label>
      <label className="flex items-center gap-sp-8 sm:col-span-2">
        <input
          type="checkbox"
          disabled={off}
          checked={s.marketplaceFacilitator}
          onChange={(e) => setS({ ...s, marketplaceFacilitator: e.target.checked })}
        />
        {t('s09Invoicing.tax.marketplace')}
      </label>
      {note ? (
        <p
          role={note.ok ? 'status' : 'alert'}
          className={note.ok ? 'sm:col-span-2' : 'text-destructive sm:col-span-2'}
        >
          {note.text}
        </p>
      ) : null}
      {canManage ? (
        <div className="sm:col-span-2">
          <Button type="submit" disabled={busy}>
            {busy ? t('s09Invoicing.tax.saving') : t('s09Invoicing.tax.saveSettings')}
          </Button>
        </div>
      ) : null}
    </form>
  );
}

const MONTH_NAMES = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];
