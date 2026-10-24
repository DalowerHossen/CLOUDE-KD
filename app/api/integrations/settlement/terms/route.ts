// path: app/api/integrations/settlement/terms/route.ts
import { withApi } from '@/lib/api/with-api';
import { SETTLEMENT_STEP_UP_SECONDS } from '@/config/s16-settlement';
import { ForbiddenError } from '@/lib/errors';
import { termsInput } from '@/lib/gateway/split-rules';
import { listTerms, setTerms } from '@/services/gateway/terms';

export const GET = withApi(
  {
    id: 'settlement.terms.list',
    scope: 'tenant',
    permission: { action: 'settlement.read', resourceType: 'settlement_terms' },
  },
  async ({ actor }) => {
    if (!actor?.companyId) throw new ForbiddenError();
    return { data: await listTerms(actor.companyId) };
  },
);

/** Sets new terms (a new version; the old ones stay). Entries already posted keep the terms they were worked out with. */
export const POST = withApi(
  {
    id: 'settlement.terms.set',
    scope: 'tenant',
    permission: { action: 'settlement.manage', resourceType: 'settlement_terms' },
    body: termsInput,
    stepUp: { maxAgeSeconds: SETTLEMENT_STEP_UP_SECONDS },
    auditExempt: 'The terms service writes the audit entry.',
  },
  async ({ actor, body }) => {
    if (!actor) throw new ForbiddenError();
    return { status: 201, data: await setTerms(actor, body) };
  },
);
