// path: app/api/gateway-kyc/[token]/business/route.ts
import { z } from 'zod';
import { withApi } from '@/lib/api/with-api';
import { NotFoundError } from '@/lib/errors';
import { kycBusinessInput } from '@/lib/gateway/kyc-rules';
import { saveBusiness } from '@/services/gateway/kyc-applicant';
import { resolveKycLink } from '@/services/gateway/kyc-links';

const params = z.object({ token: z.string().min(20).max(60) }).strict();

export const PUT = withApi(
  {
    id: 'gatewayKyc.business.save',
    scope: 'public',
    networkContext: 'kyc',
    params,
    body: kycBusinessInput,
    auditExempt: 'The KYC service writes the audit entry.',
  },
  async ({ params: p, body, ip }) => {
    const link = await resolveKycLink(p.token, ip);
    if (!link) throw new NotFoundError();
    await saveBusiness(link, body);
    return { data: { done: true } };
  },
);
