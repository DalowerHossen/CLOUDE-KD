// path: services/invoice/late-fees.ts
// Late fees. The owner sets the rule (percent or fixed, once or every 30 days, grace days, caps). A daily job proposes the
// fee of the latest period that is due (never earlier periods: there are no back-dated fees). A proposed fee waits for the
// owner, or is applied by itself when the owner chose that. Applying a fee writes a debit note (kind debit_note, no tax)
// for the invoice and sends it. Fees are worked out on the unpaid balance, never on earlier fees.
import 'server-only';
import { getService } from '@/lib/container';
import { ConflictError, InternalError, NotFoundError, ValidationError } from '@/lib/errors';
import { lateFeeAmount, periodsDue, type LateRule } from '@/lib/schedule/late-fees';
import { localDay } from '@/lib/schedule/recurrence';
import type { LateFeeSettingsInput } from '@/lib/schedule/input';
import { toInt } from '@/lib/reports/numbers';
import { Money } from '@/lib/utils/currency';
import { formatMoney } from '@/lib/utils/formatting';
import { getAdminSupabase } from '@/lib/supabase/admin';
import { getSection } from '@/services/company/settings';
import { createDebitNote } from '@/services/credit/adjustments';
import { logInvoiceEvent } from './events';
import { getInvoice } from './invoices';
import { sendInvoice, voidInvoice } from './send';
import type { Actor } from '@/types/contracts';

export interface LateFeeSettingsView extends LateFeeSettingsInput {
  version: number;
}

const DEFAULTS: LateFeeSettingsView = {
  enabled: false,
  kind: 'percent',
  value: '1.5',
  repeat: 'monthly',
  graceDays: 5,
  capPercent: '25',
  capAmount: null,
  autoApply: false,
  label: 'Late fee',
  version: 0,
};

function need(actor: Actor): string {
  if (!actor.companyId) throw new ValidationError('A company is needed.');
  return actor.companyId;
}

const nullable = (v: unknown): string | null =>
  v === null || v === undefined ? null : Money.parseRounded(String(v)).toDbString();

export async function getLateFeeSettings(companyId: string): Promise<LateFeeSettingsView> {
  const { data, error } = await getAdminSupabase()
    .from('late_fee_settings')
    .select(
      'enabled, kind, value, repeat, grace_days, cap_percent, cap_amount, auto_apply, label, version',
    )
    .eq('company_id', companyId)
    .is('deleted_at', null)
    .maybeSingle();
  if (error) throw new InternalError(error);
  if (!data) return DEFAULTS;
  return {
    enabled: data.enabled === true,
    kind: String(data.kind) as LateFeeSettingsView['kind'],
    value: Money.parseRounded(String(data.value)).toDbString(),
    repeat: String(data.repeat) as LateFeeSettingsView['repeat'],
    graceDays: toInt(data.grace_days),
    capPercent: nullable(data.cap_percent),
    capAmount: nullable(data.cap_amount),
    autoApply: data.auto_apply === true,
    label: String(data.label),
    version: toInt(data.version, 1),
  };
}

export async function saveLateFeeSettings(
  actor: Actor,
  input: LateFeeSettingsInput,
  expectedVersion: number,
): Promise<LateFeeSettingsView> {
  const companyId = need(actor);
  const columns = {
    enabled: input.enabled,
    kind: input.kind,
    value: Money.parse(input.value).toDbString(),
    repeat: input.repeat,
    grace_days: input.graceDays,
    cap_percent: input.capPercent === null ? null : Money.parse(input.capPercent).toDbString(),
    cap_amount: input.capAmount === null ? null : Money.parse(input.capAmount).toDbString(),
    auto_apply: input.autoApply,
    label: input.label,
    updated_by: actor.userId,
  };
  const admin = getAdminSupabase();
  if (expectedVersion === 0) {
    const r = await admin.from('late_fee_settings').insert({ company_id: companyId, ...columns });
    if (r.error) {
      if (r.error.code === '23505') throw new ConflictError();
      throw new InternalError(r.error);
    }
  } else {
    const r = await admin
      .from('late_fee_settings')
      .update({ ...columns, version: expectedVersion + 1 })
      .eq('company_id', companyId)
      .eq('version', expectedVersion)
      .is('deleted_at', null)
      .select('id');
    if (r.error) throw new InternalError(r.error);
    if (!r.data || r.data.length === 0) throw new ConflictError();
  }
  await getService('audit').record({
    action: 'latefees.settings_saved',
    resourceType: 'late_fee_settings',
    resourceId: companyId,
    companyId,
    metadata: { enabled: input.enabled, autoApply: input.autoApply, by: actor.userId },
  });
  return getLateFeeSettings(companyId);
}

export interface LateFeeView {
  id: string;
  invoiceId: string;
  invoiceNumber: string;
  periodKey: string;
  amount: string;
  status: 'proposed' | 'applied' | 'waived';
  debitNoteId: string | null;
  waivedReason: string;
  createdAt: string;
}

