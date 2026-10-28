// path: app/(admin)/admin/stores/_components/admin-connect.tsx
'use client';
import { useState } from 'react';
import { ConnectStoreForm } from '@/components/integration/commerce-forms';
import { t } from '@/lib/i18n';

/** Choose the company, then connect its Shopify or WooCommerce store. */
export function AdminConnect({
  companies,
}: {
  companies: { id: string; name: string }[];
}): JSX.Element {
  const [companyId, setCompanyId] = useState('');
  return (
    <div className="space-y-sp-12">
      <label className="block max-w-sm space-y-1 text-sm">
        <span>{t('s16Commerce.admin.company')}</span>
        <select
          className="h-10 w-full rounded-md border border-input bg-background px-2"
          value={companyId}
          onChange={(e) => setCompanyId(e.target.value)}
        >
          <option value="">{t('s16Commerce.admin.chooseCompany')}</option>
          {companies.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </label>
      {companyId === '' ? null : (
        <ConnectStoreForm endpoint="/api/admin/stores" companyId={companyId} />
      )}
    </div>
  );
}
