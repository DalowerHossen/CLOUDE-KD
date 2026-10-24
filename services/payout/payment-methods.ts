// path: services/payout/payment-methods.ts
// Payment methods per country and per company. The platform team switches a method on for a country (with its order, fee
// and the words shown to the payer); the owner then chooses among the methods the platform switched on and the plan
// allows. The server checks every step, so a method that is off for the platform or not in the plan cannot be switched
// on by an owner. Owners never enter processor keys.
import 'server-only';
import { z } from 'zod';
import { PAYMENT_METHODS } from '@/config/payment-methods';
import { getService } from '@/lib/container';
import { ForbiddenError, InternalError, NotFoundError, ValidationError } from '@/lib/errors';
import { feeModelSchema, type FeeModel } from '@/lib/payment/fee-calculator';
import {
  planMethodLimit,
  resolveMethods,
  switchOnProblem,
  type CompanyRow,
  type PlatformRow,
  type ResolvedMethod,
} from '@/lib/payment/payment-methods';
import { getAdminSupabase } from '@/lib/supabase/admin';
import type { Actor } from '@/types/contracts';

const COLUMNS =
  'id, company_id, method_code, country, enabled, sort_order, fee_model, instructions, min_plan';

interface Row {
  id: string;
  company_id: string | null;
  method_code: string;
  country: string | null;
  enabled: boolean;
  sort_order: number | null;
  fee_model: unknown;
  instructions: string | null;
  min_plan: string | null;
}

const feeOrNull = (v: unknown): FeeModel | null => {
  const parsed = feeModelSchema.safeParse(v);
  return parsed.success ? parsed.data : null;
};

async function rows(companyId: string | null): Promise<Row[]> {
  let q = getAdminSupabase().from('payment_method_settings').select(COLUMNS).is('deleted_at', null);
  q = companyId ? q.eq('company_id', companyId) : q.is('company_id', null);
  const { data, error } = await q;
  if (error) throw new InternalError(error);
  return (data ?? []) as Row[];
}

export async function platformRows(): Promise<PlatformRow[]> {
  return (await rows(null)).map((r) => ({
    methodCode: r.method_code,
    country: r.country,
    enabled: r.enabled,
    sortOrder: r.sort_order,
    feeModel: feeOrNull(r.fee_model),
    instructions: r.instructions,
    minPlan: r.min_plan,
  }));
}

async function companyRows(companyId: string): Promise<CompanyRow[]> {
  return (await rows(companyId)).map((r) => ({
    methodCode: r.method_code,
    enabled: r.enabled,
    sortOrder: r.sort_order,
    instructions: r.instructions,
  }));
}

async function companyFacts(
  companyId: string,
): Promise<{ country: string | null; planKey: string }> {
  const { data, error } = await getAdminSupabase()
    .from('companies')
    .select('country_code, plan_key')
    .eq('id', companyId)
    .is('deleted_at', null)
    .maybeSingle();
  if (error) throw new InternalError(error);
  if (!data) throw new NotFoundError();
  return {
    country: data.country_code ? String(data.country_code).trim() : null,
    planKey: String(data.plan_key),
  };
}

export interface CompanyMethodsView {
  country: string | null;
  planKey: string;
  limit: number | null;
  enabledCount: number;
  methods: ResolvedMethod[];
}

/** What the owner sees: every method of the country, whether the platform and the plan allow it, and the owner's choice. */
export async function listForCompany(companyId: string): Promise<CompanyMethodsView> {
  const [facts, platform, mine] = await Promise.all([
    companyFacts(companyId),
    platformRows(),
    companyRows(companyId),
  ]);
  const methods = resolveMethods({
    country: facts.country,
    planKey: facts.planKey,
    platform,
    company: mine,
  });
  return {
    country: facts.country,
    planKey: facts.planKey,
    limit: planMethodLimit(facts.planKey),
    enabledCount: methods.filter((m) => m.enabled).length,
    methods,
  };
}

/** The methods a payer can choose at checkout, in order (only what is on for the platform, the plan and the owner). */
export async function checkoutMethods(
  companyId: string,
): Promise<Pick<ResolvedMethod, 'code' | 'label' | 'icon' | 'kind' | 'instructions'>[]> {
  const view = await listForCompany(companyId);
  return view.methods
    .filter((m) => m.enabled)
    .map(({ code, label, icon, kind, instructions }) => ({
      code,
      label,
      icon,
      kind,
      instructions,
    }));
}

export const companyChoiceInput = z
  .object({
    code: z.string().regex(/^[a-z][a-z0-9_]{1,40}$/),
    /** Left out when only the order or the words change. */
    enabled: z.boolean().optional(),
    sortOrder: z.number().int().min(0).max(1000).nullable().optional(),
    instructions: z
      .string()
      .trim()
      .max(500)
      .refine((v) => !/[<>]/.test(v), { message: 'Angle brackets are not allowed.' })
      .nullable()
      .optional(),
  })
  .strict();

