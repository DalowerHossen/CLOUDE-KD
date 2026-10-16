// path: app/api/clients/[id]/statement-mail/route.ts
import { z } from 'zod';
import { withApi } from '@/lib/api/with-api';
import { ForbiddenError } from '@/lib/errors';
import { statementMailSchema } from '@/lib/crm/privacy';
import { emailStatement } from '@/services/client/statement-mail';

export const POST = withApi(
  {
    id: 'clients.statement_mail',
    scope: 'tenant',
    permission: { action: 'client.email', resourceType: 'client' },
    rateLimitPolicy: 'strict',
    params: z.object({ id: z.string().uuid() }).strict(),
    body: statementMailSchema,
    auditExempt: 'The statement service writes the audit entry.',
  },
  async ({ actor, params: p, body }) => {
    if (!actor) throw new ForbiddenError();
    return { data: await emailStatement(actor, p.id, body) };
  },
);
