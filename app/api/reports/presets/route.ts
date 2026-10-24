// path: app/api/reports/presets/route.ts
import { z } from 'zod';
import { withApi } from '@/lib/api/with-api';
import { ForbiddenError } from '@/lib/errors';
import { presetInputSchema } from '@/lib/reports/params';
import { listPresets, savePreset } from '@/services/report/schedules';

export const GET = withApi(
  {
    id: 'reports.presets',
    scope: 'tenant',
    permission: { action: 'report.read', resourceType: 'report' },
    query: z
      .object({
        reportKey: z
          .string()
          .regex(/^[a-z][a-z0-9_]{1,40}$/)
          .optional(),
      })
      .strict(),
  },
  async ({ actor, query }) => {
    if (!actor) throw new ForbiddenError();
    return { data: await listPresets(actor, query.reportKey) };
  },
);

export const POST = withApi(
  {
    id: 'reports.savePreset',
    scope: 'tenant',
    permission: { action: 'report.read', resourceType: 'report' },
    body: presetInputSchema,
    auditExempt: 'A saved report is a personal preference, not business data.',
  },
  async ({ actor, body }) => {
    if (!actor) throw new ForbiddenError();
    return { status: 201, data: await savePreset(actor, body) };
  },
);
