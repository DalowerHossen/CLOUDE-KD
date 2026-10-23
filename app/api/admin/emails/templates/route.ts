// path: app/api/admin/emails/templates/route.ts
import { z } from 'zod';
import { withApi } from '@/lib/api/with-api';
import { templateDetail, templateList } from '@/services/email/template-admin';

export const GET = withApi(
  {
    id: 'admin.email.templates.read',
    scope: 'platform',
    networkContext: 'admin',
    permission: { action: 'email.template.manage', resourceType: 'email' },
    query: z
      .object({
        id: z
          .string()
          .regex(/^[a-z0-9][a-z0-9_.-]{1,80}$/)
          .optional(),
      })
      .strict(),
  },
  async ({ query }) => ({
    data: query.id ? await templateDetail(null, query.id) : await templateList(null),
  }),
);