export async function listLateFees(
  companyId: string,
  filter: { invoiceId?: string; status?: LateFeeView['status']; limit: number },
): Promise<LateFeeView[]> {
  const admin = getAdminSupabase();
  let q = admin
    .from('late_fees')
    .select('id, invoice_id, period_key, amount, status, debit_note_id, waived_reason, created_at')
    .eq('company_id', companyId)
    .is('deleted_at', null);
  if (filter.invoiceId) q = q.eq('invoice_id', filter.invoiceId);
  if (filter.status) q = q.eq('status', filter.status);
  const { data, error } = await q.order('created_at', { ascending: false }).limit(filter.limit);
  if (error) throw new InternalError(error);
  const ids = [...new Set((data ?? []).map((r) => String(r.invoice_id)))];
  const numbers = new Map<string, string>();
  if (ids.length > 0) {
    const inv = await admin
      .from('invoices')
      .select('id, number')
      .eq('company_id', companyId)
      .in('id', ids);
    if (inv.error) throw new InternalError(inv.error);
    for (const i of inv.data ?? []) numbers.set(String(i.id), i.number ? String(i.number) : '');
  }
  return (data ?? []).map((r) => ({
    id: String(r.id),
    invoiceId: String(r.invoice_id),
    invoiceNumber: numbers.get(String(r.invoice_id)) ?? '',
    periodKey: String(r.period_key),
    amount: Money.parseRounded(String(r.amount)).toDbString(),
    status: String(r.status) as LateFeeView['status'],
    debitNoteId: r.debit_note_id ? String(r.debit_note_id) : null,
    waivedReason: String(r.waived_reason ?? ''),
    createdAt: String(r.created_at),
  }));
}

async function getFee(companyId: string, id: string): Promise<LateFeeView> {
  const rows = await listLateFees(companyId, { limit: 1000 });
  const fee = rows.find((r) => r.id === id);
  if (!fee) throw new NotFoundError();
  return fee;
}

/** Writes the debit note of a proposed fee and sends it; the fee becomes "applied". */
export async function applyLateFee(actor: Actor, id: string): Promise<LateFeeView> {
  const companyId = need(actor);
  const fee = await getFee(companyId, id);
  if (fee.status !== 'proposed') throw new ValidationError('This fee was already decided.');
  const settings = await getLateFeeSettings(companyId);
  const claim = await getAdminSupabase()
    .from('late_fees')
    .update({ status: 'applied', decided_by: actor.userId })
    .eq('id', id)
    .eq('company_id', companyId)
    .eq('status', 'proposed')
    .select('id');
  if (claim.error) throw new InternalError(claim.error);
  if (!claim.data || claim.data.length === 0) throw new ConflictError();
  try {
    const note = await createDebitNote(actor, fee.invoiceId, {
      reason: `${settings.label} for invoice ${fee.invoiceNumber}`,
      lines: [
        {
          productId: null,
          variantId: null,
          sku: '',
          description: `${settings.label} - invoice ${fee.invoiceNumber}`,
          hsCode: '',
          quantity: '1',
          unit: 'each',
          unitPrice: fee.amount,
          discountKind: 'none',
          discountValue: '0',
          taxExempt: true,
          taxCodes: [],
        },
      ],
    });
    await getAdminSupabase()
      .from('late_fees')
      .update({ debit_note_id: note.id })
      .eq('id', id)
      .eq('company_id', companyId);
    await sendInvoice(actor, note.id, { confirmDuplicate: true, message: '' });
    await logInvoiceEvent(
      companyId,
      fee.invoiceId,
      'late_fee',
      `Late fee ${fee.amount} applied`,
      actor.userId,
      { feeId: id },
    );
  } catch (error) {
    // Nothing was sent: the fee goes back to "proposed" so it can be tried again.
    const noteExists = await getAdminSupabase()
      .from('late_fees')
      .select('debit_note_id')
      .eq('id', id)
      .eq('company_id', companyId)
      .maybeSingle();
    if (!noteExists.data?.debit_note_id)
      await getAdminSupabase()
        .from('late_fees')
        .update({ status: 'proposed', decided_by: null })
        .eq('id', id)
        .eq('company_id', companyId);
    throw error;
  }
  await getService('audit').record({
    action: 'latefee.applied',
    resourceType: 'late_fee',
    resourceId: id,
    companyId,
    metadata: { invoiceId: fee.invoiceId, amount: fee.amount, by: actor.userId },
  });
  return getFee(companyId, id);
}

