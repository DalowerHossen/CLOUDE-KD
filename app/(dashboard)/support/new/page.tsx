// path: app/(dashboard)/support/new/page.tsx
import type { Metadata } from 'next';
import { PageHeader } from '@/components/shared/page-header';
import { NewTicketForm } from '@/components/support/new-ticket-form';
import { t } from '@/lib/i18n';
import { requirePagePermission } from '@/services/base/page-guard';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'New ticket' };

export default async function NewTicketPage(): Promise<JSX.Element> {
  await requirePagePermission('support.create', 'tenant', 'support_ticket');
  return (
    <div className="max-w-2xl space-y-sp-16">
      <PageHeader title={t('s07Company.support.newTicket')} />
      <NewTicketForm />
    </div>
  );
}
