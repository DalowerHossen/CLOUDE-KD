// path: app/(dashboard)/projects/[id]/bill/page.tsx
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { BillForm } from '@/components/project/bill-form';
import { PageHeader } from '@/components/shared/page-header';
import { EmptyState } from '@/components/shared/state-views';
import { NotFoundError } from '@/lib/errors';
import { t } from '@/lib/i18n';
import { addDays } from '@/lib/invoice/terms';
import { requirePagePermission } from '@/services/base/page-guard';
import { unbilledForProject, type UnbilledData } from '@/services/project/billing';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Bill project work' };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function BillProjectPage({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<JSX.Element> {
  const actor = await requirePagePermission('project.bill', 'tenant', 'project');
  const id = (await params).id;
  if (!UUID.test(id)) notFound();
  let data: UnbilledData;
  try {
    data = await unbilledForProject(actor, id);
  } catch (error) {
    if (error instanceof NotFoundError) notFound();
    throw error;
  }
  const today = new Date().toISOString().slice(0, 10);
  const first = data.entries[0]?.workDate ?? addDays(today, -30);
  const last = data.entries[data.entries.length - 1]?.workDate ?? today;
  return (
    <div className="mx-auto max-w-4xl space-y-sp-16">
      <PageHeader
        title={`${t('s09Projects.bill.title')}: ${data.project.name}`}
        actions={
          <Link className="underline" href={`/projects/${id}`}>
            {t('s09Projects.bill.back')}
          </Link>
        }
      />
      {data.project.billingType === 'non_billable' || !data.project.clientId ? (
        <EmptyState title={t('s09Projects.bill.noClient')} />
      ) : (
        <BillForm
          projectId={id}
          billingType={data.project.billingType}
          entries={data.entries}
          milestones={data.milestones.map((m) => ({
            id: m.id,
            name: m.name,
            amount: m.amount as string,
          }))}
          expenses={data.expenses}
          retainerHint={{ from: first, to: last }}
        />
      )}
    </div>
  );
}
