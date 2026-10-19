// path: services/payout/methods.ts
// Payout methods: where a company is paid. The account details are encrypted (purpose `pii`, scope the company); the
// owner sees only a short hint such as "ending 1234". Adding, changing or removing a method needs a fresh sign-in
// confirmation.
import 'server-only';
import { z } from 'zod';
import { PAYOUT_STEP_UP_SECONDS } from '@/config/s14-payouts';
import { getService } from '@/lib/container';
import { ConflictError, ForbiddenError, InternalError, NotFoundError, ValidationError } from '@/lib/errors';
import { getAdminSupabase } from '@/lib/supabase/admin';
import type { Actor, EncryptedPayload } from '@/types/contracts';

export const MAX_METHODS = 5;

const plain = (min: number, max: number): z.ZodEffects<z.ZodString, string, string> =>
  z
    .string()
    .trim()
    .min(min)
    .max(max)
    .refine((v) => !/[<>]/.test(v), { message: 'Angle brackets are not allowed.' });

export const methodInput = z
  .object({
    kind: z.enum(['bank_transfer', 'wire', 'partner_payout']),
    label: plain(1, 80),
    country: z.string().regex(/^[A-Z]{2}$/, 'Use a two-letter country code.').nullable().optional(),
    currency: z.string().regex(/^[A-Z]{3}$/, 'Use a three-letter currency code.').default('USD'),
    holderName: plain(2, 120),
    accountNumber: z.string().trim().regex(/^[A-Za-z0-9 -]{4,40}$/, 'Enter the account number or IBAN.'),
    bankName: plain(2, 120),
    routingCode: z.string().trim().regex(/^[A-Za-z0-9 -]{0,40}$/, 'Enter a valid routing code.').optional(),
    swiftCode: z.string().trim().regex(/^([A-Za-z0-9]{8}|[A-Za-z0-9]{11})?$/, 'A SWIFT code has 8 or 11 characters.').optional(),
  })
  .strict();
export type MethodInput = z.infer<typeof methodInput>;

export interface MethodView {
  id: string;
  partner: string;
  kind: 'bank_transfer' | 'wire' | 'partner_payout';
  label: string;
  country: string | null;
  currency: string;
  hint: string;
  status: 'active' | 'disabled';
  isDefault: boolean;
  createdAt: string;
}

const COLUMNS = 'id, company_id, partner, kind, label, country, currency, hint, status, is_default, created_at, version';

interface Row {
  id: string;
  company_id: string;
  partner: string;
  kind: MethodView['kind'];
  label: string;
  country: string | null;
  currency: string;
  hint: string;
  status: MethodView['status'];
  is_default: boolean;
  created_at: string;
  version: number;
}

const view = (r: Row): MethodView => ({
  id: r.id,
  partner: r.partner,
  kind: r.kind,
  label: r.label,
  country: r.country,
  currency: r.currency,
  hint: r.hint,
  status: r.status,
  isDefault: r.is_default,
  createdAt: r.created_at,
});

async function guard(actor: Actor): Promise<string> {
  const companyId = actor.companyId;
  if (!companyId) throw new ForbiddenError();
  if (!(await getService('permissions').can(actor, 'payout.method.manage', { type: 'payout_method', id: null })))
    throw new ForbiddenError();
  await getService('auth').requireStepUp(actor, { maxAgeSeconds: PAYOUT_STEP_UP_SECONDS });
  return companyId;
}

export async function listMethods(companyId: string): Promise<MethodView[]> {
  const { data, error } = await getAdminSupabase()
    .from('payout_methods')
    .select(COLUMNS)
    .eq('company_id', companyId)
    .is('deleted_at', null)
    .order('created_at');
  if (error) throw new InternalError(error);
  return ((data ?? []) as Row[]).map(view);
}

async function rowOf(companyId: string, methodId: string): Promise<Row> {
  const { data, error } = await getAdminSupabase()
    .from('payout_methods')
    .select(COLUMNS)
    .eq('company_id', companyId)
    .eq('id', methodId)
    .is('deleted_at', null)
    .maybeSingle();
  if (error) throw new InternalError(error);
  if (!data) throw new NotFoundError();
  return data as Row;
}

export async function getMethod(companyId: string, methodId: string): Promise<MethodView> {
  return view(await rowOf(companyId, methodId));
}

