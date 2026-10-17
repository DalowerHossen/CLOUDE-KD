// path: services/invoice/numbering.ts
// Gap-free invoice numbers. The number is taken by one database function in the same transaction that writes it on
// the invoice (advisory lock per company and series), so a failure never leaves a hole and parallel requests never
// share a number. Format, prefix and start come from the company's invoice settings (STEP 07).
import 'server-only';
import { getService } from '@/lib/container';
import { DuplicateError, InternalError, NotFoundError, ValidationError } from '@/lib/errors';
import { FIXED_PREFIX, SERIES, formatNumber } from '@/lib/invoice/numbering';
import type { InvoiceKind } from '@/lib/invoice/input';
import { toInt } from '@/lib/reports/numbers';
import { getSection } from '@/services/company/settings';
import { getAdminSupabase } from '@/lib/supabase/admin';
import type { Actor } from '@/types/contracts';

async function rules(companyId: string, kind: InvoiceKind) {
  const s = (await getSection(companyId, 'invoice')).value;
  return {
    prefix: kind === 'invoice' ? s.invoicePrefix : FIXED_PREFIX[kind],
    yearly: s.numbering === 'yearly',
    padding: s.padding,
    start: s.nextNumber,
  };
}

/** Gives the invoice its number now (when it is sent or approved). Returns the number. */
export async function assignInvoiceNumber(
  companyId: string,
  invoiceId: string,
  kind: InvoiceKind,
  manual: string | null = null,
): Promise<string> {
  const r = await rules(companyId, kind);
  const { data, error } = await getAdminSupabase().rpc('kd_invoice_assign_number', {
    p_company: companyId,
    p_invoice: invoiceId,
    p_prefix: r.prefix,
    p_yearly: r.yearly,
    p_padding: r.padding,
    p_start: r.start,
    p_year: new Date().getUTCFullYear(),
    p_manual: manual,
  });
  if (error) {
    if (error.code === '23505') throw new DuplicateError('This invoice number is already used.');
    if (error.code === '22023') throw new ValidationError('This invoice cannot be numbered now.');
    throw new InternalError(error);
  }
  return String(data);
}

/** Owner-only: types a number on a draft by hand. It must be unique among the company's documents of that kind. */
export async function setManualNumber(
  actor: Actor,
  invoiceId: string,
  number: string,
): Promise<string> {
  if (!actor.companyId) throw new ValidationError('A company is needed.');
  if (actor.role !== 'owner')
    throw new ValidationError('Only the owner can type an invoice number.');
  const companyId = actor.companyId;
  const { data, error } = await getAdminSupabase()
    .from('invoices')
    .select('kind, status, number')
    .eq('id', invoiceId)
    .eq('company_id', companyId)
    .is('deleted_at', null)
    .maybeSingle();
  if (error) throw new InternalError(error);
  if (!data) throw new NotFoundError();
  if (data.status !== 'draft') throw new ValidationError('A number can be typed only on a draft.');
  if (data.number) throw new ValidationError('This draft already has a number.');
  const result = await assignInvoiceNumber(companyId, invoiceId, data.kind as InvoiceKind, number);
  await getService('audit').record({
    action: 'invoice.number_typed',
    resourceType: 'invoice',
    resourceId: invoiceId,
    companyId,
    metadata: { number: result, by: actor.userId },
  });
  return result;
}

/** The number the next invoice of this kind would get, for the settings and form screens. */
export async function previewNextNumber(companyId: string, kind: InvoiceKind): Promise<string> {
  const r = await rules(companyId, kind);
  const year = new Date().getUTCFullYear();
  const { data, error } = await getAdminSupabase().rpc('kd_peek_doc_number', {
    p_company: companyId,
    p_series: SERIES[kind],
    p_year: r.yearly ? year : 0,
    p_start: r.start,
  });
  if (error) throw new InternalError(error);
  return formatNumber(r.prefix, r.yearly, year, toInt(data, 1), r.padding);
}
