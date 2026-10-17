// path: app/(dashboard)/invoices/[id]/page.tsx
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { InvoiceActions } from '@/components/invoice/invoice-actions';
import { InvoiceForm } from '@/components/invoice/invoice-form';
import { InvoiceCredits } from '@/components/credit/invoice-credits';
import { CollectionPanel } from '@/components/dunning/collection-panel';
import { InstallmentsPanel } from '@/components/invoice/installments-panel';
import { InvoiceHistory } from '@/components/invoice/invoice-history';
import { PageHeader } from '@/components/shared/page-header';
import { Badge } from '@/components/ui/badge';
import { getService } from '@/lib/container';
import { NotFoundError } from '@/lib/errors';
import { t, type StringKey } from '@/lib/i18n';
import { Money } from '@/lib/utils/currency';
import { formatMoney } from '@/lib/utils/formatting';
import { requirePagePermission } from '@/services/base/page-guard';
import { listInvoiceEvents } from '@/services/invoice/events';
import { loadFormData } from '@/services/invoice/form-data';
import {
  availableCredits,
  listApplications,
  listCreditNotes,
} from '@/services/credit/credit-notes';
import { listInstallments } from '@/services/invoice/installments';
import { listLateFees } from '@/services/invoice/late-fees';
import { listHolds, listReminderLog } from '@/services/invoice/reminders';
import { listWriteOffs } from '@/services/invoice/write-off';
import { getInvoice, inputOf, listRevisions, type InvoiceView } from '@/services/invoice/invoices';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Invoice' };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const money = (v: string): string => formatMoney(Money.parse(v));

