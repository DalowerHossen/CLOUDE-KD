// path: app/api/email/settings/actions/route.ts
import { withApi } from '@/lib/api/with-api';
import { emailActionSchema, runEmailAction } from '@/services/email/settings';

export const POST = withApi(
  {
    id: 'email.settings.action',
    scope: 'tenant',
    permission: { action: 'email.settings.manage', resourceType: 'email' },
    stepUp: { maxAgeSeconds: 300 },
    rateLimitPolicy: 'strict',
    body: emailActionSchema,
    auditExempt:
      'The e-mail settings service writes the audit entry (reads and tests change nothing durable).',
  },
  async ({ actor, tenant, body }) => {
    if (!actor || !tenant) throw new Error('unreachable');
    return { data: await runEmailAction(actor, tenant.companyId, body) };
  },
);
