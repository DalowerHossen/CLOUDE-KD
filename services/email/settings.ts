// path: services/email/settings.ts
// E-mail settings for a company (own provider or the platform with its own sender name) and for the platform
// (super admin): save, delete, connection test, test message, suppression list, usage and the message log.
import 'server-only';
import { z } from 'zod';
import { getService } from '@/lib/container';
import { InternalError, NotFoundError, ValidationError } from '@/lib/errors';
import { createAdapter } from '@/lib/email/adapters';
import { SMTP_PRESETS, presetById } from '@/lib/email/presets';
import { EMAIL_PROVIDERS, PermanentEmailError, TemporaryEmailError } from '@/lib/email/types';
import { isValidDomain, type DomainReport } from '@/lib/email/dns';
import { resolvePublicAddresses } from '@/lib/security/ssrf';
import { getAdminSupabase } from '@/lib/supabase/admin';
import type { Actor } from '@/types/contracts';
import { checkDomain } from './dns-check';
import { loadRows, openCredential, sealCredential, type SettingsRow } from './settings-store';
import { renderTemplate } from './templates';

const email = z.string().trim().toLowerCase().email().max(254);

export const providerInputSchema = z
  .object({
    slot: z.number().int().min(1).max(3).default(1),
    provider: z.enum(['platform', ...EMAIL_PROVIDERS]),
    preset: z
      .string()
      .regex(/^[a-z0-9_]{2,30}$/)
      .nullable()
      .default(null),
    host: z.string().trim().max(253).optional(),
    port: z.number().int().min(1).max(65535).optional(),
    security: z.enum(['none', 'ssl', 'starttls']).optional(),
    username: z.string().trim().max(254).optional(),
    region: z
      .string()
      .trim()
      .regex(/^[a-z0-9-]{4,30}$/)
      .optional(),
    domain: z.string().trim().max(253).optional(),
    eu: z.boolean().optional(),
    messageStream: z.string().trim().max(60).optional(),
    secret: z.string().min(1).max(2000).optional(),
    webhookSecret: z.string().min(1).max(2000).optional(),
    fromEmail: email.nullable().default(null),
    fromName: z.string().trim().max(120).default(''),
    replyTo: email.nullable().default(null),
    dailyLimit: z.number().int().min(1).max(10_000_000).nullable().default(null),
    monthlyLimit: z.number().int().min(1).max(100_000_000).nullable().default(null),
    enabled: z.boolean().default(true),
  })
  .strict();
export type ProviderInput = z.infer<typeof providerInputSchema>;

export const emailActionSchema = z.discriminatedUnion('action', [
  z
    .object({ action: z.literal('save_provider') })
    .merge(providerInputSchema.omit({}).partial({ slot: true }))
    .strict(),
  z.object({ action: z.literal('delete_provider'), id: z.string().uuid() }).strict(),
  z.object({ action: z.literal('test_connection'), id: z.string().uuid() }).strict(),
  z.object({ action: z.literal('send_test'), id: z.string().uuid(), to: email }).strict(),
  z
    .object({
      action: z.literal('check_domain'),
      domain: z.string().trim().min(4).max(253),
      provider: z.string().regex(/^[a-z0-9_]{2,30}$/),
    })
    .strict(),
  z
    .object({ action: z.literal('suppress'), email, note: z.string().trim().max(300).default('') })
    .strict(),
  z.object({ action: z.literal('unsuppress'), id: z.string().uuid() }).strict(),
]);
export type EmailAction = z.infer<typeof emailActionSchema>;

export interface SettingsView {
  providers: {
    id: string;
    slot: number;
    provider: string;
    preset: string | null;
    host: string | null;
    username: string | null;
    fromEmail: string | null;
    fromName: string;
    replyTo: string | null;
    enabled: boolean;
    hasSecret: boolean;
    dailyLimit: number | null;
    monthlyLimit: number | null;
    usedToday: number;
    usedMonth: number;
    lastTestAt: string | null;
    lastTestOk: boolean | null;
    lastError: string | null;
  }[];
  presets: { id: string; label: string; note: string | null }[];
  usingPlatform: boolean;
  suppressions: {
    id: string;
    email: string;
    reason: string;
    note: string | null;
    createdAt: string;
  }[];
  log: {
    id: string;
    to: string;
    template: string;
    subject: string;
    status: string;
    delivery: string;
    createdAt: string;
    error: string | null;
  }[];
}

const startOfDay = (): string =>
  new Date(
    Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), new Date().getUTCDate()),
  ).toISOString();
const startOfMonth = (): string =>
  new Date(Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), 1)).toISOString();

async function used(settingId: string, since: string): Promise<number> {
  const { data, error } = await getAdminSupabase().rpc('kd_email_setting_count', {
    p_setting: settingId,
    p_since: since,
  });
  if (error) throw new InternalError(error);
  return z.coerce.number().parse(data ?? 0);
}

