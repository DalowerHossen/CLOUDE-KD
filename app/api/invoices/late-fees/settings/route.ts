// path: app/api/invoices/late-fees/settings/route.ts
import { z } from 'zod';
import { withApi } from '@/lib/api/with-api';
import { ForbiddenError } from '@/lib/errors';
import { lateFeeSettingsSchema } from '@/lib/schedule/input';
import { getLateFeeSettings, saveLateFeeSettings } from '@/services/invoice/late-fees';

export const GET = withApi(
  {
    id: 'lateFees.settings',
    scope: 'tenant',
    permission: { action: 'invoice.read', resourceType: 'late_fee_settings' },
  },
  async ({ actor }) => {
    if (!actor?.companyId) throw new ForbiddenError();
    return { data: await getLateFeeSettings(actor.companyId) };
  },
);

export const PUT = withApi(
  {
    id: 'lateFees.saveSettings',
    scope: 'tenant',
    permission: { action: 'latefee.manage', resourceType: 'late_fee_settings' },
    body: z
      .object({ expectedVersion: z.number().int().min(0), settings: lateFeeSettingsSchema })
      .strict(),
    auditExempt: 'The late fee service writes the audit entry.',
  },
  async ({ actor, body }) => {
    if (!actor) throw new ForbiddenError();
    return { data: await saveLateFeeSettings(actor, body.settings, body.expectedVersion) };
  },
);
