// path: app/api/admin/compliance/countries/route.ts
import { withApi } from '@/lib/api/with-api';
import { COMPLIANCE_STEP_UP_SECONDS } from '@/config/s16-compliance';
import { countryInput } from '@/lib/compliance/rules';
import { ForbiddenError } from '@/lib/errors';
import { addRestriction, listRestrictions } from '@/services/compliance/countries';

export const GET = withApi(
  {
    id: 'admin.compliance.countries.list',
    scope: 'platform',
    networkContext: 'admin',
    permission: { action: 'compliance.read', resourceType: 'country_restriction' },
  },
  async () => ({ data: await listRestrictions() }),
);

/** Adds a country restriction (on at once). */
export const POST = withApi(
  {
    id: 'admin.compliance.countries.add',
    scope: 'platform',
    networkContext: 'admin',
    permission: { action: 'compliance.manage', resourceType: 'country_restriction' },
    body: countryInput,
    stepUp: { maxAgeSeconds: COMPLIANCE_STEP_UP_SECONDS },
    auditExempt: 'The country service writes the audit entry.',
  },
  async ({ actor, body }) => {
    if (!actor) throw new ForbiddenError();
    return { status: 201, data: await addRestriction(actor, body) };
  },
);
