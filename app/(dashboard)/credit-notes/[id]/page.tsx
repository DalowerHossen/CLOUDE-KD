// path: app/(dashboard)/credit-notes/[id]/page.tsx
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { CreditActions } from '@/components/credit/credit-actions';
import { PageHeader } from '@/components/shared/page-header';
import { Badge } from '@/components/ui/badge';
import { getService } from '@/lib/container';
import { NotFoundError } from '@/lib/errors';
import { t, type StringKey } from '@/lib/i18n';
import { Money } from '@/lib/utils/currency';
import { formatMoney } from '@/lib/utils/formatting';
import { requirePagePermission } from '@/services/base/page-guard';
import {
  getCreditNote,
  listApplications,
  type CreditNoteView,
} from '@/services/credit/credit-notes';
import { getInvoice } from '@/services/invoice/invoices';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Credit note' };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const money = (v: string): string => formatMoney(Money.parse(v));

export default async function CreditNotePage({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<JSX.Element> {
  const actor = await requirePagePermission('credit.read', 'tenant', 'credit_note');
  const id = (await params).id;
  if (!UUID.test(id)) notFound();
  const companyId = actor.companyId as string;
  let credit: CreditNoteView;
  try {
    credit = await getCreditNote(companyId, id);
  } catch (error) {
    if (error instanceof NotFoundError) notFound();
    throw error;
  }
  const perms = getService('permissions');
  const res = { type: 'credit_note' } as const;
  const [canIssue, canVoid, canCreate, applications, invoice] = await Promise.all([
    perms.can(actor, 'credit.issue', res),
    perms.can(actor, 'credit.void', res),
    perms.can(actor, 'credit.create', res),
    listApplications(companyId, { sourceId: id }),
    getInvoice(companyId, credit.invoiceId, { includeTrashed: true }),
  ]);
  return (
    <div className="mx-auto max-w-4xl space-y-sp-16">
      <PageHeader
        title={
          credit.number
            ? t('s09Credits.detailTitle', { number: credit.number })
            : t('s09Credits.draftTitle')
        }
        actions={
          <Link className="underline print:hidden" href="/credit-notes">
            {t('s09Credits.back')}
          </Link>
        }
      />
      <div className="flex flex-wrap items-center gap-sp-12 text-sm">
        <Badge variant="outline">{t(`s09Credits.statuses.${credit.status}` as StringKey)}</Badge>
        <span>{t(`s09Credits.reasons.${credit.reason}` as StringKey)}</span>
        <span>
          {t('s09Credits.forInvoice')}:{' '}
          <Link className="underline" href={`/invoices/${invoice.id}`}>
            {invoice.number ?? t('s09Invoicing.invoices.draftNumber')}
          </Link>
        </span>
        <span>
          {t('s09Credits.totals.total')}: <strong>{money(credit.total)}</strong>
        </span>
        <span>
          {t('s09Credits.totals.applied')}: {money(credit.appliedAmount)}
        </span>
        <span>
          {t('s09Credits.totals.left')}: <strong>{money(credit.balance)}</strong>
        </span>
      </div>
      {credit.reasonNote ? <p className="text-sm">{credit.reasonNote}</p> : null}
      <CreditActions
        id={credit.id}
        status={credit.status}
        canIssue={canIssue}
        canVoid={canVoid}
        canCreate={canCreate}
        applied={Money.parse(credit.appliedAmount).isPositive()}
      />
      <table className="w-full text-sm">
        <caption className="sr-only">{t('s09Credits.title')}</caption>
        <thead>
          <tr className="border-b text-left">
            <th scope="col" className="py-sp-4">
              {t('s09Credits.lines.description')}
            </th>
            <th scope="col" className="text-right">
              {t('s09Credits.lines.quantity')}
            </th>
            <th scope="col" className="text-right">
              {t('s09Credits.lines.unitPrice')}
            </th>
            <th scope="col" className="text-right">
              {t('s09Credits.lines.total')}
            </th>
          </tr>
        </thead>
        <tbody>
          {credit.lines.map((l) => (
            <tr key={l.position} className="border-b">
              <td className="py-sp-4">{l.description}</td>
              <td className="text-right">{l.quantity}</td>
              <td className="text-right">{money(l.unitPrice)}</td>
              <td className="text-right">{money(l.total)}</td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr>
            <td colSpan={3} className="py-sp-4 text-right">
              {t('s09Credits.totals.subtotal')}
            </td>
            <td className="text-right">{money(credit.subtotal)}</td>
          </tr>
          <tr>
            <td colSpan={3} className="text-right">
              {t('s09Credits.totals.tax')}
            </td>
            <td className="text-right">{money(credit.taxTotal)}</td>
          </tr>
          <tr className="font-semibold">
            <td colSpan={3} className="text-right">
              {t('s09Credits.totals.total')}
            </td>
            <td className="text-right">{money(credit.total)}</td>
          </tr>
        </tfoot>
      </table>
      {applications.length > 0 ? (
        <ul className="list-disc pl-sp-16 text-sm">
          {applications.map((a) => (
            <li key={a.id}>
              <Link className="underline" href={`/invoices/${a.invoiceId}`}>
                {money(a.amount)}
              </Link>{' '}
              <time dateTime={a.createdAt}>{a.createdAt.slice(0, 10)}</time>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
