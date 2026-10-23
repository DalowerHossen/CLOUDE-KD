// path: app/(dashboard)/bills/new/page.tsx
import type { Metadata } from 'next';
import { BillForm, type BillFormInitial } from '@/components/inventory/bill-form';
import { PageHeader } from '@/components/shared/page-header';
import { t } from '@/lib/i18n';
import { requirePagePermission } from '@/services/base/page-guard';
import { billDraftFromOrder } from '@/services/purchase/bills';
import { getOrder } from '@/services/purchase/orders';
import { searchSuppliers } from '@/services/supplier/suppliers';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'New supplier bill' };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function NewBillPage({
  searchParams,
}: {
  searchParams: Promise<{ order?: string; supplier?: string }>;
}): Promise<JSX.Element> {
  const actor = await requirePagePermission('bill.write', 'tenant', 'supplier_bill');
  const companyId = actor.companyId as string;
  const sp = await searchParams;
  const today = new Date().toISOString().slice(0, 10);
  let initial: BillFormInitial = {
    supplierId: UUID.test(sp.supplier ?? '') ? (sp.supplier as string) : '',
    purchaseOrderId: null,
    supplierInvoiceNo: '',
    billDate: today,
    dueDate: today,
    notes: '',
    lines: [],
  };
  if (sp.order && UUID.test(sp.order)) {
    const [draft, order] = await Promise.all([
      billDraftFromOrder(companyId, sp.order).catch(() => null),
      getOrder(companyId, sp.order).catch(() => null),
    ]);
    const names = new Map((order?.lines ?? []).map((l) => [l.id, l.productName]));
    if (draft)
      initial = {
        ...draft,
        lines: draft.lines.map((l) => ({ ...l, label: names.get(l.poLineId ?? '') ?? '' })),
      };
  }
  const suppliers = await searchSuppliers(companyId, { status: 'active' }).catch(() => ({
    rows: [],
    next: null,
  }));
  return (
    <div className="mx-auto max-w-4xl space-y-sp-16">
      <PageHeader title={t('s08Crm.bills.createTitle')} />
      <BillForm
        bill={null}
        initial={initial}
        suppliers={suppliers.rows.map((s) => ({ id: s.id, name: s.name }))}
      />
    </div>
  );
}
