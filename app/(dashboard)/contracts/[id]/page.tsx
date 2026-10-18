// path: app/(dashboard)/contracts/[id]/page.tsx
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { ContractActions } from '@/components/client/contract-actions';
import { ContractForm } from '@/components/client/contract-form';
import { PageHeader } from '@/components/shared/page-header';
import { SafeHtml } from '@/components/shared/safe-html';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { getService } from '@/lib/container';
import { t, type StringKey } from '@/lib/i18n';
import { requirePagePermission } from '@/services/base/page-guard';
import {
  getContract,
  listClientOptions,
  listEvents,
  type ContractView,
  type EventView,
} from '@/services/contract/contracts';
import { listTemplates } from '@/services/contract/templates';
import { verifySignedContract, type SealCheck } from '@/services/esign/finalize';
import { Button } from '@/components/ui/button';
import { Alert } from '@/components/ui/alert';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Contract' };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function ContractPage({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<JSX.Element> {
  const { id } = await params;
  if (!UUID.test(id)) notFound();
  const actor = await requirePagePermission('contract.read', 'tenant', 'contract');
  const companyId = actor.companyId as string;
  let contract: ContractView;
  let events: EventView[];
  try {
    contract = await getContract(companyId, id);
    events = await listEvents(companyId, id);
  } catch {
    notFound();
  }
  let seal: SealCheck | null = null;
  if (contract.status === 'signed')
    seal = await verifySignedContract(companyId, id).catch(() => null);
  const canSend = await getService('permissions').can(actor, 'contract.send', { type: 'contract' });
  const canRequest = await getService('permissions').can(actor, 'contract.request_send', {
    type: 'contract',
  });
  const canEdit =
    contract.status === 'draft' &&
    (await getService('permissions').can(actor, 'contract.create', { type: 'contract' }));
  const [clients, templates] = canEdit
    ? await Promise.all([listClientOptions(companyId), listTemplates(companyId)])
    : [[], []];
  return (
    <div className="space-y-sp-16">
      <PageHeader
        title={`${contract.number} ${contract.title}`}
        description={contract.clientName}
        actions={
          <Badge variant="outline">
            {t(`s13Portal.contracts.statuses.${contract.status}` as StringKey)}
          </Badge>
        }
      />
      {seal ? (
        <div className="space-y-sp-8">
          <Alert variant={seal.ok ? 'success' : 'destructive'}>
            {seal.ok ? t('s13Portal.contracts.sealOk') : seal.reasons.join(' ')}
          </Alert>
          {seal.ok ? (
            <Button asChild variant="outline">
              <a href={`/api/contracts/${contract.id}/signed`}>
                {t('s13Portal.contracts.downloadSigned')}
              </a>
            </Button>
          ) : null}
        </div>
      ) : null}
      <ContractActions
        id={contract.id}
        status={contract.status}
        canSend={canSend}
        canRequest={canRequest}
        requested={contract.sendRequested}
        rejectedReason={contract.sendRejectedReason}
      />
      {canEdit ? (
        <ContractForm
          edit={{ id: contract.id, version: contract.version }}
          clients={clients}
          templates={templates}
          initial={{
            title: contract.title,
            clientId: contract.clientId ?? '',
            templateKey: contract.templateKey ?? '',
            bodyHtml: contract.bodyHtml,
            amount: contract.amount ?? '',
            effectiveOn: contract.effectiveOn ?? '',
            endsOn: contract.endsOn ?? '',
            signBy: contract.signBy ?? '',
            renewalNoticeDays: contract.renewalNoticeDays,
            signingOrder: contract.signingOrder,
            terms: contract.terms,
            signers: contract.signers.map((s) => ({
              name: s.name,
              email: s.email,
              roleLabel: s.roleLabel,
            })),
          }}
        />
      ) : (
        <Card>
          <CardHeader>
            <CardTitle>{t('s13Portal.contracts.wording')}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-sp-8">
            <SafeHtml html={contract.bodyHtml} className="prose max-w-none text-sm" />
            {contract.bodyHash ? (
              <p className="break-all text-caption text-muted-foreground">
                {t('s13Portal.contracts.hash', { value: contract.bodyHash })}
              </p>
            ) : null}
          </CardContent>
        </Card>
      )}
      <Card>
        <CardHeader>
          <CardTitle>{t('s13Portal.contracts.signers')}</CardTitle>
        </CardHeader>
        <CardContent>
          <ul className="space-y-1 text-sm">
            {contract.signers.map((s) => (
              <li key={s.id}>
                {s.position}. {s.name} ({s.email}) -{' '}
                {t(`s13Portal.contracts.signerStatuses.${s.status}` as StringKey)}
                {s.signedAt ? ` ${s.signedAt.slice(0, 10)}` : ''}
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>{t('s13Portal.contracts.history')}</CardTitle>
        </CardHeader>
        <CardContent>
          <ul className="space-y-1 text-sm">
            {events.map((e, index) => (
              <li key={`${index}-${e.at}`}>
                {e.at.replace('T', ' ').slice(0, 16)} - {e.kind}
                {e.detail ? ` (${e.detail})` : ''}
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}
