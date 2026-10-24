// path: app/api/invoices/recurring/preview/route.ts
// The next five dates of a repeat rule, for the form.
import { withApi } from '@/lib/api/with-api';
import { recurringPreviewSchema } from '@/lib/schedule/input';
import { previewDates } from '@/lib/schedule/recurrence';

export const POST = withApi(
  {
    id: 'recurring.preview',
    scope: 'tenant',
    permission: { action: 'recurring.read', resourceType: 'recurring_schedule' },
    body: recurringPreviewSchema,
  },
  async ({ body }) => ({
    data: { dates: previewDates(body, body.from, 5) },
  }),
);