export async function addMethod(actor: Actor, input: unknown): Promise<MethodView> {
  const companyId = await guard(actor);
  const parsed = methodInput.safeParse(input);
  if (!parsed.success) throw new ValidationError(parsed.error.issues[0]?.message ?? 'The details are not valid.');
  const d = parsed.data;
  if (d.currency !== 'USD') {
    try {
      await getService('fx').rateAt(d.currency, new Date());
    } catch {
      throw new ValidationError('This currency is not available for payouts yet.');
    }
  }
  const existing = await listMethods(companyId);
  if (existing.length >= MAX_METHODS) throw new ValidationError(`You can keep up to ${MAX_METHODS} payout methods.`);
  const payload = await getService('encryption').encrypt(
    'pii',
    JSON.stringify({
      holderName: d.holderName,
      accountNumber: d.accountNumber,
      bankName: d.bankName,
      routingCode: d.routingCode ?? '',
      swiftCode: d.swiftCode ?? '',
    }),
    companyId,
  );
  const digits = d.accountNumber.replace(/[^A-Za-z0-9]/g, '');
  const { data, error } = await getAdminSupabase()
    .from('payout_methods')
    .insert({
      company_id: companyId,
      kind: d.kind,
      label: d.label,
      country: d.country ?? null,
      currency: d.currency,
      hint: `ending ${digits.slice(-4)}`,
      details_encrypted: payload,
      is_default: existing.length === 0,
      created_by: actor.userId,
    })
    .select(COLUMNS)
    .single();
  if (error) throw new InternalError(error);
  await getService('audit').record({
    action: 'payout.method_added',
    resourceType: 'payout_method',
    resourceId: String(data.id),
    companyId,
    metadata: { kind: d.kind, currency: d.currency },
  });
  return view(data as Row);
}

export async function setDefaultMethod(actor: Actor, methodId: string): Promise<void> {
  const companyId = await guard(actor);
  const row = await rowOf(companyId, methodId);
  if (row.status !== 'active') throw new ValidationError('A disabled method cannot be the default.');
  const admin = getAdminSupabase();
  // The unique index allows one default: clear the old one first, then set the new one.
  const cleared = await admin
    .from('payout_methods')
    .update({ is_default: false })
    .eq('company_id', companyId)
    .eq('is_default', true)
    .is('deleted_at', null);
  if (cleared.error) throw new InternalError(cleared.error);
  const set = await admin.from('payout_methods').update({ is_default: true }).eq('id', methodId).eq('company_id', companyId);
  if (set.error) throw new InternalError(set.error);
  await getService('audit').record({
    action: 'payout.method_default_set',
    resourceType: 'payout_method',
    resourceId: methodId,
    companyId,
    metadata: {},
  });
}

/** Removes a method. A method with a payout on its way, or used by the schedule, stays. */
export async function removeMethod(actor: Actor, methodId: string): Promise<void> {
  const companyId = await guard(actor);
  const row = await rowOf(companyId, methodId);
  const admin = getAdminSupabase();
  const open = await admin
    .from('payouts')
    .select('id', { count: 'exact', head: true })
    .eq('method_id', methodId)
    .in('status', ['requested', 'pending_approval', 'approved', 'processing'])
    .is('deleted_at', null);
  if (open.error) throw new InternalError(open.error);
  if ((open.count ?? 0) > 0) throw new ConflictError('A payout to this method is still on its way.');
  const scheduled = await admin
    .from('payout_schedules')
    .select('id', { count: 'exact', head: true })
    .eq('method_id', methodId)
    .is('deleted_at', null);
  if (scheduled.error) throw new InternalError(scheduled.error);
  if ((scheduled.count ?? 0) > 0) throw new ConflictError('The payout schedule uses this method. Change the schedule first.');
  const { error } = await admin
    .from('payout_methods')
    .update({ deleted_at: new Date().toISOString(), is_default: false, status: 'disabled' })
    .eq('id', methodId)
    .eq('company_id', companyId);
  if (error) throw new InternalError(error);
  await getService('audit').record({
    action: 'payout.method_removed',
    resourceType: 'payout_method',
    resourceId: row.id,
    companyId,
    metadata: {},
  });
}

/** The account details for the partner (server side only). Never returned to a page. */
export async function readMethodDetails(
  companyId: string,
  methodId: string,
): Promise<{ holderName: string; accountNumber: string; bankName: string; routingCode: string; swiftCode: string }> {
  const { data, error } = await getAdminSupabase()
    .from('payout_methods')
    .select('details_encrypted')
    .eq('company_id', companyId)
    .eq('id', methodId)
    .maybeSingle();
  if (error) throw new InternalError(error);
  if (!data) throw new NotFoundError();
  const bytes = await getService('encryption').decrypt('pii', data.details_encrypted as EncryptedPayload, companyId);
  return JSON.parse(new TextDecoder().decode(bytes));
}
