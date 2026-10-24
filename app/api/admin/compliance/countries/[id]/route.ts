// path: app/api/admin/compliance/countries/[id]/route.ts
import { z } from 'zod';
import { withApi } from '@/lib/api/with-api';
import { COMPLIANCE_STEP_UP_SECONDS } from '@/config/s16-compliance';
import { countryPatch } from '@/lib/compliance/rules';
import { ForbiddenError } from '@/lib/errors';
import { changeRestriction, removeRestriction } from '@/services/compliance/countries';

const params = z.object({ id: z.string().uuid() }).strict();

/** The switch: turns a restriction on or off, or changes its mode and reason (optimistic lock on version). */
export const PATCH = withApi(
  {
    id: 'admin.compliance.countries.change',
    scope: 'platform',
    networkContext: 'admin',
    permission: { action: 'compliance.manage', resourceType: 'country_restriction' },
    params,
    body: countryPatch,
    stepUp: { maxAgeSeconds: COMPLIANCE_STEP_UP_SECONDS },
    auditExempt: 'The country service writes the audit entry.',
  },
  async ({ actor, params: p, body }) => {
    if (!actor) throw new ForbiddenError();
    return { data: await changeRestriction(actor, p.id, body) };
  },
);

export const DELETE = withApi(
  {
    id: 'admin.compliance.countries.remove',
    scope: 'platform',
    networkContext: 'admin',
    permission: { action: 'compliance.manage', resourceType: 'country_restriction' },
    params,
    stepUp: { maxAgeSeconds: COMPLIANCE_STEP_UP_SECONDS },
    auditExempt: 'The country service writes the audit entry.',
  },
  async ({ actor, params: p }) => {
    if (!actor) throw new ForbiddenError();
    await removeRestriction(actor, p.id);
    return { data: { removed: true } };
  },
);
