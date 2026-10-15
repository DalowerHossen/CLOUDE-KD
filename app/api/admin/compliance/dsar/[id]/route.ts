// path: app/api/admin/compliance/dsar/[id]/route.ts
import { z } from 'zod';
import { withApi } from '@/lib/api/with-api';
import { ForbiddenError } from '@/lib/errors';
import {
  dsarActionSchema,
  eraseSubject,
  exportSubjectData,
  rejectDsar,
} from '@/services/compliance/dsar';

const params = z.object({ id: z.string().uuid() }).strict();

export const POST = withApi(
  {
    id: 'admin.compliance.dsar.act',
    scope: 'platform',
    networkContext: 'admin',
    permission: { action: 'dsar.process', resourceType: 'dsar_request' },
    stepUp: { maxAgeSeconds: 600 },
    params,
    body: dsarActionSchema,
    auditExempt: 'The DSAR service writes the audit entry.',
  },
  async ({ params: { id }, body, actor }) => {
    if (!actor) throw new ForbiddenError();
    if (body.action === 'export') return { data: await exportSubjectData(actor, id) };
    if (body.action === 'erase') return { data: await eraseSubject(actor, id) };
    await rejectDsar(actor, id, body.reason);
    return { data: { rejected: true } };
  },
);
