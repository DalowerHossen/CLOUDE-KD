// path: services/tax/rates.ts
// Tax rates of a company. A change never touches an invoice that already exists: invoices keep their own copy of the
// rates they were written with.
import { toInt } from '@/lib/reports/numbers';
import 'server-only';
import { getService } from '@/lib/container';
import {
  ConflictError,
  DuplicateError,
  InternalError,
  NotFoundError,
  ValidationError,
} from '@/lib/errors';
import { findTemplate } from '@/lib/tax/templates';
import type { TaxRateInput } from '@/lib/tax/input';
import { Money } from '@/lib/utils/currency';
import { getAdminSupabase } from '@/lib/supabase/admin';
import type { Actor } from '@/types/contracts';

export interface TaxRateView {
  id: string;
  code: string;
  name: string;
  rate: string;
  kind: TaxRateInput['kind'];
  country: string | null;
  region: string;
  compound: boolean;
  isActive: boolean;
  sortOrder: number;
  template: string;
  version: number;
}

const COLUMNS =
  'id, code, name, rate, kind, country, region, compound, is_active, sort_order, template, version';

function view(r: Record<string, unknown>): TaxRateView {
  return {
    id: String(r.id),
    code: String(r.code),
    name: String(r.name),
    rate: Money.parseRounded(String(r.rate)).toDbString(),
    kind: String(r.kind) as TaxRateView['kind'],
    country: r.country ? String(r.country) : null,
    region: String(r.region ?? ''),
    compound: r.compound === true,
    isActive: r.is_active === true,
    sortOrder: toInt(r.sort_order),
    template: String(r.template ?? ''),
    version: toInt(r.version, 1),
  };
}

function need(actor: Actor): string {
  if (!actor.companyId) throw new ValidationError('A company is needed.');
  return actor.companyId;
}

function columns(i: TaxRateInput): Record<string, unknown> {
  return {
    code: i.code,
    name: i.name,
    rate: i.rate,
    kind: i.kind,
    country: i.country,
    region: i.region,
    compound: i.compound,
    is_active: i.isActive,
    sort_order: i.sortOrder,
  };
}

export async function listRates(companyId: string, activeOnly = false): Promise<TaxRateView[]> {
  let q = getAdminSupabase()
    .from('tax_rates')
    .select(COLUMNS)
    .eq('company_id', companyId)
    .is('deleted_at', null)
    .order('sort_order')
    .order('code')
    .limit(500);
  if (activeOnly) q = q.eq('is_active', true);
  const { data, error } = await q;
  if (error) throw new InternalError(error);
  return (data ?? []).map((r) => view(r as unknown as Record<string, unknown>));
}

export async function createRate(actor: Actor, input: TaxRateInput): Promise<TaxRateView> {
  const companyId = need(actor);
  const { data, error } = await getAdminSupabase()
    .from('tax_rates')
    .insert({ company_id: companyId, created_by: actor.userId, ...columns(input) })
    .select(COLUMNS)
    .single();
  if (error) {
    if (error.code === '23505')
      throw new DuplicateError('A tax rate with this code already exists.');
    throw new InternalError(error);
  }
  await getService('audit').record({
    action: 'tax_rate.created',
    resourceType: 'tax_rate',
    resourceId: String(data.id),
    companyId,
    metadata: { code: input.code, rate: input.rate, by: actor.userId },
  });
  return view(data as unknown as Record<string, unknown>);
}

export async function updateRate(
  actor: Actor,
  id: string,
  expectedVersion: number,
  input: TaxRateInput,
): Promise<TaxRateView> {
  const companyId = need(actor);
  const { data, error } = await getAdminSupabase()
    .from('tax_rates')
    .update(columns(input))
    .eq('id', id)
    .eq('company_id', companyId)
    .eq('version', expectedVersion)
    .is('deleted_at', null)
    .select(COLUMNS);
  if (error) {
    if (error.code === '23505')
      throw new DuplicateError('A tax rate with this code already exists.');
    throw new InternalError(error);
  }
  if (!data || data.length === 0) {
    const exists = await getAdminSupabase()
      .from('tax_rates')
      .select('id')
      .eq('id', id)
      .eq('company_id', companyId)
      .is('deleted_at', null)
      .maybeSingle();
    if (!exists.data) throw new NotFoundError();
    throw new ConflictError();
  }
  await getService('audit').record({
    action: 'tax_rate.updated',
    resourceType: 'tax_rate',
    resourceId: id,
    companyId,
    metadata: { code: input.code, rate: input.rate, by: actor.userId },
  });
  return view(data[0] as unknown as Record<string, unknown>);
}

export async function deleteRate(actor: Actor, id: string): Promise<void> {
  const companyId = need(actor);
  const r = await getAdminSupabase()
    .from('tax_rates')
    .update({ deleted_at: new Date().toISOString() })
    .eq('id', id)
    .eq('company_id', companyId)
    .is('deleted_at', null)
    .select('id');
  if (r.error) throw new InternalError(r.error);
  if (!r.data || r.data.length === 0) throw new NotFoundError();
  await getService('audit').record({
    action: 'tax_rate.deleted',
    resourceType: 'tax_rate',
    resourceId: id,
    companyId,
    metadata: { by: actor.userId },
  });
}

/** Adds the rates of a country template; rates whose code already exists are left as they are. */
export async function applyTemplate(
  actor: Actor,
  templateId: string,
): Promise<{ added: number; skipped: number }> {
  const companyId = need(actor);
  const template = findTemplate(templateId);
  if (!template) throw new NotFoundError();
  const existing = new Set((await listRates(companyId)).map((r) => r.code));
  let added = 0;
  let skipped = 0;
  for (const [index, t] of template.rates.entries()) {
    if (existing.has(t.code)) {
      skipped += 1;
      continue;
    }
    const { error } = await getAdminSupabase().from('tax_rates').insert({
      company_id: companyId,
      created_by: actor.userId,
      code: t.code,
      name: t.name,
      rate: t.rate,
      kind: t.kind,
      country: template.country,
      region: '',
      compound: t.compound,
      is_active: true,
      sort_order: index,
      template: template.id,
    });
    if (error) throw new InternalError(error);
    added += 1;
  }
  await getService('audit').record({
    action: 'tax_rate.template_applied',
    resourceType: 'tax_rate',
    resourceId: null,
    companyId,
    metadata: { template: templateId, added, skipped, by: actor.userId },
  });
  return { added, skipped };
}
