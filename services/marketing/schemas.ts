// path: services/marketing/schemas.ts
// Input shapes of the marketing admin and public APIs. Every shape is strict.
import { z } from 'zod';
import { SITE_EVENTS } from '@/lib/analytics/providers';

const uuid = z.string().uuid();
const text = (min: number, max: number): z.ZodString => z.string().trim().min(min).max(max);

export const testimonialSchema = z
  .object({
    id: uuid.nullable().default(null),
    quote: text(10, 400),
    personName: text(2, 80),
    personRole: z.string().trim().max(80).default(''),
    organization: z.string().trim().max(80).default(''),
    approved: z.boolean().default(false),
    sortOrder: z.number().int().min(0).max(1000).default(0),
  })
  .strict();

export const leadStatus = z.enum(['new', 'contacted', 'qualified', 'won', 'lost', 'unsubscribed']);
export const leadUpdateSchema = z
  .object({ id: uuid, status: leadStatus, note: z.string().trim().max(1000).default('') })
  .strict();

export const PUBLIC_LEAD_SOURCES = [
  'newsletter',
  'invoice_generator',
  'calculator',
  'template',
] as const;
export const leadCaptureSchema = z
  .object({
    email: z.string().trim().toLowerCase().email().max(254),
    name: z.string().trim().max(100).default(''),
    source: z.enum(PUBLIC_LEAD_SOURCES),
    /** The person agreed to receive e-mails from us (a box that starts unchecked). */
    marketingOk: z.boolean(),
    website: z.string().max(200).default(''),
    turnstileToken: z.string().min(1).max(4096),
  })
  .strict();
export type LeadCapture = z.infer<typeof leadCaptureSchema>;

export const campaignSchema = z
  .object({
    id: uuid.nullable().default(null),
    name: text(3, 80),
    subject: text(3, 150),
    bodyText: text(10, 8000),
  })
  .strict();
export const campaignActionSchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('send'), id: uuid }).strict(),
  z
    .object({
      action: z.literal('test'),
      id: uuid,
      to: z.string().trim().toLowerCase().email().max(254),
    })
    .strict(),
  z.object({ action: z.literal('delete'), id: uuid }).strict(),
]);

const variantSchema = z
  .object({
    key: z.string().regex(/^[a-z0-9-]{1,20}$/),
    heading: z.string().trim().max(120).default(''),
    subheading: z.string().trim().max(400).default(''),
    ctaLabel: z.string().trim().max(40).default(''),
  })
  .strict();
export const experimentSchema = z
  .object({
    id: uuid.nullable().default(null),
    key: z.string().regex(/^[a-z0-9]([a-z0-9-]{1,38}[a-z0-9])$/),
    name: text(3, 80),
    goalEvent: z.enum(['signup_click', 'contact_sent', 'cta_click', 'free_tool_used']),
    variants: z
      .array(variantSchema)
      .min(2)
      .max(4)
      .refine((v) => new Set(v.map((x) => x.key)).size === v.length, {
        message: 'Variant keys must differ.',
      })
      .refine((v) => v[0]?.key === 'control', {
        message: 'The first variant must have the key "control".',
      }),
  })
  .strict();
export type ExperimentInput = z.infer<typeof experimentSchema>;
export const experimentActionSchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('start'), id: uuid }).strict(),
  z.object({ action: z.literal('stop'), id: uuid }).strict(),
  z
    .object({
      action: z.literal('winner'),
      id: uuid,
      variant: z.string().regex(/^[a-z0-9-]{1,20}$/),
    })
    .strict(),
  z.object({ action: z.literal('delete'), id: uuid }).strict(),
]);

export const abEventSchema = z
  .object({
    key: z.string().regex(/^[a-z0-9-]{3,40}$/),
    variant: z.string().regex(/^[a-z0-9-]{1,20}$/),
    kind: z.enum(['exposure', 'conversion']),
  })
  .strict();
export const goalEvents = SITE_EVENTS.filter((e) => e !== 'page_view');
