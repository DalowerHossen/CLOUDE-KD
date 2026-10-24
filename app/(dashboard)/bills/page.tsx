// path: app/(dashboard)/bills/page.tsx
import type { Metadata } from 'next';
import Link from 'next/link';
import { DataTable, type DataColumn } from '@/components/shared/data-table';
import { PageHeader } from '@/components/shared/page-header';
import { EmptyState, ErrorState } from '@/components/shared/state-views';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { NativeSelect } from '@/components/ui/native-select';
import { getService } from '@/lib/container';
import { t, type StringKey } from '@/lib/i18n';
import { BILL_STATUSES, billListQuery } from '@/lib/procurement/bills';
import { Money } from '@/lib/utils/currency';
import { formatMoney } from '@/lib/utils/formatting';
import { requirePagePermission } from '@/services/base/page-guard';
import { listBills, type BillRow } from '@/services/purchase/bills';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Supplier bills' };

const columns: readonly DataColumn<BillRow>[] = [
  { key: 'number', header: t('s08Crm.bills.number'), primary: true, cell: (r) => r.number },
  { key: 'supplier', header: t('s08Crm.bills.supplier'), cell: (r) => r.supplierName },
  { key: 'due', header: t('s08Crm.bills.dueDate'), hideOnMobile: true, cell: (r) => r.dueDate },
  {
    key: 'status',
    header: t('s08Crm.bills.status'),
    cell: (r) => (
      <Badge variant="outline">{t(`s08Crm.bills.statuses.${r.status}` as StringKey)}</Badge>
    ),
  },
  { key: 'total', header: t('s08Crm.bills.total'), cell: (r) => formatMoney(Money.parse(r.total)) },
  {
    key: 'balance',
    header: t('s08Crm.bills.balance'),
    hideOnMobile: true,
    cell: (r) => formatMoney(Money.parse(r.balance)),
  },
  {
    key: 'open',
    header: '',
    cell: (r) => (
      <Link className="underline" href={`/bills/${r.id}`}>
        {t('s08Crm.bills.open')}
      </Link>
    ),
  },
];

export default async function BillsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}): Promise<JSX.Element> {
  const actor = await requirePagePermission('bill.read', 'tenant', 'supplier_bill');
  const raw = await searchParams;
  const flat = Object.fromEntries(
    Object.entries(raw).map(([k, v]) => [k, Array.isArray(v) ? v[0] : v]),
  );
  const parsed = billListQuery.safeParse(flat);
  const query = parsed.success ? parsed.data : billListQuery.parse({});
  let result: Awaited<ReturnType<typeof listBills>> | null;
  try {
    result = await listBills(actor.companyId as string, query);
  } catch {
    result = null;
  }
  const canWrite = await getService('permissions').can(actor, 'bill.write', {
    type: 'supplier_bill',
  });
  const base: Record<string, string> = {};
  if (query.status) base.status = query.status;
  if (query.supplierId) base.supplierId = query.supplierId;
  const nextHref = result?.next
    ? `/bills?${new URLSearchParams({ ...base, after: result.next }).toString()}`
    : null;
  return (
    <div className="space-y-sp-16">
      <PageHeader
        title={t('s08Crm.bills.title')}
        description={t('s08Crm.bills.description')}
        actions={
          <>
            <Link className="underline" href="/bills/aging">
              {t('s08Crm.bills.agingLink')}
            </Link>
            {canWrite ? (
              <Link className="underline" href="/bills/new">
                {t('s08Crm.bills.newBill')}
              </Link>
            ) : null}
          </>
        }
      />
      <form
        action="/bills"
        method="get"
        role="search"
        className="flex flex-wrap gap-sp-8 rounded-lg border bg-card p-sp-12 text-sm"
      >
        <NativeSelect
          name="status"
          defaultValue={query.status ?? ''}
          aria-label={t('s08Crm.bills.status')}
        >
          <option value="">{t('s08Crm.bills.allStates')}</option>
          {BILL_STATUSES.map((s) => (
            <option key={s} value={s}>
              {t(`s08Crm.bills.statuses.${s}` as StringKey)}
            </option>
          ))}
        </NativeSelect>
        <Button type="submit">{t('s08Crm.bills.apply')}</Button>
      </form>
      {result === null ? (
        <ErrorState description={t('s08Crm.bills.loadError')} />
      ) : (
        <>
          <DataTable
            columns={columns}
            rows={result.rows}
            getRowId={(r) => r.id}
            caption={t('s08Crm.bills.title')}
            empty={<EmptyState title={t('s08Crm.bills.empty')} />}
          />
          {nextHref ? (
            <p className="text-sm">
              <Link className="underline" href={nextHref}>
                {t('s08Crm.search.next')}
              </Link>
            </p>
          ) : null}
        </>
      )}
    </div>
  );
}
