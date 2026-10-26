// path: app/api/admin/releases/route.ts
import { withApi } from '@/lib/api/with-api';
import { ForbiddenError } from '@/lib/errors';
import { releaseActionSchema } from '@/lib/platform/release-notes';
import { runReleaseAction } from '@/services/platform/release-notes';

export const POST = withApi(
  {
    id: 'admin.releases.action',
    scope: 'platform',
    networkContext: 'admin',
    permission: { action: 'release.manage', resourceType: 'release_note' },
    stepUp: { maxAgeSeconds: 300 },
    body: releaseActionSchema,
    auditExempt: 'The service writes the audit entry.',
  },
  async ({ actor, body }) => {
    if (!actor) throw new ForbiddenError();
    await runReleaseAction(actor, body);
    return { data: { done: true } };
  },
);
