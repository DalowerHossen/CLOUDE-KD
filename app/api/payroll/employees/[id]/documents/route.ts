// path: app/api/payroll/employees/[id]/documents/route.ts
import { z } from 'zod';
import { withApi } from '@/lib/api/with-api';
import { ForbiddenError } from '@/lib/errors';
import { MAX_ATTACHMENT_BODY_BYTES } from '@/config/s15-accounting';
import { attachmentInput } from '@/services/accounting/attachments';
import { addDocument, listDocuments } from '@/services/payroll/employees';

const params = z.object({ id: z.string().uuid() }).strict();

export const GET = withApi(
  {
    id: 'payroll.employees.documents',
    scope: 'tenant',
    permission: { action: 'payroll.employee.read', resourceType: 'employee' },
    params,
  },
  async ({ actor, params: p }) => {
    if (!actor?.companyId) throw new ForbiddenError();
    return { data: await listDocuments(actor.companyId, p.id) };
  },
);

export const POST = withApi(
  {
    id: 'payroll.employees.document_add',
    scope: 'tenant',
    permission: { action: 'payroll.employee.manage', resourceType: 'employee' },
    params,
    query: z.strictObject({
      kind: z.enum(['contract', 'identity', 'certificate', 'other']).default('other'),
    }),
    body: attachmentInput,
    maxBodyBytes: MAX_ATTACHMENT_BODY_BYTES,
    auditExempt: 'The employee service writes the audit entry.',
  },
  async ({ actor, params: p, query, body }) => {
    if (!actor?.companyId) throw new ForbiddenError();
    return { status: 201, data: await addDocument(actor, p.id, query.kind, body) };
  },
);
