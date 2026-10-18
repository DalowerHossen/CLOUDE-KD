// path: app/(dashboard)/disputes/[id]/page.tsx
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { DisputeActions } from '@/components/client/dispute-actions';
import { PageHeader } from '@/components/shared/page-header';
import { Alert } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { getService } from '@/lib/container';
import { t, type StringKey } from '@/lib/i18n';
import { requirePagePermission } from '@/services/base/page-guard';
import {
  getDispute,
  listDisputeEvents,
  listEvidence,
  type DisputeEventView,
  type DisputeView,
  type EvidenceView,
} from '@/services/dispute/disputes';
import { isClosed } from '@/services/dispute/status';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Dispute' };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function DisputePage({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<JSX.Element> {
  const { id } = await params;
  if (!UUID.test(id)) notFound();
  const actor = await requirePagePermission('dispute.read', 'tenant', 'dispute');
  const companyId = actor.companyId as string;
  let dispute: DisputeView;
  let evidence: EvidenceView[];
  let events: DisputeEventView[];
  try {
    dispute = await getDispute(companyId, id);
    [evidence, events] = await Promise.all([
      listEvidence(companyId, id),
      listDisputeEvents(companyId, id),
    ]);
  } catch {
    notFound();
  }
  const canManage = await getService('permissions').can(actor, 'dispute.manage', {
    type: 'dispute',
  });
  return (
    <div className="space-y-sp-16">
      <PageHeader
        title={t('s13Portal.disputes.stakeLine', {
          amount: dispute.amount,
          processor: dispute.processorId,
        })}
        description={t(`s13Portal.disputes.reasons.${dispute.reasonCategory}` as StringKey)}
        actions={
          <Badge variant="outline">
            {t(`s13Portal.disputes.statuses.${dispute.status}` as StringKey)}
          </Badge>
        }
      />
      <Card>
        <CardContent className="space-y-sp-8 pt-sp-16 text-sm">
          <p>
            {t('s13Portal.disputes.columns.due')}: {dispute.dueAt.slice(0, 16).replace('T', ' ')}{' '}
            UTC
            {dispute.dueEstimated ? ` (${t('s13Portal.disputes.estimated')})` : ''}
            {dispute.overdue ? ` - ${t('s13Portal.disputes.overdue')}` : ''}
          </p>
          {dispute.reasonCode ? <p>{dispute.reasonCode}</p> : null}
          {!isClosed(dispute.status) ? (
            <Alert>
              <span className="font-semibold">{t('s13Portal.disputes.hint')}: </span>
              {dispute.hint}
            </Alert>
          ) : null}
          {dispute.outcomeNote ? (
            <p className="text-muted-foreground">{dispute.outcomeNote}</p>
          ) : null}
        </CardContent>
      </Card>
      <DisputeActions
        id={dispute.id}
        next={dispute.next}
        closed={isClosed(dispute.status)}
        reasonCode={dispute.reasonCode ?? ''}
        canManage={canManage}
      />
      <Card>
        <CardHeader>
          <CardTitle>{t('s13Portal.disputes.evidenceTitle')}</CardTitle>
        </CardHeader>
        <CardContent>
          {evidence.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t('s13Portal.disputes.noEvidence')}</p>
          ) : (
            <ul className="space-y-sp-8 text-sm">
              {evidence.map((e) => (
                <li key={e.id}>
                  <p className="font-semibold">{e.title}</p>
                  {e.content ? <p className="whitespace-pre-line">{e.content}</p> : null}
                  <p className="text-caption text-muted-foreground">
                    {e.createdAt.replace('T', ' ').slice(0, 16)}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>{t('s13Portal.disputes.historyTitle')}</CardTitle>
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
