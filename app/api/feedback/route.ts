// path: app/api/feedback/route.ts
import { withApi } from '@/lib/api/with-api';
import { ForbiddenError } from '@/lib/errors';
import { feedbackActionSchema } from '@/lib/support/opinion';
import { promptDue, submitFeedback } from '@/services/support/opinion';

const permission = { action: 'feedback.send', resourceType: 'feedback' } as const;

export const GET = withApi(
  { id: 'feedback.prompt', scope: 'tenant', permission },
  async ({ actor }) => {
    if (!actor) throw new ForbiddenError();
    return { data: { due: await promptDue(actor) } };
  },
);

export const POST = withApi(
  {
    id: 'feedback.send',
    scope: 'tenant',
    permission,
    body: feedbackActionSchema,
    rateLimitPolicy: 'strict',
    auditExempt: 'The service writes the audit entry.',
  },
  async ({ actor, body }) => {
    if (!actor) throw new ForbiddenError();
    await submitFeedback(actor, body);
    return { data: { done: true } };
  },
);
