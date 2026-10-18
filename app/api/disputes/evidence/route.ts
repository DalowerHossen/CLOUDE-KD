// path: app/api/disputes/evidence/route.ts
import { z } from 'zod';
import { withApi } from '@/lib/api/with-api';
import { ForbiddenError } from '@/lib/errors';
import { generateEvidencePack, listPacks } from '@/services/evidence/packs';

const id = z.string().uuid();

/** The packs made so far for a dispute. */
export const GET = withApi(
  {
    id: 'disputes.evidence.list',
    scope: 'tenant',
    permission: { action: 'dispute.read', resourceType: 'dispute' },
    query: z.strictObject({ disputeId: id }),
  },
  async ({ actor, query }) => {
    if (!actor?.companyId) throw new ForbiddenError();
    return { data: await listPacks(actor.companyId, query.disputeId) };
  },
);

/** One click: collects the evidence, draws the PDF, builds the ZIP, stores both and writes their checksums to the audit chain. */
export const POST = withApi(
  {
    id: 'disputes.evidence.generate',
    scope: 'tenant',
    permission: { action: 'dispute.manage', resourceType: 'dispute' },
    rateLimitPolicy: 'export',
    body: z.strictObject({ disputeId: id }),
    auditExempt: 'The pack service writes its own audit entry with the checksums.',
  },
  async ({ actor, body }) => {
    if (!actor?.companyId) throw new ForbiddenError();
    return { status: 201, data: await generateEvidencePack(actor, body.disputeId) };
  },
);
