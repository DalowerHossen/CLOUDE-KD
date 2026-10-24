// path: app/api/integrations/gateway/upstream/secret/route.ts
import { withApi } from '@/lib/api/with-api';
import { GATEWAY_STEP_UP_SECONDS } from '@/config/s16-gateway';
import { ForbiddenError } from '@/lib/errors';
import { rotateSecretInput } from '@/lib/gateway/rules';
import { rotateUpstreamSecret } from '@/services/gateway/upstream';

/** A new signing secret (shown once). The old one still works for 24 hours. */
export const POST = withApi(
  {
    id: 'gateway.upstream.rotate',
    scope: 'tenant',
    permission: { action: 'gateway.manage', resourceType: 'gateway_upstream' },
    body: rotateSecretInput,
    stepUp: { maxAgeSeconds: GATEWAY_STEP_UP_SECONDS },
    auditExempt: 'The upstream service writes the audit entry.',
  },
  async ({ actor }) => {
    if (!actor) throw new ForbiddenError();
    return { data: await rotateUpstreamSecret(actor) };
  },
);
