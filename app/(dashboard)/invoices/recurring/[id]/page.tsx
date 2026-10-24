// path: app/(dashboard)/invoices/recurring/[id]/page.tsx
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { RecurringActions } from '@/components/invoice/recurring-actions';
import { RecurringForm } from '@/components/invoice/recurring-form';
import { PageHeader } from '@/components/shared/page-header';
import { Badge } from '@/components/ui/badge';
import { NotFoundError } from '@/lib/errors';
import { t, type StringKey } from '@/lib/i18n';
import { Money } from '@/lib/utils/currency';
import { formatMoney } from '@/lib/utils/formatting';
import { requirePagePermission } from '@/services/base/page-guard';
import { getSchedule, type ScheduleView } from '@/services/invoice/recurring';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Recurring invoice' };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function RecurringDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<JSX.Element> {
  const actor = await requirePagePermission('recurring.read', 'tenant', 'recurring_schedule');
  const id = (await params).id;
  if (!UUID.test(id)) notFound();
  let s: ScheduleView;
  try {
    s = await getSchedule(actor.companyId as string, id);
  } catch (error) {
    if (error instanceof NotFoundError) notFound();
    throw error;
  }
  const lineTotal = s.template.lines.reduce(
    (sum, l) => sum.add(Money.parse(l.unitPrice).mul(l.quantity)),
    Money.zero(),
  );
  return (
    <div className="mx-auto max-w-3xl space-y-sp-16">
      <PageHeader
        title={s.name}
        actions={
          <Link className="underline print:hidden" href="/invoices/recurring">
            {t('s09Recurring.back')}
          </Link>
        }
      />
      <div className="flex flex-wrap items-center gap-sp-12 text-sm">
        <Badge variant="outline">{t(`s09Recurring.statuses.${s.status}` as StringKey)}</Badge>
        <span>
          {t('s09Recurring.rule', {
            every: String(s.every),
            unit: t(`s09Recurring.units.${s.unit}` as StringKey),
          })}
        </span>
        <span>
          {t('s09Recurring.columns.runs')}: {s.occurrencesDone}
        </span>
        {s.lastRunOn ? (
          <span>{t('s09Recurring.detail.lastRun', { date: s.lastRunOn })}</span>
        ) : null}
        {s.lastInvoiceId ? (
          <Link className="underline" href={`/invoices/${s.lastInvoiceId}`}>
            {t('s09Recurring.detail.lastInvoice')}
          </Link>
        ) : null}
      </div>
      {s.status === 'paused' ? (
        <p role="alert" className="text-sm text-destructive">
          {t('s09Recurring.detail.paused')}
        </p>
      ) : null}
      {s.lastError ? (
        <p role="alert" className="text-sm text-destructive">
          {t('s09Recurring.detail.failures', { error: s.lastError })}
        </p>
      ) : null}
      <RecurringActions id={s.id} status={s.status} />
      {s.status !== 'ended' ? (
        <RecurringForm
          scheduleId={s.id}
          version={s.version}
          template={s.template}
          summary={t('s09Recurring.form.templateLines', {
            count: String(s.template.lines.length),
            total: formatMoney(lineTotal),
          })}
          initial={{
            name: s.name,
            unit: s.unit,
            every: s.every,
            monthEnd: s.monthEnd,
            startDate: s.startDate,
            endDate: s.endDate,
            maxOccurrences: s.maxOccurrences,
            autoSend: s.autoSend,
            sendMessage: s.sendMessage,
          }}
          isOwner={actor.role === 'owner'}
          occurrencesDone={s.occurrencesDone}
          locked={s.occurrencesDone > 0}
        />
      ) : null}
    </div>
  );
}
