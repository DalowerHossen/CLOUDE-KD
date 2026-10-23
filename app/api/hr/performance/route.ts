// path: app/api/hr/performance/route.ts
import { z } from 'zod';
import { withApi } from '@/lib/api/with-api';
import { ForbiddenError } from '@/lib/errors';
import { performanceInput } from '@/services/hr/hr-rules';
import { addNote, listNotes } from '@/services/hr/performance';

export const GET = withApi(
  {
    id: 'hr.performance.list',
    scope: 'tenant',
    permission: { action: 'hr.performance.read', resourceType: 'employee' },
    query: z.strictObject({ employeeId: z.string().uuid() }),
  },
  async ({ actor, query }) => {
    if (!actor?.companyId) throw new ForbiddenError();
    return { data: await listNotes(actor, query.employeeId) };
  },
);

export const POST = withApi(
  {
    id: 'hr.performance.add',
    scope: 'tenant',
    permission: { action: 'hr.performance.manage', resourceType: 'employee' },
    body: performanceInput,
    idempotent: true,
    auditExempt: 'The performance service writes the audit entry.',
  },
  async ({ actor, body }) => {
    if (!actor?.companyId) throw new ForbiddenError();
    return { status: 201, data: await addNote(actor, body) };
  },
);
