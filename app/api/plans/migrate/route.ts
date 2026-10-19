// path: app/api/plans/migrate/route.ts
import { z } from 'zod';
import { withApi } from '@/lib/api/with-api';
import { ForbiddenError } from '@/lib/errors';
import { migrateTenants } from '@/services/plan/migrate';

const slug = z.string().regex(/^[a-z][a-z0-9_]{1,30}$/);

export const POST = withApi(
  {
    id: 'plans.migrate',
    scope: 'platform',
    networkContext: 'admin',
    roles: ['super_admin'],
    permission: { action: 'plan.manage', resourceType: 'plan' },
    stepUp: { maxAgeSeconds: 600 },
    body: z.strictObject({
      fromSlug: slug,
      toSlug: slug,
      companyIds: z.array(z.string().uuid()).max(500).optional(),
      dryRun: z.boolean().default(true),
    }),
    auditExempt: 'The plan service writes an audit entry for every company moved.',
  },
  async ({ actor, body }) => {
    if (!actor) throw new ForbiddenError();
    return { data: await migrateTenants(actor, body) };
  },
);