export default async function InvoicePage({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<JSX.Element> {
  const actor = await requirePagePermission('invoice.read', 'tenant', 'invoice');
  const id = (await params).id;
  if (!UUID.test(id)) notFound();
  const companyId = actor.companyId as string;
  let invoice: InvoiceView;
  try {
    invoice = await getInvoice(companyId, id, { includeTrashed: true });
  } catch (error) {
    if (error instanceof NotFoundError) notFound();
    throw error;
  }
  const perms = getService('permissions');
  const [
    canCreate,
    canDelete,
    canUpdate,
    canSend,
    data,
    events,
    revisions,
    canCredit,
    canApply,
    canPlan,
    canRepeat,
    canRemind,
    canWriteOff,
  ] = await Promise.all([
    perms.can(actor, 'invoice.create', { type: 'invoice' }),
    perms.can(actor, 'invoice.delete', { type: 'invoice' }),
    perms.can(actor, 'invoice.update', { type: 'invoice' }),
    perms.can(actor, 'invoice.send', { type: 'invoice' }),
    loadFormData(companyId, new Date().toISOString().slice(0, 10)),
    listInvoiceEvents(companyId, id),
    listRevisions(companyId, id),
    perms.can(actor, 'credit.create', { type: 'credit_note' }),
    perms.can(actor, 'credit.apply', { type: 'invoice' }),
    perms.can(actor, 'installment.manage', { type: 'invoice' }),
    perms.can(actor, 'recurring.manage', { type: 'recurring_schedule' }),
    perms.can(actor, 'reminder.send', { type: 'invoice' }),
    perms.can(actor, 'invoice.writeoff', { type: 'invoice' }),
  ]);
  const isSentDoc =
    invoice.status !== 'draft' &&
    invoice.status !== 'pending_approval' &&
    invoice.status !== 'void';
  const [applied, available, previous] = isSentDoc
    ? await Promise.all([
        listApplications(companyId, { invoiceId: id }),
        availableCredits(companyId, id),
        listCreditNotes(companyId, { invoiceId: id, limit: 200 }),
      ])
    : [[], [], []];
  const open = ['sent', 'viewed', 'partially_paid', 'overdue', 'disputed'].includes(invoice.status);
  const [reminderLog, holds, writeOffs, fees] = isSentDoc
    ? await Promise.all([
        listReminderLog(companyId, id),
        listHolds(companyId, id),
        listWriteOffs(companyId, id),
        listLateFees(companyId, { invoiceId: id, limit: 50 }),
      ])
    : [[], [], [], []];
  const parts = isSentDoc ? await listInstallments(companyId, id) : [];
  const planOpen =
    (invoice.kind === 'invoice' || invoice.kind === 'debit_note') &&
    ['sent', 'viewed', 'partially_paid', 'overdue'].includes(invoice.status);
  const credited = new Map<number, Money>();
  for (const cn of previous)
    if (cn.status !== 'void')
      for (const l of cn.lines)
        credited.set(l.position, (credited.get(l.position) ?? Money.zero()).add(l.quantity));
  const trashed = invoice.deletedAt !== null;
  const editable = invoice.status === 'draft' && !trashed && canUpdate;
  const title = invoice.number
    ? t('s09Invoicing.invoices.detailTitle', { number: invoice.number })
    : t('s09Invoicing.invoices.draftTitle');
  const input = inputOf(invoice);
  return (
    <div className="mx-auto max-w-5xl space-y-sp-16">
      <PageHeader
        title={title}
        actions={
          <Link className="underline print:hidden" href="/invoices">
            {t('s09Invoicing.invoices.back')}
          </Link>
        }
      />
      <div className="flex flex-wrap items-center gap-sp-12 text-sm">
        <Badge variant="outline">
          {t(`s09Invoicing.invoices.statuses.${invoice.status}` as StringKey)}
        </Badge>
        <span>{t(`s09Invoicing.invoices.kinds.${invoice.kind}` as StringKey)}</span>
        <span>
          {t('s09Invoicing.invoices.total')}: <strong>{money(invoice.totals.total)}</strong>
        </span>
        <span>
          {t('s09Invoicing.invoices.paidSoFar')}: {money(invoice.amountPaid)}
        </span>
        <span>
          {t('s09Invoicing.invoices.balance')}: <strong>{money(invoice.balance)}</strong>
        </span>
        {invoice.reverseCharge ? <span>{t('s09Invoicing.invoices.reverseCharge')}</span> : null}
        {invoice.taxExempt ? <span>{t('s09Invoicing.invoices.exemptNote')}</span> : null}
      </div>
      {invoice.rejectedReason && invoice.status === 'draft' ? (
        <p role="alert" className="text-sm text-destructive">
          {t('s09Invoicing.invoices.rejected', { reason: invoice.rejectedReason })}
        </p>
      ) : null}
      <InvoiceActions
        id={invoice.id}
        status={invoice.status}
        kind={invoice.kind}
        amountPaid={invoice.amountPaid}
        trashed={trashed}
        hasNumber={invoice.number !== null}
        canCreate={canCreate}
        canDelete={canDelete}
        canSend={canSend}
        isOwner={actor.role === 'owner'}
      />
      <InvoiceForm
        invoice={invoice}
        readOnly={!editable}
        initial={input}
        rates={data.rates}
        fxRates={data.fxRates}
        defaultTaxCodes={data.defaultTaxCodes}
        clientName={invoice.billTo.name || invoice.walkInName}
      />
      {canRepeat && invoice.kind === 'invoice' && invoice.status !== 'void' && invoice.clientId ? (
        <p className="text-sm print:hidden">
          <Link className="underline" href={`/invoices/recurring/new?from=${invoice.id}`}>
            {t('s09Recurring.repeat')}
          </Link>{' '}
          <Link className="underline" href={`/invoices/batches/new?from=${invoice.id}`}>
            {t('s09Batches.create.link')}
          </Link>
        </p>
      ) : null}
      {isSentDoc && (planOpen || parts.length > 0) ? (
        <InstallmentsPanel
          invoiceId={invoice.id}
          parts={parts}
          canManage={canPlan}
          open={planOpen}
          today={new Date().toISOString().slice(0, 10)}
        />
      ) : null}
      {isSentDoc && (open || writeOffs.length > 0 || reminderLog.length > 0 || fees.length > 0) ? (
        <CollectionPanel
          invoiceId={invoice.id}
          balance={invoice.balance}
          canRemind={canRemind && open}
          canWriteOff={canWriteOff && open}
          log={reminderLog}
          holds={holds}
          writeOffs={writeOffs}
          fees={fees}
          today={new Date().toISOString().slice(0, 10)}
        />
      ) : null}
      {isSentDoc ? (
        <InvoiceCredits
          invoiceId={invoice.id}
          kind={invoice.kind}
          balance={invoice.balance}
          canCreate={canCredit}
          canApply={canApply}
          lines={invoice.lines
            .filter((l) => !Money.parse(l.quantity).isNegative())
            .map((l) => ({
              position: l.position,
              description: l.description,
              quantity: l.quantity,
              left: Money.parse(l.quantity)
                .sub(credited.get(l.position) ?? Money.zero())
                .toDbString(),
            }))}
          applied={applied}
          available={available}
        />
      ) : null}
      <InvoiceHistory
        id={invoice.id}
        version={invoice.version}
        events={events}
        revisions={revisions}
        current={input}
        canRestore={editable}
      />
    </div>
  );
}
