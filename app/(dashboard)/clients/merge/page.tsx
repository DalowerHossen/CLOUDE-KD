// path: app/(dashboard)/clients/merge/page.tsx
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { StepUpForm } from '@/app/(admin)/admin/account-locks/_components/step-up-form';
import { MergePanel } from '@/components/crm/merge-panel';
import { PageHeader } from '@/components/shared/page-header';
import { NotFoundError } from '@/lib/errors';
import { t } from '@/lib/i18n';
import { requirePagePermission } from '@/services/base/page-guard';
import { getClient } from '@/services/client/clients';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Merge clients' };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function MergePage({
  searchParams,
}: {
  searchParams: Promise<{ first?: string; second?: string }>;
}): Promise<JSX.Element> {
  const actor = await requirePagePermission('client.merge', 'tenant', 'client');
  const { first, second } = await searchParams;
  if (!first || !second || !UUID.test(first) || !UUID.test(second) || first === second) notFound();
  let pair: [Awaited<ReturnType<typeof getClient>>, Awaited<ReturnType<typeof getClient>>];
  try {
    pair = await Promise.all([
      getClient(actor.companyId as string, first),
      getClient(actor.companyId as string, second),
    ]);
  } catch (error) {
    if (error instanceof NotFoundError) notFound();
    throw error;
  }
  const [a, b] = pair;
  return (
    <div className="mx-auto max-w-3xl space-y-sp-16">
      <PageHeader
        title={t('s08Crm.merge.title')}
        description={t('s08Crm.merge.description')}
        actions={
          <Link className="underline" href="/clients/duplicates">
            {t('s08Crm.duplicate.pageTitle')}
          </Link>
        }
      />
      <StepUpForm />
      <MergePanel
        first={{ id: a.id, name: a.name, email: a.email }}
        second={{ id: b.id, name: b.name, email: b.email }}
      />
    </div>
  );
}
