// path: app/api/companies/mine/route.ts
import { z } from 'zod';
import { withApi } from '@/lib/api/with-api';
import { ForbiddenError } from '@/lib/errors';
import { createAdditionalCompany, myCompanies, switchCompany } from '@/services/company/companies';

const permission = { action: 'company.switch', resourceType: 'company' } as const;

export const GET = withApi(
  { id: 'company.mine', scope: 'tenant', permission },
  async ({ actor }) => {
    if (!actor) throw new ForbiddenError();
    return { data: await myCompanies(actor) };
  },
);

const body = z.discriminatedUnion('action', [
  z.object({ action: z.literal('switch'), companyId: z.string().uuid() }).strict(),
  z
    .object({
      action: z.literal('create'),
      name: z
        .string()
        .trim()
        .min(2)
        .max(200)
        .refine((v) => !/[<>]/.test(v), { message: 'Angle brackets are not allowed.' }),
    })
    .strict(),
]);

export const POST = withApi(
  {
    id: 'company.mine.action',
    scope: 'tenant',
    permission,
    stepUp: { maxAgeSeconds: 600 },
    body,
    rateLimitPolicy: 'strict',
    auditExempt: 'The service writes the audit entry.',
  },
  async ({ actor, body: b }) => {
    if (!actor) throw new ForbiddenError();
    if (b.action === 'switch') await switchCompany(actor, b.companyId);
    else await createAdditionalCompany(actor, b.name);
    return { data: { done: true } };
  },
);
