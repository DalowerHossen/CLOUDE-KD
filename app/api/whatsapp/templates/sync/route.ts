// path: app/api/whatsapp/templates/sync/route.ts
import { z } from 'zod';
import { withApi } from '@/lib/api/with-api';
import { ForbiddenError } from '@/lib/errors';
import { syncTemplates } from '@/services/whatsapp/templates';

/** Reads the templates and their review status from WhatsApp. */
export const POST = withApi(
  {
    id: 'whatsapp.templates.sync',
    scope: 'tenant',
    permission: { action: 'whatsapp.manage', resourceType: 'whatsapp_template' },
    body: z.object({}).strict(),
    rateLimitPolicy: 'strict',
    auditExempt: 'The template service writes the audit entry.',
  },
  async ({ actor }) => {
    if (!actor?.companyId) throw new ForbiddenError();
    return { data: await syncTemplates(actor) };
  },
);
