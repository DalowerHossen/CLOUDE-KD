// path: app/(dashboard)/invoices/tax/clients/[clientId]/page.tsx
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ExemptionForm } from '@/components/invoice/exemption-form';
import { PageHeader } from '@/components/shared/page-header';
import { getService } from '@/lib/container';
import { NotFoundError } from '@/lib/errors';
import { t } from '@/lib/i18n';
import { certificateExpired } from '@/lib/tax/rules';
import { requirePagePermission } from '@/services/base/page-guard';
import { getExemption, type ExemptionView } from '@/services/tax/exemptions';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Client tax' };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function ClientTaxPage({
  params,
}: {
  params: Promise<{ clientId: string }>;
}): Promise<JSX.Element> {
  const actor = await requirePagePermission('tax.read', 'tenant', 'client');
  const { clientId } = await params;
  if (!UUID.test(clientId)) notFound();
  let exemption: ExemptionView;
  try {
    exemption = await getExemption(actor.companyId as string, clientId);
  } catch (error) {
    if (error instanceof NotFoundError) notFound();
    throw error;
  }
  const canManage = await getService('permissions').can(actor, 'tax.manage', { type: 'client' });
  return (
    <div className="mx-auto max-w-3xl space-y-sp-16">
      <PageHeader
        title={t('s09Invoicing.tax.exemptionPageTitle', { name: exemption.clientName })}
        actions={
          <Link className="underline" href="/invoices/tax">
            {t('s09Invoicing.tax.back')}
          </Link>
        }
      />
      <ExemptionForm
        exemption={exemption}
        expired={certificateExpired(
          exemption.certificateExpiresOn,
          new Date().toISOString().slice(0, 10),
        )}
        canManage={canManage}
      />
    </div>
  );
}
