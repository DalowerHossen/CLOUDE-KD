// path: app/api/admin/emails/settings/actions/route.ts
import { withApi } from '@/lib/api/with-api';
import { ForbiddenError } from '@/lib/errors';
import { emailActionSchema, runEmailAction } from '@/services/email/settings';

export const POST = withApi(
  {
    id: 'admin.email.settings.action',
    scope: 'platform',
    networkContext: 'admin',
    permission: { action: 'email.platform.manage', resourceType: 'email' },
    stepUp: { maxAgeSeconds: 300 },
    rateLimitPolicy: 'strict',
    body: emailActionSchema,
    auditExempt:
      'The e-mail settings service writes the audit entry (reads and tests change nothing durable).',
  },
  async ({ actor, body }) => {
    if (!actor) throw new ForbiddenError();
    return { data: await runEmailAction(actor, null, body) };
  },
);
