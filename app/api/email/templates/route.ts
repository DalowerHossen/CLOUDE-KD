// path: app/api/email/templates/route.ts
import { z } from 'zod';
import { withApi } from '@/lib/api/with-api';
import { templateDetail, templateList } from '@/services/email/template-admin';

export const GET = withApi(
  {
    id: 'email.templates.read',
    scope: 'tenant',
    permission: { action: 'email.settings.manage', resourceType: 'email' },
    query: z
      .object({
        id: z
          .string()
          .regex(/^[a-z0-9][a-z0-9_.-]{1,80}$/)
          .optional(),
      })
      .strict(),
  },
  async ({ query, tenant }) => {
    if (!tenant) throw new Error('unreachable');
    return {
      data: query.id
        ? await templateDetail(tenant.companyId, query.id)
        : await templateList(tenant.companyId),
    };
  },
);
