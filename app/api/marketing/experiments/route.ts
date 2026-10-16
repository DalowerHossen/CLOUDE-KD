// path: app/api/marketing/experiments/route.ts
import { withApi } from '@/lib/api/with-api';
import { ForbiddenError } from '@/lib/errors';
import { listExperiments, runExperimentAction, saveExperiment } from '@/services/marketing/admin';
import { experimentActionSchema, experimentSchema } from '@/services/marketing/schemas';

export const GET = withApi(
  {
    id: 'marketing.experiments.list',
    scope: 'platform',
    networkContext: 'admin',
    permission: { action: 'marketing.read', resourceType: 'marketing' },
  },
  async () => ({ data: await listExperiments() }),
);

export const POST = withApi(
  {
    id: 'marketing.experiments.save',
    scope: 'platform',
    networkContext: 'admin',
    permission: { action: 'marketing.edit', resourceType: 'marketing' },
    body: experimentSchema,
    auditExempt: 'The marketing service writes the audit entry.',
  },
  async ({ actor, body }) => {
    if (!actor) throw new ForbiddenError();
    await saveExperiment(actor, body);
    return { data: { done: true } };
  },
);

export const PUT = withApi(
  {
    id: 'marketing.experiments.action',
    scope: 'platform',
    networkContext: 'admin',
    permission: { action: 'marketing.edit', resourceType: 'marketing' },
    body: experimentActionSchema,
    auditExempt: 'The marketing service writes the audit entry.',
  },
  async ({ actor, body }) => {
    if (!actor) throw new ForbiddenError();
    await runExperimentAction(actor, body);
    return { data: { done: true } };
  },
);
