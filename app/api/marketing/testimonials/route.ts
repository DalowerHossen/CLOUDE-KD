// path: app/api/marketing/testimonials/route.ts
import { z } from 'zod';
import { withApi } from '@/lib/api/with-api';
import { ForbiddenError } from '@/lib/errors';
import { deleteTestimonial, listTestimonials, saveTestimonial } from '@/services/marketing/admin';
import { testimonialSchema } from '@/services/marketing/schemas';

export const GET = withApi(
  {
    id: 'marketing.testimonials.list',
    scope: 'platform',
    networkContext: 'admin',
    permission: { action: 'marketing.read', resourceType: 'marketing' },
  },
  async () => ({ data: await listTestimonials() }),
);

export const POST = withApi(
  {
    id: 'marketing.testimonials.save',
    scope: 'platform',
    networkContext: 'admin',
    permission: { action: 'marketing.edit', resourceType: 'marketing' },
    body: testimonialSchema,
    auditExempt: 'The marketing service writes the audit entry.',
  },
  async ({ actor, body }) => {
    if (!actor) throw new ForbiddenError();
    await saveTestimonial(actor, body);
    return { data: { done: true } };
  },
);

export const DELETE = withApi(
  {
    id: 'marketing.testimonials.delete',
    scope: 'platform',
    networkContext: 'admin',
    permission: { action: 'marketing.edit', resourceType: 'marketing' },
    query: z.object({ id: z.string().uuid() }).strict(),
    auditExempt: 'The marketing service writes the audit entry.',
  },
  async ({ actor, query }) => {
    if (!actor) throw new ForbiddenError();
    await deleteTestimonial(actor, query.id);
    return { data: { done: true } };
  },
);
