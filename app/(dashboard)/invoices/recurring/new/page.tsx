// path: app/(dashboard)/invoices/recurring/new/page.tsx
import type { Metadata } from 'next';
import Link from 'next/link';
import { RecurringForm } from '@/components/invoice/recurring-form';
import { PageHeader } from '@/components/shared/page-header';
import { EmptyState } from '@/components/shared/state-views';
import { NotFoundError } from '@/lib/errors';
import { t } from '@/lib/i18n';
import { Money } from '@/lib/utils/currency';
import { formatMoney } from '@/lib/utils/formatting';
import { requirePagePermission } from '@/services/base/page-guard';
import { getInvoice, inputOf } from '@/services/invoice/invoices';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'New recurring invoice' };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function NewRecurringPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string }>;
}): Promise<JSX.Element> {
  const actor = await requirePagePermission('recurring.manage', 'tenant', 'recurring_schedule');
  const from = (await searchParams).from ?? '';
  const header = (
    <PageHeader
      title={t('s09Recurring.createTitle')}
      actions={
        <Link className="underline" href="/invoices/recurring">
          {t('s09Recurring.back')}
        </Link>
      }
    />
  );
  if (!UUID.test(from))
    return (
      <div className="space-y-sp-16">
        {header}
        <EmptyState title={t('s09Recurring.needSource')} />
      </div>
    );
  let source;
  try {
    source = await getInvoice(actor.companyId as string, from);
  } catch (error) {
    if (error instanceof NotFoundError)
      return (
        <div className="space-y-sp-16">
          {header}
          <EmptyState title={t('s09Recurring.needSource')} />
        </div>
      );
    throw error;
  }
  const today = new Date().toISOString().slice(0, 10);
  return (
    <div className="mx-auto max-w-3xl space-y-sp-16">
      {header}
      <RecurringForm
        scheduleId={null}
        version={0}
        template={{ ...inputOf(source), kind: 'invoice' }}
        summary={t('s09Recurring.form.templateLines', {
          count: String(source.lines.length),
          total: formatMoney(Money.parse(source.totals.total)),
        })}
        initial={{
          name: source.billTo.name || source.walkInName,
          unit: 'month',
          every: 1,
          monthEnd: false,
          startDate: today,
          endDate: null,
          maxOccurrences: null,
          autoSend: false,
          sendMessage: '',
        }}
        isOwner={actor.role === 'owner'}
        occurrencesDone={0}
        locked={false}
      />
    </div>
  );
}
