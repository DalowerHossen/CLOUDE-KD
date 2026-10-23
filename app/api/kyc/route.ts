// path: app/api/kyc/route.ts
import { withApi } from '@/lib/api/with-api';
import { ForbiddenError } from '@/lib/errors';
import { ownersSchema, uploadSchema } from '@/lib/kyc/rules';
import { kycView, saveOwners, submitKyc, uploadDocument } from '@/services/kyc/owner';
import { z } from 'zod';

const status = { action: 'kyc.status', resourceType: 'kyc' } as const;
const submit = { action: 'kyc.submit', resourceType: 'kyc' } as const;

export const GET = withApi(
  { id: 'kyc.view', scope: 'tenant', permission: status },
  async ({ actor }) => {
    if (!actor?.companyId) throw new ForbiddenError();
    return { data: await kycView(actor.companyId) };
  },
);

export const POST = withApi(
  {
    id: 'kyc.document.upload',
    scope: 'tenant',
    permission: submit,
    networkContext: 'kyc',
    rateLimitPolicy: 'upload',
    maxBodyBytes: 7_600_000,
    body: uploadSchema,
    auditExempt: 'The KYC service and the storage service write the audit entries.',
  },
  async ({ actor, body }) => {
    if (!actor) throw new ForbiddenError();
    return { status: 201, data: await uploadDocument(actor, body) };
  },
);

export const PUT = withApi(
  {
    id: 'kyc.owners.save',
    scope: 'tenant',
    permission: submit,
    networkContext: 'kyc',
    body: ownersSchema,
    auditExempt: 'The KYC service writes the audit entry.',
  },
  async ({ actor, body }) => {
    if (!actor) throw new ForbiddenError();
    await saveOwners(actor, body);
    return { data: { done: true } };
  },
);

export const PATCH = withApi(
  {
    id: 'kyc.submit',
    scope: 'tenant',
    permission: submit,
    networkContext: 'kyc',
    rateLimitPolicy: 'strict',
    body: z.object({}).strict(),
    auditExempt: 'The KYC service writes the audit entry.',
  },
  async ({ actor }) => {
    if (!actor) throw new ForbiddenError();
    await submitKyc(actor);
    return { data: { done: true } };
  },
);
