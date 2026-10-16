// path: services/purchase/statements.ts
// What the company owes its suppliers: payables aging for all suppliers and the statement of one supplier.
import 'server-only';
import { ageDocuments, AGING_BUCKETS, type AgingBucket } from '@/lib/crm/aging';
import { NotFoundError, InternalError } from '@/lib/errors';
import {
  buildStatement,
  type StatementEvent,
  type StatementLine,
} from '@/lib/procurement/statement';
import type { OpenDocument } from '@/lib/crm/hooks';
import { Money } from '@/lib/utils/currency';
import { getAdminSupabase } from '@/lib/supabase/admin';

type Row = Record<string, unknown>;
const OPEN = ['open', 'partial'];

export interface AgingRow {
  supplierId: string;
  supplierName: string;
  buckets: Record<AgingBucket, string>;
  total: string;
}

export async function payablesAging(
  companyId: string,
  asOf: string,
): Promise<{ rows: AgingRow[]; totals: Record<AgingBucket | 'total', string> }> {
  const admin = getAdminSupabase();
  const { data, error } = await admin
    .from('supplier_bills')
    .select('number, supplier_id, bill_date, due_date, total, paid_total')
    .eq('company_id', companyId)
    .in('status', OPEN)
    .is('deleted_at', null)
    .limit(5000);
  if (error) throw new InternalError(error);
  const bySupplier = new Map<string, Row[]>();
  for (const r of data ?? []) {
    const list = bySupplier.get(String(r.supplier_id)) ?? [];
    list.push(r);
    bySupplier.set(String(r.supplier_id), list);
  }
  const ids = [...bySupplier.keys()];
  const s = ids.length
    ? await admin.from('suppliers').select('id, name').in('id', ids)
    : { data: [] as Row[] };
  const names = new Map((s.data ?? []).map((x) => [String(x.id), String(x.name)]));
  const toDocs = (rows: Row[]): OpenDocument[] =>
    rows.map((r) => ({
      number: String(r.number),
      issuedOn: String(r.bill_date),
      dueOn: String(r.due_date),
      due: Money.parseRounded(String(r.total)).sub(Money.parseRounded(String(r.paid_total))),
    }));
  const rows: AgingRow[] = [...bySupplier.entries()]
    .map(([supplierId, list]) => {
      const aged = ageDocuments(toDocs(list), asOf);
      return {
        supplierId,
        supplierName: names.get(supplierId) ?? '',
        buckets: Object.fromEntries(AGING_BUCKETS.map((b) => [b, aged[b].toDbString()])) as Record<
          AgingBucket,
          string
        >,
        total: aged.total.toDbString(),
      };
    })
    .sort((a, b) => a.supplierName.localeCompare(b.supplierName));
  const all = ageDocuments(toDocs([...bySupplier.values()].flat()), asOf);
  return {
    rows,
    totals: {
      ...(Object.fromEntries(AGING_BUCKETS.map((b) => [b, all[b].toDbString()])) as Record<
        AgingBucket,
        string
      >),
      total: all.total.toDbString(),
    },
  };
}

export interface SupplierStatement {
  supplier: { id: string; name: string };
  from: string;
  to: string;
  opening: string;
  closing: string;
  lines: StatementLine[];
  aging: Record<AgingBucket | 'total', string>;
}

export async function supplierStatement(
  companyId: string,
  supplierId: string,
  range: { from: string; to: string },
): Promise<SupplierStatement> {
  const admin = getAdminSupabase();
  const s = await admin
    .from('suppliers')
    .select('id, name')
    .eq('id', supplierId)
    .eq('company_id', companyId)
    .is('deleted_at', null)
    .maybeSingle();
  if (s.error) throw new InternalError(s.error);
  if (!s.data) throw new NotFoundError();
  const [bills, rems] = await Promise.all([
    admin
      .from('supplier_bills')
      .select('number, bill_date, due_date, status, total, paid_total')
      .eq('company_id', companyId)
      .eq('supplier_id', supplierId)
      .in('status', ['open', 'partial', 'paid'])
      .is('deleted_at', null)
      .lte('bill_date', range.to)
      .limit(5000),
    admin
      .from('supplier_remittances')
      .select('number, paid_on, amount')
      .eq('company_id', companyId)
      .eq('supplier_id', supplierId)
      .eq('status', 'posted')
      .is('deleted_at', null)
      .lte('paid_on', range.to)
      .limit(5000),
  ]);
  if (bills.error) throw new InternalError(bills.error);
  if (rems.error) throw new InternalError(rems.error);
  let opening = Money.zero();
  const events: StatementEvent[] = [];
  for (const b of bills.data ?? []) {
    const amount = Money.parseRounded(String(b.total));
    if (String(b.bill_date) < range.from) opening = opening.add(amount);
    else
      events.push({
        on: String(b.bill_date),
        kind: 'bill',
        reference: String(b.number),
        amount: amount.toDbString(),
      });
  }
  for (const r of rems.data ?? []) {
    const amount = Money.parseRounded(String(r.amount));
    if (String(r.paid_on) < range.from) opening = opening.sub(amount);
    else
      events.push({
        on: String(r.paid_on),
        kind: 'remittance',
        reference: String(r.number),
        amount: amount.toDbString(),
      });
  }
  const built = buildStatement(opening.toDbString(), events);
  const openDocs = (bills.data ?? [])
    .filter((b) => b.status === 'open' || b.status === 'partial')
    .map((b) => ({
      number: String(b.number),
      issuedOn: String(b.bill_date),
      dueOn: String(b.due_date),
      due: Money.parseRounded(String(b.total)).sub(Money.parseRounded(String(b.paid_total))),
    }));
  const aged = ageDocuments(openDocs, range.to);
  return {
    supplier: { id: String(s.data.id), name: String(s.data.name) },
    from: range.from,
    to: range.to,
    opening: opening.toDbString(),
    closing: built.closing,
    lines: built.lines,
    aging: {
      ...(Object.fromEntries(AGING_BUCKETS.map((b) => [b, aged[b].toDbString()])) as Record<
        AgingBucket,
        string
      >),
      total: aged.total.toDbString(),
    },
  };
}
