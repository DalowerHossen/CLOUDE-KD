// path: components/invoice/address-fields.tsx
'use client';
import { Input } from '@/components/ui/input';
import { t } from '@/lib/i18n';
import type { AddressBlock } from '@/lib/invoice/input';

/** One block of name, contact, tax number and address (used for "Bill to" and "Ship to"). */
export function AddressFields({
  value,
  onChange,
  disabled,
  withTax,
}: {
  value: AddressBlock;
  onChange: (next: AddressBlock) => void;
  disabled: boolean;
  withTax: boolean;
}): JSX.Element {
  const set = <K extends keyof AddressBlock>(key: K, v: AddressBlock[K]): void =>
    onChange({ ...value, [key]: v });
  return (
    <div className="grid gap-sp-8 text-sm sm:grid-cols-2">
      <label className="sm:col-span-2">
        {t('s09Invoicing.invoices.name')}
        <Input
          disabled={disabled}
          maxLength={200}
          value={value.name}
          onChange={(e) => set('name', e.target.value)}
        />
      </label>
      <label>
        {t('s09Invoicing.invoices.contactName')}
        <Input
          disabled={disabled}
          maxLength={200}
          value={value.contactName}
          onChange={(e) => set('contactName', e.target.value)}
        />
      </label>
      <label>
        {t('s09Invoicing.invoices.email')}
        <Input
          disabled={disabled}
          maxLength={254}
          value={value.email}
          onChange={(e) => set('email', e.target.value)}
        />
      </label>
      <label>
        {t('s09Invoicing.invoices.phone')}
        <Input
          disabled={disabled}
          maxLength={30}
          value={value.phone}
          onChange={(e) => set('phone', e.target.value)}
        />
      </label>
      {withTax ? (
        <>
          <label>
            {t('s09Invoicing.invoices.taxIdLabel')}
            <Input
              disabled={disabled}
              maxLength={30}
              value={value.taxLabel}
              onChange={(e) => set('taxLabel', e.target.value)}
            />
          </label>
          <label>
            {t('s09Invoicing.invoices.taxId')}
            <Input
              disabled={disabled}
              maxLength={40}
              value={value.taxId}
              onChange={(e) => set('taxId', e.target.value)}
            />
          </label>
        </>
      ) : null}
      <label className="sm:col-span-2">
        {t('s09Invoicing.invoices.line1')}
        <Input
          disabled={disabled}
          maxLength={200}
          value={value.line1}
          onChange={(e) => set('line1', e.target.value)}
        />
      </label>
      <label className="sm:col-span-2">
        {t('s09Invoicing.invoices.line2')}
        <Input
          disabled={disabled}
          maxLength={200}
          value={value.line2}
          onChange={(e) => set('line2', e.target.value)}
        />
      </label>
      <label>
        {t('s09Invoicing.invoices.city')}
        <Input
          disabled={disabled}
          maxLength={100}
          value={value.city}
          onChange={(e) => set('city', e.target.value)}
        />
      </label>
      <label>
        {t('s09Invoicing.invoices.region')}
        <Input
          disabled={disabled}
          maxLength={100}
          value={value.region}
          onChange={(e) => set('region', e.target.value)}
        />
      </label>
      <label>
        {t('s09Invoicing.invoices.postalCode')}
        <Input
          disabled={disabled}
          maxLength={20}
          value={value.postalCode}
          onChange={(e) => set('postalCode', e.target.value)}
        />
      </label>
      <label>
        {t('s09Invoicing.invoices.country')}
        <Input
          disabled={disabled}
          maxLength={2}
          value={value.country ?? ''}
          onChange={(e) =>
            set('country', e.target.value === '' ? null : e.target.value.toUpperCase())
          }
        />
      </label>
    </div>
  );
}
