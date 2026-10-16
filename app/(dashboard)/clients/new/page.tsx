// path: app/(dashboard)/clients/new/page.tsx
import type { Metadata } from 'next';
import { ClientForm } from '@/components/crm/client-form';
import { PageHeader } from '@/components/shared/page-header';
import { t } from '@/lib/i18n';
import { requirePagePermission } from '@/services/base/page-guard';
import { listDefs } from '@/services/client/custom-fields';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'New client' };

export default async function NewClientPage(): Promise<JSX.Element> {
  const actor = await requirePagePermission('client.create', 'tenant', 'client');
  const defs = await listDefs(actor.companyId as string, 'client').catch(() => []);
  return (
    <div className="mx-auto max-w-4xl space-y-sp-16">
      <PageHeader title={t('s08Crm.clients.createTitle')} />
      <ClientForm client={null} defs={defs} />
    </div>
  );
}
