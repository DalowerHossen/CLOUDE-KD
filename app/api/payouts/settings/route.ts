// path: app/api/payouts/settings/route.ts
import { z } from 'zod';
import { withApi } from '@/lib/api/with-api';
import { ForbiddenError } from '@/lib/errors';
import { morSettingsInput } from '@/lib/payment/mor-engine';
import { payoutSettingsInput } from '@/lib/payment/payout';
import { readOverrides, saveSettings } from '@/services/mor/settings';
import { loadPayoutRules, savePayoutSettings } from '@/services/payout/settings';

/** Platform settings of payouts and wallet settlement (a company id in the query reads that company's rules). */
export const GET = withApi(
  {
    id: 'payouts.settings.get',
    scope: 'platform',
    networkContext: 'admin',
    roles: ['super_admin'],
    permission: { action: 'payout.settings.manage', resourceType: 'payout_settings' },
    query: z.strictObject({ companyId: z.string().uuid().optional() }),
  },
  async ({ actor, query }) => {
    if (!actor) throw new ForbiddenError();
    return {
      data: {
        mor: await readOverrides(query.companyId ?? null),
        payout: query.companyId ? await loadPayoutRules(query.companyId) : null,
      },
    };
  },
);

export const PUT = withApi(
  {
    id: 'payouts.settings.save',
    scope: 'platform',
    networkContext: 'admin',
    roles: ['super_admin'],
    permission: { action: 'payout.settings.manage', resourceType: 'payout_settings' },
    body: z.strictObject({
      companyId: z.string().uuid().nullable().default(null),
      mor: morSettingsInput.optional(),
      payout: payoutSettingsInput.optional(),
    }),
    auditExempt: 'The settings services write the audit entry.',
  },
  async ({ actor, body }) => {
    if (!actor) throw new ForbiddenError();
    if (body.mor) await saveSettings(actor, body.companyId, body.mor);
    if (body.payout) await savePayoutSettings(actor, body.companyId, body.payout);
    return { data: { ok: true } };
  },
);
