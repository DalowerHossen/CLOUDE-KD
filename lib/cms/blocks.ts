// path: lib/cms/blocks.ts
// The block types a public page is made of. Every block has an id and a type; the rest is checked by a strict
// schema, so stored content can never carry unknown fields. Rich text is cleaned before it is stored and again before
// it is shown (lib/cms/richtext.ts).
import { z } from 'zod';

export const ICON_NAMES = [
  'file-text',
  'credit-card',
  'users',
  'wallet',
  'calculator',
  'bar-chart',
  'shield',
  'lock',
  'key',
  'globe',
  'mail',
  'bell',
  'cloud',
  'repeat',
  'check',
  'zap',
  'layers',
  'plug',
  'clock',
  'briefcase',
  'building',
  'receipt',
  'search',
  'life-buoy',
  'eye',
  'server',
  'smartphone',
  'link',
] as const;
export type IconName = (typeof ICON_NAMES)[number];

/** An internal path or an https address. Never javascript:, data: or protocol-relative. */
export const hrefSchema = z
  .string()
  .trim()
  .max(500)
  .refine(
    (v) =>
      /^\/(?![/\\])[^\s]*$/.test(v) ||
      /^https:\/\/[^\s]+$/.test(v) ||
      /^mailto:[^\s@]+@[^\s@]+$/.test(v),
    {
      message: 'Use an internal path such as /pricing or an https address.',
    },
  );

const text = (max: number): z.ZodString => z.string().trim().min(1).max(max);
const optionalText = (max: number): z.ZodDefault<z.ZodString> =>
  z.string().trim().max(max).default('');
const cta = z.object({ label: text(40), href: hrefSchema }).strict();
const id = z.string().regex(/^[a-z0-9][a-z0-9_-]{0,40}$/);

export const blockSchema = z.discriminatedUnion('type', [
  z
    .object({
      id,
      type: z.literal('hero'),
      eyebrow: optionalText(60),
      heading: text(120),
      subheading: optionalText(400),
      primaryCta: cta.optional(),
      secondaryCta: cta.optional(),
      note: optionalText(160),
    })
    .strict(),
  z
    .object({
      id,
      type: z.literal('features'),
      heading: text(120),
      intro: optionalText(400),
      items: z
        .array(
          z
            .object({
              icon: z.enum(ICON_NAMES),
              title: text(80),
              text: text(300),
              href: hrefSchema.optional(),
            })
            .strict(),
        )
        .min(1)
        .max(12),
    })
    .strict(),
  z
    .object({
      id,
      type: z.literal('steps'),
      heading: text(120),
      items: z
        .array(z.object({ title: text(80), text: text(300) }).strict())
        .min(2)
        .max(6),
    })
    .strict(),
  z
    .object({ id, type: z.literal('pricing_teaser'), heading: text(120), intro: optionalText(300) })
    .strict(),
  z
    .object({
      id,
      type: z.literal('pricing_table'),
      heading: text(120),
      intro: optionalText(400),
      /** Price text per plan, for example "$29 per month". Shown only when set. */
      prices: z.record(z.string().max(60)).default({}),
      footnote: optionalText(300),
    })
    .strict(),
  z
    .object({
      id,
      type: z.literal('testimonials'),
      heading: text(120),
      items: z
        .array(
          z
            .object({
              quote: text(400),
              name: text(80),
              role: optionalText(80),
              company: optionalText(80),
            })
            .strict(),
        )
        .max(12),
    })
    .strict(),
  z
    .object({
      id,
      type: z.literal('trust'),
      heading: text(120),
      items: z
        .array(z.object({ icon: z.enum(ICON_NAMES), title: text(80), text: text(200) }).strict())
        .min(1)
        .max(8),
    })
    .strict(),
  z
    .object({
      id,
      type: z.literal('faq'),
      heading: text(120),
      items: z
        .array(z.object({ question: text(200), answer: text(1200) }).strict())
        .min(1)
        .max(30),
    })
    .strict(),
  z
    .object({
      id,
      type: z.literal('cta'),
      heading: text(120),
      text: optionalText(300),
      button: cta,
      secondary: cta.optional(),
    })
    .strict(),
  z
    .object({
      id,
      type: z.literal('richtext'),
      heading: optionalText(120),
      html: z.string().max(60_000),
    })
    .strict(),
  z
    .object({
      id,
      type: z.literal('contact_form'),
      heading: text(120),
      intro: optionalText(400),
      email: optionalText(120),
    })
    .strict(),
  z
    .object({
      id,
      type: z.literal('jobs'),
      heading: text(120),
      intro: optionalText(400),
      emptyText: text(300),
      items: z
        .array(
          z
            .object({ title: text(100), location: text(80), type: text(40), text: text(600) })
            .strict(),
        )
        .max(30),
    })
    .strict(),
  z
    .object({
      id,
      type: z.literal('columns'),
      heading: text(120),
      intro: optionalText(400),
      items: z
        .array(
          z
            .object({
              title: text(80),
              text: text(500),
              bullets: z.array(text(160)).max(8).default([]),
            })
            .strict(),
        )
        .min(1)
        .max(6),
    })
    .strict(),
  z
    .object({
      id,
      type: z.literal('image'),
      /** A file stored in the CMS media library (storage category cms). */
      fileId: z.string().uuid(),
      alt: text(200),
      caption: optionalText(200),
    })
    .strict(),
]);

export type Block = z.output<typeof blockSchema>;
/** What an author writes: optional fields may be left out and get their default when the block is read. */
export type BlockInput = z.input<typeof blockSchema>;
export type BlockType = Block['type'];
export const BLOCK_TYPES = [
  'hero',
  'features',
  'steps',
  'pricing_teaser',
  'pricing_table',
  'testimonials',
  'trust',
  'faq',
  'cta',
  'richtext',
  'contact_form',
  'jobs',
  'columns',
  'image',
] as const satisfies readonly BlockType[];

export const pageContentSchema = z
  .array(blockSchema)
  .min(1)
  .max(40)
  .superRefine((blocks, ctx) => {
    const seen = new Set<string>();
    blocks.forEach((b, i) => {
      if (seen.has(b.id))
        ctx.addIssue({
          code: 'custom',
          message: `Block id "${b.id}" is used twice.`,
          path: [i, 'id'],
        });
      seen.add(b.id);
    });
  });

export interface PageMeta {
  title: string;
  description: string;
}

export const pageMetaSchema = z
  .object({
    title: z.string().trim().min(10).max(70),
    description: z.string().trim().min(50).max(170),
  })
  .strict();

export interface PageDefinition extends PageMeta {
  slug: string;
  blocks: BlockInput[];
}
