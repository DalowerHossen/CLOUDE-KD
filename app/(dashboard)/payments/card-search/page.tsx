// path: app/(dashboard)/payments/card-search/page.tsx
import type { Metadata } from 'next';
import { CardSearch } from '@/components/payment/card-search';
import { PageHeader } from '@/components/shared/page-header';
import { t } from '@/lib/i18n';
import { requirePagePermission } from '@/services/base/page-guard';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Find a payment by card' };

export default async function CardSearchPage(): Promise<JSX.Element> {
  await requirePagePermission('payment.read', 'tenant', 'payment');
  return (
    <div className="space-y-sp-24">
      <PageHeader
        title={t('s10Payments.cardSearch.title')}
        description={t('s10Payments.cardSearch.description')}
      />
      <CardSearch endpoint="/api/payments/card-search" platform={false} />
    </div>
  );
}
