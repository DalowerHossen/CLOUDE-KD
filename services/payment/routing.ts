// path: services/payment/routing.ts
// Routing rule storage (platform level, super admin) and the route decision used by the payment service.
import { getService } from '@/lib/container';
import { ConflictError, NotFoundError, ValidationError } from '@/lib/errors';
import {
  evaluateRouting,
  parseRuleAmount,
  ruleProblems,
  type RoutingDecision,
  type RoutingInput,
  type RoutingRule,
} from '@/lib/payment/routing';
import type { RoutingRuleCreate, RoutingRuleUpdate } from '@/schemas/payment/routing';
import { getAdminSupabase } from '@/lib/supabase/admin';
import type { Actor, ProcessorId } from '@/types/contracts';
import { mapPaymentDbError } from './rpc';

const COLUMNS =
  'id, name, priority, processor_id, min_amount, max_amount, countries, methods, plans, enabled, created_at, version';

interface RuleRow {
  id: string;
  name: string;
  priority: number;
  processor_id: ProcessorId;
  min_amount: string | null;
  max_amount: string | null;
  countries: string[];
  methods: string[];
  plans: string[];
  enabled: boolean;
  created_at: string;
  version: number;
}

export interface RoutingRuleView extends Omit<RoutingRule, 'minAmount' | 'maxAmount'> {
  minAmount: string | null;
  maxAmount: string | null;
  version: number;
}

function toRule(row: RuleRow): RoutingRule {
  return {
    id: row.id,
    name: row.name,
    priority: row.priority,
    processorId: row.processor_id,
    minAmount: parseRuleAmount(row.min_amount),
    maxAmount: parseRuleAmount(row.max_amount),
    countries: row.countries,
    methods: row.methods,
    plans: row.plans,
    enabled: row.enabled,
    createdAt: row.created_at,
  };
}

function toView(row: RuleRow): RoutingRuleView {
  const rule = toRule(row);
  return {
    ...rule,
    minAmount: rule.minAmount ? rule.minAmount.toDbString() : null,
    maxAmount: rule.maxAmount ? rule.maxAmount.toDbString() : null,
    version: row.version,
  };
}

async function loadRows(): Promise<RuleRow[]> {
  const { data, error } = await getAdminSupabase()
    .from('routing_rules')
    .select(COLUMNS)
    .is('deleted_at', null)
    .order('priority', { ascending: true })
    .order('created_at', { ascending: true });
  if (error) throw mapPaymentDbError(error);
  return (data ?? []) as RuleRow[];
}

export async function listRoutingRules(): Promise<RoutingRuleView[]> {
  return (await loadRows()).map(toView);
}

/** The decision for one payment. Null means no rule matched: the caller cancels with `routing_no_match`. */
export async function resolveRoute(input: RoutingInput): Promise<RoutingDecision | null> {
  const rules = (await loadRows()).map(toRule);
  return evaluateRouting(rules, input);
}

function checked(input: RoutingRuleCreate): void {
  const problems = ruleProblems({
    minAmount: parseRuleAmount(input.minAmount),
    maxAmount: parseRuleAmount(input.maxAmount),
  });
  if (problems.length > 0) throw new ValidationError(problems.join(' '));
}

function columns(input: RoutingRuleCreate, actor: Actor): Record<string, unknown> {
  return {
    name: input.name,
    priority: input.priority,
    processor_id: input.processorId,
    min_amount: input.minAmount,
    max_amount: input.maxAmount,
    countries: [...new Set(input.countries)].sort(),
    methods: [...new Set(input.methods)].sort(),
    plans: [...new Set(input.plans)].sort(),
    enabled: input.enabled,
    updated_by: actor.userId,
  };
}

async function audit(action: string, id: string, metadata: Record<string, unknown>): Promise<void> {
  await getService('audit').record({
    action,
    resourceType: 'routing_rule',
    resourceId: id,
    metadata,
  });
}

export async function createRoutingRule(
  actor: Actor,
  input: RoutingRuleCreate,
): Promise<RoutingRuleView> {
  checked(input);
  const { data, error } = await getAdminSupabase()
    .from('routing_rules')
    .insert(columns(input, actor))
    .select(COLUMNS)
    .single();
  if (error) throw mapPaymentDbError(error);
  const row = data as RuleRow;
  await audit('routing.rule.create', row.id, {
    name: row.name,
    priority: row.priority,
    processorId: row.processor_id,
  });
  return toView(row);
}

export async function updateRoutingRule(
  actor: Actor,
  id: string,
  input: RoutingRuleUpdate,
): Promise<RoutingRuleView> {
  const { expectedVersion, ...rest } = input;
  checked(rest);
  const { data, error } = await getAdminSupabase()
    .from('routing_rules')
    .update(columns(rest, actor))
    .eq('id', id)
    .eq('version', expectedVersion)
    .is('deleted_at', null)
    .select(COLUMNS)
    .maybeSingle();
  if (error) throw mapPaymentDbError(error);
  if (!data) {
    const exists = await getAdminSupabase()
      .from('routing_rules')
      .select('id')
      .eq('id', id)
      .is('deleted_at', null)
      .maybeSingle();
    if (exists.data)
      throw new ConflictError('This rule was changed by someone else. Reload and try again.');
    throw new NotFoundError();
  }
  const row = data as RuleRow;
  await audit('routing.rule.update', row.id, {
    name: row.name,
    priority: row.priority,
    processorId: row.processor_id,
    enabled: row.enabled,
  });
  return toView(row);
}

export async function deleteRoutingRule(
  actor: Actor,
  id: string,
  expectedVersion: number,
): Promise<void> {
  const { data, error } = await getAdminSupabase()
    .from('routing_rules')
    .update({ deleted_at: new Date().toISOString(), enabled: false, updated_by: actor.userId })
    .eq('id', id)
    .eq('version', expectedVersion)
    .is('deleted_at', null)
    .select('id, name')
    .maybeSingle();
  if (error) throw mapPaymentDbError(error);
  if (!data)
    throw new ConflictError('This rule was changed or already removed. Reload and try again.');
  await audit('routing.rule.delete', String(data.id), { name: String(data.name) });
}
