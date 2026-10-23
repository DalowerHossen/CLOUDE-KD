// path: app/api/whatsapp/templates/[id]/route.ts
import { z } from 'zod';
import { withApi } from '@/lib/api/with-api';
import { ForbiddenError } from '@/lib/errors';
import { deleteTemplate, getTemplate } from '@/services/whatsapp/templates';

const params = z.object({ id: z.string().uuid() }).strict();

export const GET = withApi(
  {
    id: 'whatsapp.templates.get',
    scope: 'tenant',
    permission: { action: 'whatsapp.read', resourceType: 'whatsapp_template' },
    params,
  },
  async ({ actor, params: p }) => {
    if (!actor?.companyId) throw new ForbiddenError();
    return { data: await getTemplate(actor.companyId, p.id) };
  },
);

export const DELETE = withApi(
  {
    id: 'whatsapp.templates.remove',
    scope: 'tenant',
    permission: { action: 'whatsapp.manage', resourceType: 'whatsapp_template' },
    params,
    auditExempt: 'The template service writes the audit entry.',
  },
  async ({ actor, params: p }) => {
    if (!actor?.companyId) throw new ForbiddenError();
    await deleteTemplate(actor, p.id);
    return { data: { ok: true } };
  },
);
