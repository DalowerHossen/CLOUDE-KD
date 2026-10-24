// path: app/api/public/v1/automation/hooks/route.ts
import { withPublicApi } from '@/lib/integrations/public-api';
import { hookInput } from '@/lib/integrations/automation-rules';
import { subscribeHook } from '@/services/integration/automation';

/**
 * Subscribes a Zapier or Make hook URL to a trigger. The signing secret is in the answer and shown once, so this call is not
 * idempotent (a stored replay would keep the secret).
 */
export const POST = withPublicApi(
  { id: 'public.automation.hook_subscribe', resource: 'webhooks', body: hookInput },
  async ({ body, companyId, mode, key }) => {
    const hook = await subscribeHook({ companyId, mode, keyId: key.id }, body);
    return {
      status: 201,
      data: hook,
      audit: {
        action: 'public_api.hook_subscribed',
        resourceType: 'webhook_endpoint',
        resourceId: hook.id,
        metadata: { trigger: hook.trigger, source: hook.source },
      },
    };
  },
);
