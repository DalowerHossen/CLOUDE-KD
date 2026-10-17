// path: schemas/payment/routing.ts
import { z } from 'zod';
import { PAYMENT_METHODS } from '@/config/processors';
import { PLAN_KEYS } from '@/config/plans';
import { PROCESSOR_IDS } from '@/types/contracts';

const amount = z
  .string()
  .regex(/^\d{1,14}(\.\d{1,4})?$/, 'Use a plain amount such as 100 or 100.50')
  .nullable()
  .default(null);

export const routingRuleFields = {
  name: z.string().trim().min(1).max(100),
  priority: z.number().int().min(1).max(100000),
  processorId: z.enum(PROCESSOR_IDS),
  minAmount: amount,
  maxAmount: amount,
  countries: z
    .array(z.string().regex(/^[A-Z]{2}$/))
    .max(250)
    .default([]),
  methods: z.array(z.enum(PAYMENT_METHODS)).max(PAYMENT_METHODS.length).default([]),
  plans: z.array(z.enum(PLAN_KEYS)).max(PLAN_KEYS.length).default([]),
  enabled: z.boolean().default(true),
};

export const routingRuleCreateSchema = z.object(routingRuleFields).strict();
export const routingRuleUpdateSchema = z
  .object({ ...routingRuleFields, expectedVersion: z.number().int().min(1).max(2_000_000_000) })
  .strict();
export const routingRuleDeleteSchema = z
  .object({ expectedVersion: z.number().int().min(1).max(2_000_000_000) })
  .strict();

export type RoutingRuleCreate = z.infer<typeof routingRuleCreateSchema>;
export type RoutingRuleUpdate = z.infer<typeof routingRuleUpdateSchema>;