export async function settingsView(companyId: string | null): Promise<SettingsView> {
  const admin = getAdminSupabase();
  const rows = await loadRows(companyId);
  let logQuery = admin
    .from('email_outbox')
    .select('id, to_email, template, subject, status, delivery_status, created_at, error')
    .is('deleted_at', null)
    .order('created_at', { ascending: false })
    .limit(50);
  logQuery = companyId ? logQuery.eq('company_id', companyId) : logQuery.is('company_id', null);
  let supQuery = admin
    .from('email_suppressions')
    .select('id, email, reason, note, created_at')
    .is('deleted_at', null)
    .order('created_at', { ascending: false })
    .limit(200);
  supQuery = companyId ? supQuery.eq('company_id', companyId) : supQuery.is('company_id', null);
  const [log, sup] = await Promise.all([logQuery, supQuery]);
  if (log.error) throw new InternalError(log.error);
  if (sup.error) throw new InternalError(sup.error);
  const providers = await Promise.all(
    rows.map(async (r) => ({
      id: r.id,
      slot: r.priority,
      provider: r.provider,
      preset: r.preset,
      host: typeof r.config.host === 'string' ? r.config.host : null,
      username: typeof r.config.username === 'string' ? r.config.username : null,
      fromEmail: r.from_email,
      fromName: r.from_name,
      replyTo: r.reply_to,
      enabled: r.enabled,
      hasSecret: r.credential !== null,
      dailyLimit: r.daily_limit,
      monthlyLimit: r.monthly_limit,
      usedToday: await used(r.id, startOfDay()),
      usedMonth: await used(r.id, startOfMonth()),
      lastTestAt: r.last_test_at,
      lastTestOk: r.last_test_ok,
      lastError: r.last_error,
    })),
  );
  return {
    providers,
    presets: SMTP_PRESETS.map((p) => ({ id: p.id, label: p.label, note: p.note ?? null })),
    usingPlatform:
      companyId !== null && providers.every((p) => p.provider === 'platform' || !p.enabled),
    suppressions: (sup.data ?? []).map((s) => ({
      id: String(s.id),
      email: String(s.email),
      reason: String(s.reason),
      note: s.note ? String(s.note) : null,
      createdAt: String(s.created_at),
    })),
    log: (log.data ?? []).map((l) => ({
      id: String(l.id),
      to: String(l.to_email),
      template: String(l.template),
      subject: String(l.subject),
      status: String(l.status),
      delivery: String(l.delivery_status),
      createdAt: String(l.created_at),
      error: l.error ? String(l.error) : null,
    })),
  };
}

async function validateInput(input: ProviderInput, companyId: string | null): Promise<void> {
  if (input.provider === 'platform') {
    if (!companyId) throw new ValidationError('The platform itself has no "use platform" setting.');
    return;
  }
  if (!input.fromEmail) throw new ValidationError('Enter the sender address.');
  if (input.domain && !isValidDomain(input.domain))
    throw new ValidationError('Enter the sending domain as example.com.');
  if (input.provider === 'smtp') {
    if (!input.host || !input.port)
      throw new ValidationError('Enter the mail server and its port.');
    try {
      await resolvePublicAddresses(input.host);
    } catch {
      throw new ValidationError('The mail server must be a public address that resolves in DNS.');
    }
  }
  if (input.provider === 'ses' && !input.region)
    throw new ValidationError('Enter the Amazon SES region, for example eu-west-1.');
  if (input.provider === 'mailgun' && !input.domain)
    throw new ValidationError('Enter the Mailgun sending domain.');
  if (input.preset && !presetById(input.preset))
    throw new ValidationError('Unknown provider preset.');
}

function configOf(input: ProviderInput): Record<string, unknown> {
  const config: Record<string, unknown> = {};
  for (const key of [
    'host',
    'port',
    'security',
    'username',
    'region',
    'domain',
    'eu',
    'messageStream',
  ] as const) {
    if (input[key] !== undefined) config[key] = input[key];
  }
  return config;
}

async function findRow(id: string, companyId: string | null): Promise<SettingsRow> {
  const rows = await loadRows(companyId);
  const row = rows.find((r) => r.id === id);
  if (!row) throw new NotFoundError();
  return row;
}