/** The owner switches a method on or off, sets its order or its words. */
export async function saveCompanyChoice(actor: Actor, input: unknown): Promise<CompanyMethodsView> {
  const companyId = actor.companyId;
  if (!companyId) throw new ForbiddenError();
  if (
    !(await getService('permissions').can(actor, 'payment.methods.manage', {
      type: 'payment_method',
    }))
  )
    throw new ForbiddenError();
  const parsed = companyChoiceInput.safeParse(input);
  if (!parsed.success)
    throw new ValidationError(parsed.error.issues[0]?.message ?? 'The choice is not valid.');
  const d = parsed.data;
  const view = await listForCompany(companyId);
  if (d.enabled === true) {
    const problem = switchOnProblem(view.methods, d.code, view.planKey, view.limit);
    if (problem) throw new ValidationError(problem);
  } else if (!view.methods.some((m) => m.code === d.code)) {
    throw new NotFoundError();
  }
  const admin = getAdminSupabase();
  const existing = (await rows(companyId)).find((r) => r.method_code === d.code);
  const values = {
    enabled: d.enabled ?? existing?.enabled ?? false,
    sort_order: d.sortOrder ?? existing?.sort_order ?? null,
    instructions:
      d.instructions === undefined
        ? (existing?.instructions ?? null)
        : d.instructions === ''
          ? null
          : d.instructions,
    updated_by: actor.userId,
  };
  const written = existing
    ? await admin.from('payment_method_settings').update(values).eq('id', existing.id)
    : await admin
        .from('payment_method_settings')
        .insert({ ...values, company_id: companyId, method_code: d.code });
  if (written.error) throw new InternalError(written.error);
  await getService('audit').record({
    action: 'payment.method_choice_saved',
    resourceType: 'payment_method_settings',
    resourceId: existing?.id ?? null,
    companyId,
    metadata: { code: d.code, enabled: values.enabled },
  });
  return listForCompany(companyId);
}

export const platformMethodInput = z
  .object({
    code: z.string().regex(/^[a-z][a-z0-9_]{1,40}$/),
    country: z
      .string()
      .regex(/^[A-Z]{2}$/)
      .nullable()
      .default(null),
    enabled: z.boolean(),
    sortOrder: z.number().int().min(0).max(1000).nullable().optional(),
    feeModel: feeModelSchema.nullable().optional(),
    instructions: z
      .string()
      .trim()
      .max(500)
      .refine((v) => !/[<>]/.test(v), { message: 'Angle brackets are not allowed.' })
      .nullable()
      .optional(),
    minPlan: z.enum(['free', 'pro', 'business', 'enterprise']).nullable().optional(),
  })
  .strict();

/** The platform team switches a method on or off for a country (or every country of the catalogue), super admin only. */
export async function savePlatformMethod(actor: Actor, input: unknown): Promise<void> {
  if (actor.role !== 'super_admin') throw new ForbiddenError();
  const parsed = platformMethodInput.safeParse(input);
  if (!parsed.success)
    throw new ValidationError(parsed.error.issues[0]?.message ?? 'The setting is not valid.');
  const d = parsed.data;
  const def = PAYMENT_METHODS.find((m) => m.code === d.code);
  if (!def) throw new ValidationError('This payment method is not in the catalogue.');
  if (d.country && !def.countries.includes(d.country))
    throw new ValidationError('This method is not offered in that country.');
  const admin = getAdminSupabase();
  const existing = (await rows(null)).find(
    (r) => r.method_code === d.code && r.country === d.country,
  );
  const values = {
    enabled: d.enabled,
    sort_order: d.sortOrder ?? existing?.sort_order ?? null,
    fee_model: d.feeModel === undefined ? (existing?.fee_model ?? null) : d.feeModel,
    instructions:
      d.instructions === undefined
        ? (existing?.instructions ?? null)
        : d.instructions === ''
          ? null
          : d.instructions,
    min_plan: d.minPlan === undefined ? (existing?.min_plan ?? null) : d.minPlan,
    updated_by: actor.userId,
  };
  const written = existing
    ? await admin.from('payment_method_settings').update(values).eq('id', existing.id)
    : await admin
        .from('payment_method_settings')
        .insert({ ...values, company_id: null, method_code: d.code, country: d.country });
  if (written.error) throw new InternalError(written.error);
  await getService('audit').record({
    action: 'payment.method_platform_saved',
    resourceType: 'payment_method_settings',
    resourceId: existing?.id ?? null,
    companyId: null,
    metadata: { code: d.code, country: d.country, enabled: d.enabled },
  });
}
