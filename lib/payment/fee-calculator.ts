// path: lib/payment/fee-calculator.ts
// The platform fee. A fee model is flat, a percentage, a percentage plus a fixed part, or tiered by payment size; a
// schedule holds a default model and optional models per processor, and a company can have its own schedule (set by the
// platform team). Tax on the platform fee is a separate rate. The processor's own fee is a cost of the platform and is
// shown in the breakdown but not taken from the company. Pure functions over `Money`; rates are percentages as text.
import { z } from 'zod';
import { Money } from '@/lib/utils/currency';

const rate = z.string().regex(/^\d{1,3}(\.\d{1,4})?$/, 'Use a rate such as 2.9 or 0.5.');
const amount = z.string().regex(/^\d{1,14}(\.\d{1,4})?$/, 'Use an amount such as 0.30.');

const clamp = { min: amount.optional(), max: amount.optional() };

export const feeModelSchema = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('flat'), fixed: amount, ...clamp }),
  z.strictObject({ kind: z.literal('percent'), rate, ...clamp }),
  z.strictObject({ kind: z.literal('percent_plus_fixed'), rate, fixed: amount, ...clamp }),
  z.strictObject({
    kind: z.literal('tiered'),
    /** Ascending by `upTo`; the last tier has `upTo` null. The tier a payment falls in prices the whole payment. */
    tiers: z
      .array(z.strictObject({ upTo: amount.nullable(), rate, fixed: amount }))
      .min(1)
      .max(10),
    ...clamp,
  }),
]);
export type FeeModel = z.infer<typeof feeModelSchema>;

export const feeScheduleSchema = z
  .strictObject({
    default: feeModelSchema,
    /** Keyed by processor id (for example "stripe"). */
    byProcessor: z.record(z.string().regex(/^[a-z][a-z0-9_]{1,39}$/), feeModelSchema),
    /** Percentage of tax charged on the platform fee (VAT or GST), "0" when none. */
    taxRate: rate,
  })
  .superRefine((schedule, ctx) => {
    for (const [key, model] of [
      ['default', schedule.default] as const,
      ...Object.entries(schedule.byProcessor),
    ]) {
      if (model.kind !== 'tiered') continue;
      const ups = model.tiers.map((t) => t.upTo);
      const last = ups[ups.length - 1];
      if (last !== null)
        ctx.addIssue({
          code: 'custom',
          message: `${key}: the last tier must have no upper limit.`,
          path: ['byProcessor'],
        });
      const bounded = ups.slice(0, -1);
      if (bounded.some((u) => u === null))
        ctx.addIssue({
          code: 'custom',
          message: `${key}: only the last tier can be open.`,
          path: ['byProcessor'],
        });
      for (let i = 1; i < bounded.length; i++)
        if (Money.parse(bounded[i] as string).lte(Money.parse(bounded[i - 1] as string)))
          ctx.addIssue({
            code: 'custom',
            message: `${key}: tiers must go up.`,
            path: ['byProcessor'],
          });
    }
  });
export type FeeSchedule = z.infer<typeof feeScheduleSchema>;

/** Used until the platform team sets its own: two percent, no fixed part, no tax. */
export const DEFAULT_FEE_SCHEDULE: FeeSchedule = {
  default: { kind: 'percent', rate: '2.0' },
  byProcessor: {},
  taxRate: '0',
};

function clampFee(fee: Money, model: FeeModel): Money {
  let out = fee;
  if (model.min !== undefined) out = Money.max(out, Money.parse(model.min));
  if (model.max !== undefined) out = Money.min(out, Money.parse(model.max));
  return out;
}

/** The fee of one payment under one model, rounded half up to four places and never above the payment itself. */
export function computeFee(gross: Money, model: FeeModel): Money {
  if (!gross.isPositive()) return Money.zero();
  let fee: Money;
  switch (model.kind) {
    case 'flat':
      fee = Money.parse(model.fixed);
      break;
    case 'percent':
      fee = gross.percent(model.rate);
      break;
    case 'percent_plus_fixed':
      fee = gross.percent(model.rate).add(Money.parse(model.fixed));
      break;
    case 'tiered': {
      const tier =
        model.tiers.find((t) => t.upTo === null || gross.lte(Money.parse(t.upTo))) ??
        model.tiers[model.tiers.length - 1];
      fee = gross
        .percent((tier as (typeof model.tiers)[number]).rate)
        .add(Money.parse((tier as (typeof model.tiers)[number]).fixed));
      break;
    }
  }
  return Money.min(clampFee(fee, model), gross);
}

export function resolveFeeModel(schedule: FeeSchedule, processorId: string | null): FeeModel {
  return (processorId ? schedule.byProcessor[processorId] : undefined) ?? schedule.default;
}

export interface FeeBreakdown {
  gross: Money;
  platformFee: Money;
  /** Tax on the platform fee. */
  tax: Money;
  /** What the processor charges the platform (a cost of the platform, not taken from the company). */
  processorFee: Money;
  /** platformFee plus tax: what is taken from the company. */
  totalFees: Money;
  /** gross minus totalFees: what the company receives. */
  net: Money;
}

export function feeBreakdown(
  gross: Money,
  schedule: FeeSchedule,
  processorId: string | null,
  processorFee: Money = Money.zero(),
): FeeBreakdown {
  const platformFee = computeFee(gross, resolveFeeModel(schedule, processorId));
  // The fee and its tax together never exceed the payment.
  const tax = Money.min(platformFee.percent(schedule.taxRate), gross.sub(platformFee));
  const totalFees = platformFee.add(tax);
  return { gross, platformFee, tax, processorFee, totalFees, net: gross.sub(totalFees) };
}