/** Runs an action for the company (or for the platform when companyId is null). */
export async function runEmailAction(
  actor: Actor,
  companyId: string | null,
  input: EmailAction,
): Promise<unknown> {
  const admin = getAdminSupabase();
  const audit = getService('audit');
  switch (input.action) {
    case 'save_provider': {
      const { action: kind, ...rest } = input;
      void kind;
      const data = providerInputSchema.parse(rest);
      await validateInput(data, companyId);
      const existing = (await loadRows(companyId)).find((r) => r.priority === data.slot);
      if (!existing && data.provider !== 'platform' && !data.secret && data.provider !== 'smtp')
        throw new ValidationError('Enter the key of the provider.');
      const values: Record<string, unknown> = {
        company_id: companyId,
        priority: data.slot,
        provider: data.provider,
        preset: data.preset,
        config: configOf(data),
        from_email: data.provider === 'platform' ? null : data.fromEmail,
        from_name: data.fromName,
        reply_to: data.replyTo,
        daily_limit: data.dailyLimit,
        monthly_limit: data.monthlyLimit,
        enabled: data.enabled,
        last_test_ok: null,
        last_error: null,
      };
      if (data.provider === 'platform') {
        values.credential = null;
      } else if (data.secret) {
        values.credential = await sealCredential(companyId, data.secret, data.webhookSecret);
      } else if (existing && data.webhookSecret) {
        const current = await openCredential(existing);
        values.credential = await sealCredential(companyId, current.secret, data.webhookSecret);
      }
      // A tenant uses either its own providers or the platform: switching removes the other kind (feature 475).
      if (companyId) {
        const others = (await loadRows(companyId)).filter((r) =>
          data.provider === 'platform' ? r.provider !== 'platform' : r.provider === 'platform',
        );
        for (const o of others)
          await admin
            .from('email_settings')
            .update({ deleted_at: new Date().toISOString() })
            .eq('id', o.id);
      }
      const result = existing
        ? await admin
            .from('email_settings')
            .update(values)
            .eq('id', existing.id)
            .select('id')
            .single()
        : await admin.from('email_settings').insert(values).select('id').single();
      if (result.error) throw new InternalError(result.error);
      await audit.record({
        action: 'email.settings_saved',
        resourceType: 'email_settings',
        resourceId: String(result.data.id),
        companyId,
        metadata: { provider: data.provider, slot: data.slot, by: actor.userId },
      });
      return { id: String(result.data.id) };
    }
    case 'delete_provider': {
      const row = await findRow(input.id, companyId);
      const { error } = await admin
        .from('email_settings')
        .update({ deleted_at: new Date().toISOString() })
        .eq('id', row.id);
      if (error) throw new InternalError(error);
      await audit.record({
        action: 'email.settings_deleted',
        resourceType: 'email_settings',
        resourceId: row.id,
        companyId,
        metadata: { provider: row.provider },
      });
      return { done: true };
    }
    case 'test_connection':
    case 'send_test': {
      const row = await findRow(input.id, companyId);
      if (row.provider === 'platform' || !row.from_email)
        throw new ValidationError(
          'This setting uses the platform provider; test it from the platform settings.',
        );
      const { secret } = await openCredential(row);
      const config = row.config;
      const adapter = createAdapter(
        row.provider,
        {
          host: typeof config.host === 'string' ? config.host : undefined,
          port: typeof config.port === 'number' ? config.port : undefined,
          security:
            config.security === 'none' ||
            config.security === 'ssl' ||
            config.security === 'starttls'
              ? config.security
              : undefined,
          username: typeof config.username === 'string' ? config.username : undefined,
          region: typeof config.region === 'string' ? config.region : undefined,
          domain: typeof config.domain === 'string' ? config.domain : undefined,
          eu: config.eu === true,
          messageStream:
            typeof config.messageStream === 'string' ? config.messageStream : undefined,
        },
        secret,
      );
      let failure: string | null = null;
      try {
        if (input.action === 'test_connection') {
          await adapter.verify();
        } else {
          const rendered = await renderTemplate('system.test', {
            sentBy: companyId ?? 'the platform',
          });
          await adapter.send({
            from: { email: row.from_email, name: row.from_name || undefined },
            to: input.to,
            replyTo: row.reply_to,
            subject: rendered.subject,
            html: rendered.html,
            text: rendered.text,
            headers: { 'Auto-Submitted': 'auto-generated' },
          });
        }
      } catch (error) {
        failure =
          error instanceof PermanentEmailError || error instanceof TemporaryEmailError
            ? error.message
            : 'The test failed.';
      }
      await admin
        .from('email_settings')
        .update({
          last_test_at: new Date().toISOString(),
          last_test_ok: failure === null,
          last_error: failure,
        })
        .eq('id', row.id);
      if (failure) throw new ValidationError(failure);
      return { ok: true };
    }
    case 'check_domain':
      return checkDomain(input.domain, input.provider) satisfies Promise<DomainReport>;
    case 'suppress': {
      const { error } = await admin.from('email_suppressions').insert({
        company_id: companyId,
        email: input.email,
        reason: 'manual',
        note: input.note || null,
        created_by: actor.userId,
      });
      if (error && error.code !== '23505') throw new InternalError(error);
      await audit.record({
        action: 'email.suppressed',
        resourceType: 'email_suppression',
        resourceId: null,
        companyId,
        metadata: { by: actor.userId },
      });
      return { done: true };
    }
    case 'unsuppress': {
      let query = admin
        .from('email_suppressions')
        .update({ deleted_at: new Date().toISOString() })
        .eq('id', input.id)
        .is('deleted_at', null);
      query = companyId ? query.eq('company_id', companyId) : query.is('company_id', null);
      const { data, error } = await query.select('id');
      if (error) throw new InternalError(error);
      if (!data || data.length === 0) throw new NotFoundError();
      await audit.record({
        action: 'email.unsuppressed',
        resourceType: 'email_suppression',
        resourceId: input.id,
        companyId,
        metadata: { by: actor.userId },
      });
      return { done: true };
    }
  }
}
