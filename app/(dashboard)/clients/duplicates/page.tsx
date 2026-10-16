// path: app/(dashboard)/clients/duplicates/page.tsx
import type { Metadata } from 'next';
import Link from 'next/link';
import { PageHeader } from '@/components/shared/page-header';
import { EmptyState, ErrorState } from '@/components/shared/state-views';
import { t } from '@/lib/i18n';
import { requirePagePermission } from '@/services/base/page-guard';
import { duplicatePairs, type DuplicatePair } from '@/services/client/duplicates';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Possible duplicate clients' };

export default async function DuplicatesPage(): Promise<JSX.Element> {
  const actor = await requirePagePermission('client.merge', 'tenant', 'client');
  let pairs: DuplicatePair[] | null;
  try {
    pairs = await duplicatePairs(actor.companyId as string);
  } catch {
    pairs = null;
  }
  return (
    <div className="mx-auto max-w-3xl space-y-sp-16">
      <PageHeader
        title={t('s08Crm.duplicate.pageTitle')}
        description={t('s08Crm.duplicate.pageDescription')}
        actions={
          <Link className="underline" href="/clients">
            {t('s08Crm.clients.back')}
          </Link>
        }
      />
      {pairs === null ? (
        <ErrorState description={t('s08Crm.duplicate.loadError')} />
      ) : pairs.length === 0 ? (
        <EmptyState title={t('s08Crm.duplicate.none')} />
      ) : (
        <ul className="space-y-sp-8">
          {pairs.map((p) => (
            <li
              key={`${p.aId}-${p.bId}`}
              className="flex flex-wrap items-center justify-between gap-sp-8 rounded-lg border bg-card p-sp-12 text-sm"
            >
              <div className="min-w-0">
                <p className="font-medium">
                  <Link className="underline" href={`/clients/${p.aId}`}>
                    {p.aName}
                  </Link>{' '}
                  /{' '}
                  <Link className="underline" href={`/clients/${p.bId}`}>
                    {p.bName}
                  </Link>
                </p>
                <p className="text-muted-foreground">
                  {p.reason === 'email'
                    ? t('s08Crm.duplicate.reasonEmail')
                    : t('s08Crm.duplicate.reasonName')}
                </p>
              </div>
              <Link className="underline" href={`/clients/merge?first=${p.aId}&second=${p.bId}`}>
                {t('s08Crm.duplicate.merge')}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
