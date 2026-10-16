// path: services/blog/schemas.ts
// Input shapes of the blog admin API. Every shape is strict.
import { z } from 'zod';

export const slugSchema = z.string().regex(/^[a-z0-9]([a-z0-9-]{0,78}[a-z0-9])?$/);
const uuid = z.string().uuid();

export const postSaveSchema = z
  .object({
    id: uuid.nullable().default(null),
    /** Version number the editor loaded; a different stored number means somebody else saved first. */
    expectedVersion: z.number().int().min(1).nullable().default(null),
    slug: slugSchema,
    title: z.string().trim().min(3).max(120),
    excerpt: z.string().trim().max(300).default(''),
    bodyHtml: z.string().max(200_000),
    coverFileId: uuid.nullable().default(null),
    coverAlt: z.string().trim().max(160).default(''),
    authorId: uuid,
    categoryId: uuid.nullable().default(null),
    tagIds: z.array(uuid).max(10).default([]),
    featured: z.boolean().default(false),
    seoTitle: z.string().trim().max(70).default(''),
    seoDescription: z.string().trim().max(170).default(''),
  })
  .strict();
export type PostSave = z.infer<typeof postSaveSchema>;

export const postActionSchema = z.discriminatedUnion('action', [
  z
    .object({
      action: z.literal('publish'),
      id: uuid,
      publishAt: z.string().datetime().nullable().default(null),
    })
    .strict(),
  z.object({ action: z.literal('cancel'), id: uuid }).strict(),
  z.object({ action: z.literal('unpublish'), id: uuid }).strict(),
  z.object({ action: z.literal('delete'), id: uuid }).strict(),
  z.object({ action: z.literal('restore'), id: uuid, versionNo: z.number().int().min(1) }).strict(),
]);
export type PostAction = z.infer<typeof postActionSchema>;

const name = (max: number): z.ZodString => z.string().trim().min(2).max(max);
export const taxonomySchema = z.discriminatedUnion('kind', [
  z
    .object({
      kind: z.literal('author'),
      id: uuid.nullable().default(null),
      slug: slugSchema,
      name: name(80),
      bio: z.string().trim().max(600).default(''),
      avatarFileId: uuid.nullable().default(null),
    })
    .strict(),
  z
    .object({
      kind: z.literal('category'),
      id: uuid.nullable().default(null),
      slug: slugSchema,
      name: name(60),
      description: z.string().trim().max(300).default(''),
    })
    .strict(),
  z
    .object({
      kind: z.literal('tag'),
      id: uuid.nullable().default(null),
      slug: slugSchema,
      name: name(40),
    })
    .strict(),
]);
export type TaxonomySave = z.infer<typeof taxonomySchema>;
export const taxonomyDeleteSchema = z
  .object({ kind: z.enum(['author', 'category', 'tag']), id: uuid })
  .strict();

export const publicListQuery = z
  .object({
    page: z.coerce.number().int().min(1).max(500).default(1),
    category: slugSchema.optional(),
    tag: slugSchema.optional(),
    q: z.string().trim().min(2).max(80).optional(),
    month: z
      .string()
      .regex(/^\d{4}-(0[1-9]|1[0-2])$/)
      .optional(),
  })
  .strict();
export type PublicListQuery = z.infer<typeof publicListQuery>;
