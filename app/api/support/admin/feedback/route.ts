// path: app/api/support/admin/feedback/route.ts
import { withApi } from '@/lib/api/with-api';
import { feedbackSummary } from '@/services/support/opinion';

export const GET = withApi(
  {
    id: 'feedback.summary',
    scope: 'platform',
    networkContext: 'admin',
    permission: { action: 'feedback.read', resourceType: 'feedback' },
  },
  async () => ({ data: await feedbackSummary() }),
);
