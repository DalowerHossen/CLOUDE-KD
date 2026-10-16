// path: services/email/settings-store.ts
// Which providers send a company's e-mail. A company with its own provider uses it; a company without one uses the
// platform providers (in priority order, then the SMTP_* environment as the last fallback) with its own sender name
// and reply-to when it set them.
import 'server-only';
import { z } from 'zod';
import { PLATFORM_SENDER_NAME } from '@/config/email';
import { getService } from '@/lib/container';
import { getServerEnv } from '@/lib/env';
import { InternalError } from '@/lib/errors';
import {
  EMAIL_PROVIDERS,
  type EmailAddress,
  type EmailProviderKind,
  type ProviderSettings,
} from '@/lib/email/types';
import { getAdminSupabase } from '@/lib/supabase/admin';
import type { EncryptedPayload } from '@/types/contracts';

export const settingsRow = z
  .object({
    id: z.string().uuid(),
    company_id: z.string().uuid().nullable(),
    priority: z.number().int(),
    provider: z.enum(['platform', ...EMAIL_PROVIDERS]),
    preset: z.string().nullable(),
    config: z.record(z.unknown()),
    credential: z.unknown().nullable(),
    from_email: z.string().nullable(),
    from_name: z.string(),
    reply_to: z.string().nullable(),
    daily_limit: z.number().int().nullable(),
    monthly_limit: z.number().int().nullable(),
    enabled: z.boolean(),
    last_test_at: z.string().nullable(),
    last_test_ok: z.boolean().nullable(),
    last_error: z.string().nullable(),
  })
  .strip();
export type SettingsRow = z.infer<typeof settingsRow>;

export interface ResolvedProvider {
  settingId: string | null;
  kind: EmailProviderKind;
  settings: ProviderSettings;
  secret: string;
  webhookSecret: string | null;
  from: EmailAddress;
  replyTo: string | null;
  dailyLimit: number | null;
  monthlyLimit: number | null;
  scope: 'tenant' | 'platform' | 'environment';
}

const credentialSchema = z
  .object({ secret: z.string(), webhookSecret: z.string().optional() })
  .strict();
const encrypted = z
  .object({ ciphertext: z.string(), iv: z.string(), tag: z.string(), keyVersion: z.number().int() })
  .strict();

export const scopeOf = (companyId: string | null): string => companyId ?? 'platform';

export async function sealCredential(
  companyId: string | null,
  secret: string,
  webhookSecret?: string,
): Promise<EncryptedPayload> {
  return getService('encryption').encrypt(
    'processor-credentials',
    JSON.stringify({ secret, ...(webhookSecret ? { webhookSecret } : {}) }),
    scopeOf(companyId),
  );
}

export async function openCredential(
  row: SettingsRow,
): Promise<{ secret: string; webhookSecret: string | null }> {
  if (row.credential === null) return { secret: '', webhookSecret: null };
  const plain = await getService('encryption').decrypt(
    'processor-credentials',
    encrypted.parse(row.credential),
    scopeOf(row.company_id),
  );
  const parsed = credentialSchema.parse(JSON.parse(new TextDecoder().decode(plain)));
  return { secret: parsed.secret, webhookSecret: parsed.webhookSecret ?? null };
}

export async function loadRows(companyId: string | null): Promise<SettingsRow[]> {
  let query = getAdminSupabase()
    .from('email_settings')
    .select('*')
    .is('deleted_at', null)
    .order('priority');
  query = companyId ? query.eq('company_id', companyId) : query.is('company_id', null);
  const { data, error } = await query;
  if (error) throw new InternalError(error);
  return z.array(settingsRow).parse(data ?? []);
}

function toSettings(config: Record<string, unknown>): ProviderSettings {
  const s: ProviderSettings = {};
  if (typeof config.host === 'string') s.host = config.host;
  if (typeof config.port === 'number') s.port = config.port;
  if (config.security === 'none' || config.security === 'ssl' || config.security === 'starttls')
    s.security = config.security;
  if (typeof config.username === 'string') s.username = config.username;
  if (typeof config.region === 'string') s.region = config.region;
  if (typeof config.domain === 'string') s.domain = config.domain;
  if (config.eu === true) s.eu = true;
  if (typeof config.messageStream === 'string') s.messageStream = config.messageStream;
  return s;
}

async function resolveRow(
  row: SettingsRow,
  scope: 'tenant' | 'platform',
  override?: { fromName?: string; replyTo?: string | null },
): Promise<ResolvedProvider | null> {
  if (row.provider === 'platform' || !row.from_email) return null;
  const { secret, webhookSecret } = await openCredential(row);
  return {
    settingId: row.id,
    kind: row.provider,
    settings: toSettings(row.config),
    secret,
    webhookSecret,
    from: { email: row.from_email, name: (override?.fromName ?? row.from_name) || undefined },
    replyTo: override?.replyTo ?? row.reply_to,
    dailyLimit: row.daily_limit,
    monthlyLimit: row.monthly_limit,
    scope,
  };
}

/** The last fallback: the SMTP_* variables of the platform environment. */
function environmentProvider(): ResolvedProvider | null {
  const env = getServerEnv();
  if (!env.SMTP_HOST || !env.SMTP_PORT || !env.SMTP_FROM) return null;
  const from = /^(.*)<([^>]+)>$/.exec(env.SMTP_FROM.trim());
  return {
    settingId: null,
    kind: 'smtp',
    settings: {
      host: env.SMTP_HOST,
      port: env.SMTP_PORT,
      security: env.SMTP_PORT === 465 ? 'ssl' : 'starttls',
      username: env.SMTP_USER,
    },
    secret: env.SMTP_PASSWORD ?? '',
    webhookSecret: null,
    from: {
      email: (from?.[2] ?? env.SMTP_FROM).trim(),
      name: from?.[1]?.trim().replace(/^"|"$/g, '') || PLATFORM_SENDER_NAME,
    },
    replyTo: null,
    dailyLimit: null,
    monthlyLimit: null,
    scope: 'environment',
  };
}

export async function resolveChain(companyId: string | null): Promise<ResolvedProvider[]> {
  const out: ResolvedProvider[] = [];
  let override: { fromName?: string; replyTo?: string | null } | undefined;
  if (companyId) {
    const rows = (await loadRows(companyId)).filter((r) => r.enabled);
    const own = rows.filter((r) => r.provider !== 'platform');
    for (const row of own) {
      const r = await resolveRow(row, 'tenant');
      if (r) out.push(r);
    }
    if (out.length > 0) return out;
    const platformOverride = rows.find((r) => r.provider === 'platform');
    if (platformOverride)
      override = {
        fromName: platformOverride.from_name || undefined,
        replyTo: platformOverride.reply_to,
      };
  }
  for (const row of (await loadRows(null)).filter((r) => r.enabled)) {
    const r = await resolveRow(row, 'platform', override);
    if (r) out.push(r);
  }
  const env = environmentProvider();
  if (env) {
    if (override) {
      env.from = { email: env.from.email, name: override.fromName || env.from.name };
      env.replyTo = override.replyTo ?? env.replyTo;
    }
    out.push(env);
  }
  return out;
}
