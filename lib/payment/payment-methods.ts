// path: lib/payment/payment-methods.ts
// Which payment methods a company offers, as pure functions: the platform team switches a method on for a country, the
// plan allows it, and the owner chooses among those. No database here.
import {
  METHODS_PER_PLAN,
  PAYMENT_METHODS,
  PLAN_ORDER,
  type PaymentMethodDefinition,
} from '@/config/payment-methods';
import type { PlanKey } from '@/config/plans';
import type { FeeModel } from '@/lib/payment/fee-calculator';

export interface PlatformRow {
  methodCode: string;
  /** Null means every country of the catalogue. */
  country: string | null;
  enabled: boolean;
  sortOrder: number | null;
  feeModel: FeeModel | null;
  instructions: string | null;
  minPlan: string | null;
}

export interface CompanyRow {
  methodCode: string;
  enabled: boolean;
  sortOrder: number | null;
  instructions: string | null;
}

export interface ResolvedMethod {
  code: string;
  label: string;
  icon: string;
  kind: PaymentMethodDefinition['kind'];
  /** The platform team switched it on for the country. */
  platformEnabled: boolean;
  /** The plan of the company allows it. */
  planAllows: boolean;
  /** The owner switched it on (and it is allowed). */
  enabled: boolean;
  sortOrder: number;
  instructions: string;
  feeModel: FeeModel | null;
  minPlan: PlanKey;
}

const isPlan = (v: string | null): v is PlanKey =>
  v !== null && (PLAN_ORDER as readonly string[]).includes(v);

export function planAtLeast(have: string, need: PlanKey): boolean {
  const h = PLAN_ORDER.indexOf(have as PlanKey);
  return h >= 0 && h >= PLAN_ORDER.indexOf(need);
}

/** The platform row for a method in a country: the country row wins over the "every country" row. */
function platformRowFor(
  rows: readonly PlatformRow[],
  code: string,
  country: string,
): PlatformRow | null {
  return (
    rows.find((r) => r.methodCode === code && r.country === country) ??
    rows.find((r) => r.methodCode === code && r.country === null) ??
    null
  );
}

export function resolveMethods(input: {
  country: string | null;
  planKey: string;
  platform: readonly PlatformRow[];
  company: readonly CompanyRow[];
  catalogue?: readonly PaymentMethodDefinition[];
}): ResolvedMethod[] {
  const country = input.country ?? '';
  const out: ResolvedMethod[] = [];
  for (const def of input.catalogue ?? PAYMENT_METHODS) {
    if (!def.countries.includes(country)) continue;
    const p = platformRowFor(input.platform, def.code, country);
    const mine = input.company.find((c) => c.methodCode === def.code);
    const minPlan = isPlan(p?.minPlan ?? null) ? (p?.minPlan as PlanKey) : def.minPlan;
    const platformEnabled = p?.enabled === true;
    const planAllows = planAtLeast(input.planKey, minPlan);
    out.push({
      code: def.code,
      label: def.label,
      icon: def.icon,
      kind: def.kind,
      platformEnabled,
      planAllows,
      enabled: platformEnabled && planAllows && mine?.enabled === true,
      sortOrder: mine?.sortOrder ?? p?.sortOrder ?? 500,
      instructions: mine?.instructions ?? p?.instructions ?? def.instructions,
      feeModel: p?.feeModel ?? null,
      minPlan,
    });
  }
  return out.sort((a, b) => a.sortOrder - b.sortOrder || a.code.localeCompare(b.code));
}

/** How many methods this plan may switch on (null is no limit). */
export function planMethodLimit(planKey: string): number | null {
  return planKey in METHODS_PER_PLAN ? METHODS_PER_PLAN[planKey as PlanKey] : METHODS_PER_PLAN.free;
}

/** Why the owner may not switch `code` on, or null when it is allowed. */
export function switchOnProblem(
  methods: readonly ResolvedMethod[],
  code: string,
  planKey: string,
  limit: number | null,
): string | null {
  const m = methods.find((x) => x.code === code);
  if (!m) return 'This payment method is not offered in your country.';
  if (!m.platformEnabled) return 'This payment method is not available yet.';
  if (!m.planAllows) return `This payment method needs the ${m.minPlan} plan or higher.`;
  if (m.enabled) return null;
  const on = methods.filter((x) => x.enabled).length;
  if (limit !== null && on >= limit)
    return `Your ${planKey} plan allows ${limit} payment methods. Switch one off first or upgrade.`;
  return null;
}
