// path: app/(dashboard)/contracts/new/page.tsx
import type { Metadata } from 'next';
import { ContractForm } from '@/components/client/contract-form';
import { PageHeader } from '@/components/shared/page-header';
import { t } from '@/lib/i18n';
import { requirePagePermission } from '@/services/base/page-guard';
import { listClientOptions } from '@/services/contract/contracts';
import { listTemplates } from '@/services/contract/templates';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'New contract' };

export default async function NewContractPage(): Promise<JSX.Element> {
  const actor = await requirePagePermission('contract.create', 'tenant', 'contract');
  const companyId = actor.companyId as string;
  const [clients, templates] = await Promise.all([
    listClientOptions(companyId),
    listTemplates(companyId),
  ]);
  return (
    <div className="space-y-sp-16">
      <PageHeader
        title={t('s13Portal.contracts.new')}
        description={t('s13Portal.contracts.newDescription')}
      />
      <ContractForm
        edit={null}
        clients={clients}
        templates={templates}
        initial={{
          title: '',
          clientId: '',
          templateKey: '',
          bodyHtml: '',
          amount: '',
          effectiveOn: '',
          endsOn: '',
          signBy: '',
          renewalNoticeDays: 30,
          signingOrder: 'parallel',
          terms: '',
          signers: [{ name: '', email: '', roleLabel: '' }],
        }}
      />
    </div>
  );
}
