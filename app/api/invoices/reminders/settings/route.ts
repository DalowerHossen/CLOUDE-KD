// path: app/api/invoices/reminders/settings/route.ts
import { z } from 'zod';
import { withApi } from '@/lib/api/with-api';
import { ForbiddenError } from '@/lib/errors';
import { reminderSettingsSchema } from '@/lib/schedule/input';
import { getReminderSettings, saveReminderSettings } from '@/services/invoice/reminders';

export const GET = withApi(
  {
    id: 'reminders.settings',
    scope: 'tenant',
    permission: { action: 'invoice.read', resourceType: 'reminder_settings' },
  },
  async ({ actor }) => {
    if (!actor?.companyId) throw new ForbiddenError();
    return { data: await getReminderSettings(actor.companyId) };
  },
);

export const PUT = withApi(
  {
    id: 'reminders.saveSettings',
    scope: 'tenant',
    permission: { action: 'reminder.manage', resourceType: 'reminder_settings' },
    body: z
      .object({ expectedVersion: z.number().int().min(0), settings: reminderSettingsSchema })
      .strict(),
    auditExempt: 'The reminder service writes the audit entry.',
  },
  async ({ actor, body }) => {
    if (!actor) throw new ForbiddenError();
    return { data: await saveReminderSettings(actor, body.settings, body.expectedVersion) };
  },
);
