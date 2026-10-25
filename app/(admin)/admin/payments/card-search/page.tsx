// path: app/(admin)/admin/payments/card-search/page.tsx
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { CardSearch } from '@/components/payment/card-search';
import { PageHeader } from '@/components/shared/page-header';
import { getService } from '@/lib/container';
import { t } from '@/lib/i18n';
import { PLATFORM_ROLES } from '@/types/contracts';
import { StepUpForm } from '../../account-locks/_components/step-up-form';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Find a payment by card' };

export default async function AdminCardSearchPage(): Promise<JSX.Element> {
  const actor = await getService('auth').getActor();
  if (
    !actor ||
    !PLATFORM_ROLES.includes(actor.role) ||
    !(await getService('permissions').can(actor, 'payment.card.search', {
      type: 'payment',
      id: null,
    }))
  )
    notFound();
  return (
    <div className="space-y-sp-24">
      <PageHeader
        title={t('s10Payments.cardSearch.title')}
        description={t('s10Payments.cardSearch.adminDescription')}
      />
      <StepUpForm />
      <CardSearch endpoint="/api/admin/payments/card-search" platform />
    </div>
  );
}
