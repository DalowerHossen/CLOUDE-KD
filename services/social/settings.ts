// path: services/social/settings.ts
// Social settings of a company: whether posts need approval before they are published, the hours after which an unreviewed post is
// approved by itself (empty: never), and whether links in posts are tracked.
import 'server-only';
import { InternalError, ValidationError } from '@/lib/errors';
import { settingsInput } from '@/lib/social/schedule';
import { getAdminSupabase } from '@/lib/supabase/admin';
import type { Actor } from '@/types/contracts';
import { mapIntegrationError } from '@/services/publicapi/db-errors';
import { need, record } from './db';

export interface SocialSettings {
  approvalRequired: boolean;
  approvalSlaHours: number | null;
  trackLinks: boolean;
  version: number | null;
}

const DEFAULTS: SocialSettings = {
  approvalRequired: false,
  approvalSlaHours: null,
  trackLinks: true,
  version: null,
};

export async function getSettings(companyId: string): Promise<SocialSettings> {
  const { data, error } = await getAdminSupabase()
    .from('social_settings')
    .select('approval_required, approval_sla_hours, track_links, version')
    .eq('company_id', companyId)
    .is('deleted_at', null)
    .maybeSingle();
  if (error) throw new InternalError(error);
  if (!data) return DEFAULTS;
  return {
    approvalRequired: data.approval_required === true,
    approvalSlaHours: typeof data.approval_sla_hours === 'number' ? data.approval_sla_hours : null,
    trackLinks: data.track_links !== false,
    version: Number(data.version),
  };
}

export async function saveSettings(actor: Actor, input: unknown): Promise<SocialSettings> {
  const companyId = need(actor);
  const parsed = settingsInput.safeParse(input);
  if (!parsed.success)
    throw new ValidationError(parsed.error.issues[0]?.message ?? 'The settings are not valid.');
  const d = parsed.data;
  if (!d.approvalRequired && d.approvalSlaHours !== null)
    throw new ValidationError('The hours only apply when approval is required.');
  const row = {
    approval_required: d.approvalRequired,
    approval_sla_hours: d.approvalRequired ? d.approvalSlaHours : null,
    track_links: d.trackLinks,
  };
  const current = await getSettings(companyId);
  const admin = getAdminSupabase();
  if (current.version === null) {
    const { error } = await admin.from('social_settings').insert({ company_id: companyId, ...row });
    if (error) mapIntegrationError(error);
  } else {
    const { error } = await admin
      .from('social_settings')
      .update(row)
      .eq('company_id', companyId)
      .eq('version', current.version)
      .is('deleted_at', null);
    if (error) mapIntegrationError(error);
  }
  await record(companyId, 'social.settings_changed', 'social_settings', null, {
    approvalRequired: d.approvalRequired,
    approvalSlaHours: row.approval_sla_hours,
    trackLinks: d.trackLinks,
  });
  return getSettings(companyId);
}
