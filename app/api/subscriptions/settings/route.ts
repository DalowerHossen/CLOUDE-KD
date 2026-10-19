// path: app/api/subscriptions/settings/route.ts
import { z } from 'zod';
import { withApi } from '@/lib/api/with-api';
import { ForbiddenError, ValidationError } from '@/lib/errors';
import { billingSettingsInput, loadBilling, saveBilling } from '@/services/subscription/settings';

export const GET = withApi(
  {
    id: 'subscriptions.settings.get',
    scope: 'platform',
    networkContext: 'admin',
    roles: ['super_admin'],
    permission: { action: 'subscription.admin', resourceType: 'billing_settings' },
    query: z.strictObject({}),
  },
  async ({ actor }) => {
    if (!actor) throw new ForbiddenError();
    return { data: await loadBilling() };
  },
);

export const PUT = withApi(
  {
    id: 'subscriptions.settings.save',
    scope: 'platform',
    networkContext: 'admin',
    roles: ['super_admin'],
    permission: { action: 'subscription.admin', resourceType: 'billing_settings' },
    body: billingSettingsInput.extend({ taxPercentByCountryText: z.string().max(500).optional() }),
    auditExempt: 'The billing settings service writes the audit entry.',
  },
  async ({ actor, body }) => {
    if (!actor) throw new ForbiddenError();
    const { taxPercentByCountryText, ...rest } = body;
    const map: Record<string, string> = {};
    if (taxPercentByCountryText !== undefined) {
      for (const part of taxPercentByCountryText
        .split(',')
        .map((x) => x.trim())
        .filter(Boolean)) {
        const [code, value] = part.split(':').map((x) => x.trim());
        if (!code || value === undefined)
          throw new ValidationError('Write the tax like BD:15, SG:9.');
        map[code.toUpperCase()] = value;
      }
    }
    return {
      data: await saveBilling(
        actor,
        taxPercentByCountryText === undefined ? rest : { ...rest, taxPercentByCountry: map },
      ),
    };
  },
);
