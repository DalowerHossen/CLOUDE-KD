// path: app/api/accounting/assets/[id]/documents/route.ts
import { z } from 'zod';
import { withApi } from '@/lib/api/with-api';
import { ForbiddenError } from '@/lib/errors';
import { MAX_ATTACHMENT_BODY_BYTES } from '@/config/s15-accounting';
import { attachmentInput } from '@/services/accounting/attachments';
import { addAssetDocument, listAssetDocuments } from '@/services/asset/assets';

const params = z.object({ id: z.string().uuid() }).strict();

export const GET = withApi(
  {
    id: 'accounting.assets.documents.list',
    scope: 'tenant',
    permission: { action: 'accounting.read', resourceType: 'fixed_asset' },
    params,
  },
  async ({ actor, params: p }) => {
    if (!actor?.companyId) throw new ForbiddenError();
    return { data: await listAssetDocuments(actor.companyId, p.id) };
  },
);

export const POST = withApi(
  {
    id: 'accounting.assets.documents.add',
    scope: 'tenant',
    permission: { action: 'accounting.asset.manage', resourceType: 'fixed_asset' },
    params,
    body: attachmentInput,
    maxBodyBytes: MAX_ATTACHMENT_BODY_BYTES,
    auditExempt: 'The asset service writes the audit entry.',
  },
  async ({ actor, params: p, body }) => {
    if (!actor?.companyId) throw new ForbiddenError();
    return { status: 201, data: await addAssetDocument(actor, p.id, body) };
  },
);
