// path: app/api/admin/kyc/settings/route.ts
import { withApi } from '@/lib/api/with-api';
import { COMPLIANCE_STEP_UP_SECONDS } from '@/config/s16-compliance';
import { ForbiddenError } from '@/lib/errors';
import { profileInput } from '@/lib/kyc/profile';
import { getKycProfile, saveKycProfile } from '@/services/kyc/settings';

export const GET = withApi(
  {
    id: 'admin.kyc.settings.get',
    scope: 'platform',
    networkContext: 'admin',
    permission: { action: 'kyc.settings.read', resourceType: 'kyc_platform_settings' },
  },
  async () => ({ data: await getKycProfile() }),
);

export const PUT = withApi(
  {
    id: 'admin.kyc.settings.put',
    scope: 'platform',
    networkContext: 'admin',
    permission: { action: 'kyc.settings.manage', resourceType: 'kyc_platform_settings' },
    body: profileInput,
    stepUp: { maxAgeSeconds: COMPLIANCE_STEP_UP_SECONDS },
    auditExempt: 'The KYC settings service writes the audit entry.',
  },
  async ({ actor, body }) => {
    if (!actor) throw new ForbiddenError();
    return { data: await saveKycProfile(actor, body) };
  },
);
