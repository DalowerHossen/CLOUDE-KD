// path: app/api/public/v1/automation/hooks/[id]/route.ts
import { hookParams } from '@/lib/integrations/automation-rules';
import { withPublicApi } from '@/lib/integrations/public-api';
import { unsubscribeHook } from '@/services/integration/automation';

/** Removes a hook made by Zapier or Make. */
export const DELETE = withPublicApi(
  { id: 'public.automation.hook_remove', resource: 'webhooks', params: hookParams },
  async ({ params, companyId, mode, key }) => {
    await unsubscribeHook({ companyId, mode, keyId: key.id }, params.id);
    return {
      data: { ok: true as const },
      audit: {
        action: 'public_api.hook_removed',
        resourceType: 'webhook_endpoint',
        resourceId: params.id,
      },
    };
  },
);
