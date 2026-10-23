// path: app/api/reports/presets/[id]/route.ts
import { z } from 'zod';
import { withApi } from '@/lib/api/with-api';
import { ForbiddenError } from '@/lib/errors';
import { deletePreset } from '@/services/report/schedules';

export const DELETE = withApi(
  {
    id: 'reports.deletePreset',
    scope: 'tenant',
    permission: { action: 'report.read', resourceType: 'report' },
    params: z.object({ id: z.string().uuid() }).strict(),
    auditExempt: 'A saved report is a personal preference, not business data.',
  },
  async ({ actor, params: p }) => {
    if (!actor) throw new ForbiddenError();
    await deletePreset(actor, p.id);
    return { data: { id: p.id } };
  },
);
