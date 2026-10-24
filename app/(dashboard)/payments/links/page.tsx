// path: app/(dashboard)/payments/links/page.tsx
import type { Metadata } from 'next';
import Link from 'next/link';
import { LinksManager } from '@/components/payment/links-manager';
import { PageHeader } from '@/components/shared/page-header';
import { ErrorState } from '@/components/shared/state-views';
import { Button } from '@/components/ui/button';
import { getService } from '@/lib/container';
import { t } from '@/lib/i18n';
import { requirePagePermission } from '@/services/base/page-guard';
import { listPaymentLinks, type LinkView } from '@/services/payment/links';
import { payableInvoices } from '@/services/payment/payment-detail';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Payment links' };

export default async function PaymentLinksPage(): Promise<JSX.Element> {
  const actor = await requirePagePermission('payment.read', 'tenant', 'payment_link');
  const companyId = actor.companyId as string;
  const canManage = await getService('permissions').can(actor, 'payment.link.manage', {
    type: 'payment_link',
  });
  let links: LinkView[] | null;
  let invoices: { id: string; number: string; due: string }[] = [];
  try {
    links = await listPaymentLinks(companyId, null);
    if (canManage) invoices = await payableInvoices(companyId);
  } catch {
    links = null;
  }
  return (
    <div className="space-y-sp-16">
      <PageHeader
        title={t('s10Payments.links.title')}
        description={t('s10Payments.links.description')}
        actions={
          <Button asChild variant="outline">
            <Link href="/payments">{t('s10Payments.links.back')}</Link>
          </Button>
        }
      />
      {links === null ? (
        <ErrorState description={t('s10Payments.links.loadError')} />
      ) : (
        <LinksManager links={links} invoices={invoices} canManage={canManage} />
      )}
    </div>
  );
}
