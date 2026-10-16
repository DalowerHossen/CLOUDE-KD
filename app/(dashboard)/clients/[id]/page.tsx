// path: app/(dashboard)/clients/[id]/page.tsx
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ClientActions } from '@/components/crm/client-actions';
import { ClientForm } from '@/components/crm/client-form';
import { PageHeader } from '@/components/shared/page-header';
import { Badge } from '@/components/ui/badge';
import { getService } from '@/lib/container';
import { NotFoundError } from '@/lib/errors';
import { t } from '@/lib/i18n';
import { requirePagePermission } from '@/services/base/page-guard';
import { getClient, type ClientView } from '@/services/client/clients';
import { listDefs } from '@/services/client/custom-fields';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Client' };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function ClientPage({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<JSX.Element> {
  const actor = await requirePagePermission('client.read', 'tenant', 'client');
  const id = (await params).id;
  if (!UUID.test(id)) notFound();
  const companyId = actor.companyId as string;
  let client: ClientView;
  try {
    client = await getClient(companyId, id);
  } catch (error) {
    if (error instanceof NotFoundError) notFound();
    throw error;
  }
  const perms = getService('permissions');
  const [canUpdate, canArchive, canDelete, defs] = await Promise.all([
    perms.can(actor, 'client.update', { type: 'client' }),
    perms.can(actor, 'client.archive', { type: 'client' }),
    perms.can(actor, 'client.delete', { type: 'client' }),
    listDefs(companyId, 'client').catch(() => []),
  ]);
  return (
    <div className="mx-auto max-w-4xl space-y-sp-16">
      <PageHeader
        title={t('s08Crm.clients.detailTitle', { name: client.name })}
        actions={
          <Link className="underline" href="/clients">
            {t('s08Crm.clients.back')}
          </Link>
        }
      />
      <div className="flex flex-wrap items-center gap-sp-8">
        <Badge variant="outline">
          {client.status === 'active' ? t('s08Crm.clients.active') : t('s08Crm.clients.archived')}
        </Badge>
        <ClientActions
          id={client.id}
          status={client.status}
          canArchive={canArchive}
          canDelete={canDelete}
        />
      </div>
      {client.anonymized ? (
        <p className="rounded-md border bg-muted/40 p-sp-12 text-sm">
          {t('s08Crm.clients.anonymizedNote')}
        </p>
      ) : null}
      <ClientForm client={canUpdate ? client : { ...client, anonymized: true }} defs={defs} />
    </div>
  );
}
