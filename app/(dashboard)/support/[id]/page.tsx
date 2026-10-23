// path: app/(dashboard)/support/[id]/page.tsx
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { PageHeader } from '@/components/shared/page-header';
import { Thread } from '@/components/support/thread';
import { TicketActions } from '@/components/support/ticket-actions';
import { Badge } from '@/components/ui/badge';
import { NotFoundError } from '@/lib/errors';
import { t, type StringKey } from '@/lib/i18n';
import { requirePagePermission } from '@/services/base/page-guard';
import { ownDetail, type TicketDetail } from '@/services/support/tickets';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Support ticket' };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function TicketPage({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<JSX.Element> {
  const actor = await requirePagePermission('support.read', 'tenant', 'support_ticket');
  const id = (await params).id;
  if (!UUID.test(id)) notFound();
  let ticket: TicketDetail;
  try {
    ticket = await ownDetail(actor, id);
  } catch (error) {
    if (error instanceof NotFoundError) notFound();
    throw error;
  }
  return (
    <div className="max-w-3xl space-y-sp-16">
      <PageHeader
        title={`${ticket.number}: ${ticket.subject}`}
        actions={
          <Link className="underline" href="/support">
            {t('s07Company.support.title')}
          </Link>
        }
      />
      <div className="flex flex-wrap items-center gap-sp-8 text-sm">
        <Badge variant="outline">
          {t(`s07Company.support.statuses.${ticket.status}` as StringKey)}
        </Badge>
        <span>
          {t(`s07Company.support.categories.${ticket.category as 'question'}` as StringKey)}
        </span>
        <span className="text-muted-foreground">
          {t('s07Company.support.firstAnswer')}:{' '}
          {ticket.firstResponseDueAt.replace('T', ' ').slice(0, 16)} UTC
        </span>
      </div>
      <Thread messages={ticket.messages} />
      <TicketActions id={ticket.id} status={ticket.status} rating={ticket.rating} />
    </div>
  );
}
