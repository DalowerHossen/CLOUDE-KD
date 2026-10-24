// path: app/api/admin/compliance/sanctions/route.ts
import { withApi } from '@/lib/api/with-api';
import { COMPLIANCE_IMPORT_MAX_BYTES, COMPLIANCE_STEP_UP_SECONDS } from '@/config/s16-compliance';
import { sanctionsImport } from '@/lib/compliance/rules';
import { ForbiddenError } from '@/lib/errors';
import { importSanctions, sourceStatus } from '@/services/compliance/sanctions';

export const GET = withApi(
  {
    id: 'admin.compliance.sanctions.status',
    scope: 'platform',
    networkContext: 'admin',
    permission: { action: 'compliance.read', resourceType: 'sanctions_source' },
  },
  async () => ({ data: await sourceStatus() }),
);

/** Replaces one whole list (OFAC or UN) with the given normalized entries. */
export const POST = withApi(
  {
    id: 'admin.compliance.sanctions.import',
    scope: 'platform',
    networkContext: 'admin',
    permission: { action: 'compliance.manage', resourceType: 'sanctions_source' },
    body: sanctionsImport,
    maxBodyBytes: COMPLIANCE_IMPORT_MAX_BYTES,
    stepUp: { maxAgeSeconds: COMPLIANCE_STEP_UP_SECONDS },
    rateLimitPolicy: 'strict',
    auditExempt: 'The sanctions service writes the audit entry.',
  },
  async ({ actor, body }) => {
    if (!actor) throw new ForbiddenError();
    return { data: await importSanctions(actor, body) };
  },
);
