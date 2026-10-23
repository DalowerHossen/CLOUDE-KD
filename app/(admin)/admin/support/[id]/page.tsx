// path: app/(admin)/admin/support/[id]/page.tsx
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { PageHeader } from '@/components/shared/page-header';
import { Thread } from '@/components/support/thread';
import { Badge } from '@/components/ui/badge';
import { NotFoundError } from '@/lib/errors';
import { t, type StringKey } from '@/lib/i18n';
import { requirePagePermission } from '@/services/base/page-guard';
import { agentDetail, agents, type TicketDetail } from '@/services/support/tickets';
import { AgentPanel } from '../_components/agent-panel';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Support ticket' };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function AgentTicketPage({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<JSX.Element> {
  const actor = await requirePagePermission('support.agent', 'platform', 'support_ticket');
  const id = (await params).id;
  if (!UUID.test(id)) notFound();
  let ticket: TicketDetail;
  try {
    ticket = await agentDetail(actor, id);
  } catch (error) {
    if (error instanceof NotFoundError) notFound();
    throw error;
  }
  const team = await agents();
  return (
    <div className="max-w-4xl space-y-sp-16">
      <PageHeader
        title={`${ticket.number}: ${ticket.subject}`}
        actions={
          <Link className="underline" href="/admin/support">
            {t('s07Company.support.queueTitle')}
          </Link>
        }
      />
      <section className="grid gap-sp-8 rounded-lg border bg-card p-sp-16 text-sm sm:grid-cols-2">
        <p>
          <strong>{t('s07Company.support.company')}:</strong>{' '}
          <Link className="underline" href={`/admin/tenants/${ticket.companyId}`}>
            {ticket.companyName}
          </Link>
        </p>
        <p>
          <strong>{t('s07Company.support.status')}:</strong>{' '}
          <Badge variant="outline">
            {t(`s07Company.support.statuses.${ticket.status}` as StringKey)}
          </Badge>
        </p>
        <p>
          <strong>{t('s07Company.support.category')}:</strong>{' '}
          {t(`s07Company.support.categories.${ticket.category as 'question'}` as StringKey)}
        </p>
        <p>
          <strong>{t('s07Company.support.sla')}:</strong>{' '}
          {ticket.firstResponseDueAt.replace('T', ' ').slice(0, 16)} UTC
        </p>
        <p>
          <strong>{t('s07Company.support.assignee')}:</strong>{' '}
          {ticket.assigneeName || t('s07Company.support.nobody')}
        </p>
        {ticket.rating !== null ? (
          <p>
            <strong>{t('s07Company.support.customerRating')}:</strong> {ticket.rating} / 5
          </p>
        ) : null}
      </section>
      <Thread messages={ticket.messages} />
      <AgentPanel
        id={ticket.id}
        status={ticket.status}
        priority={ticket.priority}
        assigneeId={ticket.assigneeId}
        agents={team}
      />
    </div>
  );
}
