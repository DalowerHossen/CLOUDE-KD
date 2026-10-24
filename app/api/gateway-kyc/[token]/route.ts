// path: app/api/gateway-kyc/[token]/route.ts
// The applicant's side of the sub-merchant KYC. The secure link in the address is the only credential; a wrong, expired or revoked
// link answers 404 in all cases. The KYC network policy (no VPN, proxy or Tor) applies.
import { z } from 'zod';
import { withApi } from '@/lib/api/with-api';
import { NotFoundError } from '@/lib/errors';
import { ownersSchema, uploadSchema } from '@/lib/kyc/rules';
import {
  applicantView,
  saveOwnersOfLink,
  submitOfLink,
  uploadDocumentOfLink,
} from '@/services/gateway/kyc-applicant';
import { resolveKycLink, type ResolvedLink } from '@/services/gateway/kyc-links';

const params = z.object({ token: z.string().min(20).max(60) }).strict();

async function linkOf(token: string, ip: string): Promise<ResolvedLink> {
  const link = await resolveKycLink(token, ip);
  if (!link) throw new NotFoundError();
  return link;
}

export const GET = withApi(
  { id: 'gatewayKyc.view', scope: 'public', networkContext: 'kyc', params },
  async ({ params: p, ip }) => ({ data: await applicantView(await linkOf(p.token, ip)) }),
);

export const POST = withApi(
  {
    id: 'gatewayKyc.document.upload',
    scope: 'public',
    networkContext: 'kyc',
    rateLimitPolicy: 'upload',
    maxBodyBytes: 7_600_000,
    params,
    body: uploadSchema,
    auditExempt: 'The KYC service and the storage service write the audit entries.',
  },
  async ({ params: p, body, ip }) => ({
    status: 201,
    data: await uploadDocumentOfLink(await linkOf(p.token, ip), body),
  }),
);

export const PUT = withApi(
  {
    id: 'gatewayKyc.owners.save',
    scope: 'public',
    networkContext: 'kyc',
    params,
    body: ownersSchema,
    auditExempt: 'The KYC service writes the audit entry.',
  },
  async ({ params: p, body, ip }) => {
    await saveOwnersOfLink(await linkOf(p.token, ip), body);
    return { data: { done: true } };
  },
);

export const PATCH = withApi(
  {
    id: 'gatewayKyc.submit',
    scope: 'public',
    networkContext: 'kyc',
    rateLimitPolicy: 'strict',
    params,
    body: z.object({}).strict(),
    auditExempt: 'The KYC service writes the audit entry.',
  },
  async ({ params: p, ip }) => {
    await submitOfLink(await linkOf(p.token, ip));
    return { data: { done: true } };
  },
);
