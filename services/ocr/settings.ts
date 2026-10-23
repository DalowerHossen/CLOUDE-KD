// path: services/ocr/settings.ts
// OCR settings of a company. The Google API key is kept encrypted and is never returned. Switching OCR on needs a key and the
// owner's consent that receipt images are sent to Google Cloud Vision (recorded with the time and the person).
import 'server-only';
import { getService } from '@/lib/container';
import { ConflictError, InternalError, ValidationError } from '@/lib/errors';
import { settingsInput } from '@/lib/ocr/rules';
import { getAdminSupabase } from '@/lib/supabase/admin';
import type { Actor, EncryptedPayload } from '@/types/contracts';
import { mapIntegrationError } from '@/services/publicapi/db-errors';

export interface OcrSettings {
  enabled: boolean;
  hasKey: boolean;
  keyLast4: string | null;
  dateOrder: 'dmy' | 'mdy';
  languageHints: string[];
  dailyLimit: number;
  consentAt: string | null;
  version: number | null;
}

const DEFAULTS: OcrSettings = {
  enabled: false,
  hasKey: false,
  keyLast4: null,
  dateOrder: 'dmy',
  languageHints: [],
  dailyLimit: 200,
  consentAt: null,
  version: null,
};

const COLUMNS =
  'enabled, api_key_enc, key_last4, date_order, language_hints, daily_limit, consent_at, version';

export async function getSettings(companyId: string): Promise<OcrSettings> {
  const { data, error } = await getAdminSupabase()
    .from('ocr_settings')
    .select(COLUMNS)
    .eq('company_id', companyId)
    .is('deleted_at', null)
    .maybeSingle();
  if (error) throw new InternalError(error);
  if (!data) return DEFAULTS;
  return {
    enabled: data.enabled === true,
    hasKey: data.api_key_enc !== null,
    keyLast4: data.key_last4 === null ? null : String(data.key_last4),
    dateOrder: data.date_order === 'mdy' ? 'mdy' : 'dmy',
    languageHints: ((data.language_hints as string[] | null) ?? []).map(String),
    dailyLimit: Number(data.daily_limit),
    consentAt: data.consent_at === null ? null : String(data.consent_at),
    version: Number(data.version),
  };
}

/** The key for the reading code only. Never returned by a route. */
export async function keyOf(
  companyId: string,
): Promise<{ key: string; hints: string[]; dateOrder: 'dmy' | 'mdy'; dailyLimit: number } | null> {
  const { data, error } = await getAdminSupabase()
    .from('ocr_settings')
    .select(COLUMNS)
    .eq('company_id', companyId)
    .eq('enabled', true)
    .is('deleted_at', null)
    .maybeSingle();
  if (error) throw new InternalError(error);
  if (!data || data.api_key_enc === null) return null;
  const key = new TextDecoder().decode(
    await getService('encryption').decrypt(
      'oauth-tokens',
      data.api_key_enc as EncryptedPayload,
      companyId,
    ),
  );
  return {
    key,
    hints: ((data.language_hints as string[] | null) ?? []).map(String),
    dateOrder: data.date_order === 'mdy' ? 'mdy' : 'dmy',
    dailyLimit: Number(data.daily_limit),
  };
}

export async function saveSettings(actor: Actor, input: unknown): Promise<OcrSettings> {
  const companyId = actor.companyId;
  if (!companyId) throw new ValidationError('A company is needed.');
  const parsed = settingsInput.safeParse(input);
  if (!parsed.success)
    throw new ValidationError(parsed.error.issues[0]?.message ?? 'The settings are not valid.');
  const d = parsed.data;
  const current = await getSettings(companyId);
  if (d.enabled && !current.hasKey && d.apiKey === undefined)
    throw new ValidationError('Paste the Google API key to switch OCR on.');
  if (d.enabled && current.consentAt === null && !d.consent)
    throw new ValidationError(
      'Agree that receipt images are sent to Google Cloud Vision to switch OCR on.',
    );
  const row: Record<string, unknown> = {
    enabled: d.enabled,
    date_order: d.dateOrder,
    language_hints: d.languageHints,
    daily_limit: d.dailyLimit,
  };
  if (d.apiKey !== undefined) {
    row.api_key_enc = await getService('encryption').encrypt('oauth-tokens', d.apiKey, companyId);
    row.key_last4 = d.apiKey.slice(-4);
  }
  if (d.enabled && current.consentAt === null) {
    row.consent_at = new Date().toISOString();
    row.consent_by = actor.userId;
  }
  const admin = getAdminSupabase();
  if (current.version === null) {
    const { error } = await admin.from('ocr_settings').insert({ company_id: companyId, ...row });
    if (error) mapIntegrationError(error);
  } else {
    const { data, error } = await admin
      .from('ocr_settings')
      .update(row)
      .eq('company_id', companyId)
      .eq('version', current.version)
      .is('deleted_at', null)
      .select('id');
    if (error) mapIntegrationError(error);
    if ((data ?? []).length === 0)
      throw new ConflictError('The settings changed. Reload and try again.');
  }
  await getService('audit').record({
    action: 'ocr.settings_changed',
    resourceType: 'ocr_settings',
    resourceId: null,
    companyId,
    metadata: {
      enabled: d.enabled,
      keyChanged: d.apiKey !== undefined,
      dateOrder: d.dateOrder,
      dailyLimit: d.dailyLimit,
    },
  });
  return getSettings(companyId);
}