/** Waives a fee. A fee that was already applied has its debit note voided (if nobody paid it). */
export async function waiveLateFee(actor: Actor, id: string, reason: string): Promise<LateFeeView> {
  const companyId = need(actor);
  const fee = await getFee(companyId, id);
  if (fee.status === 'waived') throw new ValidationError('This fee was already waived.');
  if (fee.status === 'applied' && fee.debitNoteId)
    await voidInvoice(actor, fee.debitNoteId, `Late fee waived: ${reason}`);
  const r = await getAdminSupabase()
    .from('late_fees')
    .update({ status: 'waived', waived_reason: reason, decided_by: actor.userId })
    .eq('id', id)
    .eq('company_id', companyId)
    .neq('status', 'waived')
    .select('id');
  if (r.error) throw new InternalError(r.error);
  if (!r.data || r.data.length === 0) throw new ConflictError();
  await logInvoiceEvent(
    companyId,
    fee.invoiceId,
    'late_fee_waived',
    `Late fee ${fee.amount} waived`,
    actor.userId,
    { feeId: id },
  );
  await getService('audit').record({
    action: 'latefee.waived',
    resourceType: 'late_fee',
    resourceId: id,
    companyId,
    metadata: { reason, by: actor.userId },
  });
  return getFee(companyId, id);
}

const FEE_STATUSES = ['sent', 'viewed', 'partially_paid', 'overdue'];

function ruleOf(s: LateFeeSettingsView): LateRule {
  return {
    kind: s.kind,
    value: s.value,
    repeat: s.repeat,
    graceDays: s.graceDays,
    capPercent: s.capPercent,
    capAmount: s.capAmount,
  };
}

async function runCompany(
  companyId: string,
  settings: LateFeeSettingsView,
  createdBy: string | null,
  now: Date,
): Promise<number> {
  const admin = getAdminSupabase();
  const tz = (await getSection(companyId, 'profile').catch(() => null))?.value.timezone ?? 'UTC';
  const today = localDay(now, tz);
  const rule = ruleOf(settings);
  const { data, error } = await admin
    .from('invoices')
    .select('id')
    .eq('company_id', companyId)
    .eq('kind', 'invoice')
    .in('status', FEE_STATUSES)
    .is('deleted_at', null)
    .lt('due_date', today)
    .limit(500);
  if (error) throw new InternalError(error);
  let proposed = 0;
  for (const row of data ?? []) {
    const invoice = await getInvoice(companyId, String(row.id));
    const due = periodsDue(invoice.dueDate, today, rule);
    const latest = due[due.length - 1];
    if (!latest) continue;
    const existing = await admin
      .from('late_fees')
      .select('period_key, amount, status')
      .eq('company_id', companyId)
      .eq('invoice_id', invoice.id)
      .is('deleted_at', null);
    if (existing.error) throw new InternalError(existing.error);
    if ((existing.data ?? []).some((f) => String(f.period_key) === latest)) continue;
    const already = (existing.data ?? [])
      .filter((f) => f.status !== 'waived')
      .reduce((s, f) => s.add(String(f.amount)), Money.zero());
    const amount = lateFeeAmount(
      rule,
      Money.parse(invoice.balance),
      Money.parse(invoice.totals.total),
      already,
    );
    if (!amount.isPositive()) continue;
    const ins = await admin
      .from('late_fees')
      .insert({
        company_id: companyId,
        invoice_id: invoice.id,
        period_key: latest,
        amount: amount.toDbString(),
      })
      .select('id')
      .single();
    if (ins.error) {
      if (ins.error.code === '23505') continue;
      throw new InternalError(ins.error);
    }
    proposed += 1;
    await logInvoiceEvent(
      companyId,
      invoice.id,
      'late_fee_proposed',
      `Late fee of ${amount.toDbString()} proposed`,
      null,
    );
    if (settings.autoApply && createdBy) {
      await applyLateFee(
        {
          userId: createdBy,
          role: 'owner',
          subRole: null,
          companyId,
          email: '',
          sessionId: 'late-fees',
          impersonatedBy: null,
          authenticatedAt: now.toISOString(),
          lastStepUpAt: null,
          mfaVerified: true,
        },
        String(ins.data.id),
      ).catch(() => undefined);
    } else {
      await getService('notification')
        .notify({
          companyId,
          type: 'invoice.late_fee_proposed',
          title: 'A late fee is waiting for your decision',
          body: `A late fee of ${formatMoney(amount)} is proposed for invoice ${invoice.number ?? ''}.`,
          href: '/invoices/late-fees',
        })
        .catch(() => undefined);
    }
  }
  return proposed;
}

/** Job (daily): proposes the late fees that are due. */
export async function runLateFees(now: Date = new Date()): Promise<number> {
  const { data, error } = await getAdminSupabase()
    .from('late_fee_settings')
    .select('company_id, updated_by')
    .eq('enabled', true)
    .is('deleted_at', null)
    .limit(1000);
  if (error) throw new InternalError(error);
  let total = 0;
  for (const row of data ?? []) {
    const companyId = String(row.company_id);
    const company = await getAdminSupabase()
      .from('companies')
      .select('status')
      .eq('id', companyId)
      .maybeSingle();
    if (company.error || !company.data || company.data.status !== 'active') continue;
    const settings = await getLateFeeSettings(companyId);
    if (!settings.enabled) continue;
    try {
      total += await runCompany(
        companyId,
        settings,
        row.updated_by ? String(row.updated_by) : null,
        now,
      );
    } catch {
      continue;
    }
  }
  return total;
}
