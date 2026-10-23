// path: services/email/sender.ts
// Sending from the outbox: provider chain with fallback, daily and monthly limits, plan limit and ramp-up for new
// companies, retry with growing waits, and permanent-failure handling.
import 'server-only';
import { z } from 'zod';
import {
  DEFAULT_DAILY_LIMIT,
  MAX_ATTEMPTS,
  RAMP_UP_DAILY_LIMIT,
  RAMP_UP_DAYS,
  RETRY_MINUTES,
  UNSUBSCRIBABLE_PREFIXES,
} from '@/config/email';
import { tryGetService } from '@/lib/container';
import { getPublicEnv } from '@/lib/env/public';
import { InternalError } from '@/lib/errors';
import { createLogger } from '@/lib/logger';
import { createAdapter } from '@/lib/email/adapters';
import { PermanentEmailError, type EmailAdapter, type OutgoingMessage } from '@/lib/email/types';
import { getAdminSupabase } from '@/lib/supabase/admin';
import { resolveChain, type ResolvedProvider } from './settings-store';

const log = createLogger({ component: 'email-sender' });

export const outboxRow = z
  .object({
    id: z.string().uuid(),
    company_id: z.string().uuid().nullable(),
    template: z.string(),
    to_email: z.string(),
    subject: z.string(),
    body_html: z.string(),
    body_text: z.string(),
    tracking_token: z.string().nullable(),
    attempts: z.number().int(),
  })
  .strip();
export type OutboxRow = z.infer<typeof outboxRow>;

const startOfDay = (d = new Date()): Date =>
  new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
const startOfMonth = (d = new Date()): Date =>
  new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1));
const nextDay = (): string => new Date(startOfDay().getTime() + 86_400_000 + 60_000).toISOString();

// Adapters can be replaced in checks.
let adapterFactory: (p: ResolvedProvider) => EmailAdapter = (p) =>
  createAdapter(p.kind, p.settings, p.secret);
export function setAdapterFactory(factory: ((p: ResolvedProvider) => EmailAdapter) | null): void {
  adapterFactory = factory ?? ((p) => createAdapter(p.kind, p.settings, p.secret));
}

/** Daily limit of a company: the plan entitlement, lowered while the company is new (feature 474). */
export async function companyDailyLimit(companyId: string): Promise<number> {
  let limit = DEFAULT_DAILY_LIMIT;
  const entitlement = tryGetService('entitlement');
  if (entitlement) {
    const plan = await entitlement.limit(companyId, 'email.daily_limit').catch(() => null);
    if (typeof plan === 'number') limit = plan;
  }
  const { data } = await getAdminSupabase()
    .from('companies')
    .select('created_at')
    .eq('id', companyId)
    .maybeSingle();
  if (
    data?.created_at &&
    Date.now() - Date.parse(String(data.created_at)) < RAMP_UP_DAYS * 86_400_000
  ) {
    limit = Math.min(limit, RAMP_UP_DAILY_LIMIT);
  }
  return limit;
}

async function count(
  fn: 'kd_email_sent_count' | 'kd_email_setting_count',
  args: Record<string, unknown>,
): Promise<number> {
  const { data, error } = await getAdminSupabase().rpc(fn, args);
  if (error) throw new InternalError(error);
  return z.coerce.number().parse(data ?? 0);
}

async function overLimit(provider: ResolvedProvider): Promise<boolean> {
  if (!provider.settingId) return false;
  if (
    provider.dailyLimit &&
    (await count('kd_email_setting_count', {
      p_setting: provider.settingId,
      p_since: startOfDay().toISOString(),
    })) >= provider.dailyLimit
  )
    return true;
  if (
    provider.monthlyLimit &&
    (await count('kd_email_setting_count', {
      p_setting: provider.settingId,
      p_since: startOfMonth().toISOString(),
    })) >= provider.monthlyLimit
  )
    return true;
  return false;
}

function headersFor(row: OutboxRow): Record<string, string> {
  const headers: Record<string, string> = {
    'Auto-Submitted': 'auto-generated',
    'X-Entity-Ref-ID': row.id,
  };
  if (row.tracking_token && UNSUBSCRIBABLE_PREFIXES.some((p) => row.template.startsWith(p))) {
    const base = getPublicEnv().NEXT_PUBLIC_APP_URL.replace(/\/+$/, '');
    headers['List-Unsubscribe'] = `<${base}/api/email/unsubscribe/${row.tracking_token}>`;
    headers['List-Unsubscribe-Post'] = 'List-Unsubscribe=One-Click';
  }
  return headers;
}

async function report(
  row: OutboxRow,
  status: 'sent' | 'failed' | 'retry' | 'defer',
  extra: {
    provider?: string;
    messageId?: string | null;
    error?: string;
    retryAt?: string;
    setting?: string | null;
  } = {},
): Promise<void> {
  const { error } = await getAdminSupabase().rpc('kd_email_result', {
    p_id: row.id,
    p_status: status,
    p_provider: extra.provider ?? null,
    p_message_id: extra.messageId ?? null,
    p_error: extra.error ?? null,
    p_retry_at: extra.retryAt ?? null,
    p_setting: extra.setting ?? null,
  });
  if (error) throw new InternalError(error);
}

const retryAt = (attempts: number): string =>
  new Date(
    Date.now() + (RETRY_MINUTES[Math.min(attempts - 1, RETRY_MINUTES.length - 1)] ?? 240) * 60_000,
  ).toISOString();

/** One send attempt for a claimed message. Never throws for a delivery problem: the outcome is written to the outbox. */
export async function deliver(row: OutboxRow): Promise<'sent' | 'retry' | 'failed' | 'defer'> {
  try {
    if (row.company_id) {
      const used = await count('kd_email_sent_count', {
        p_company: row.company_id,
        p_since: startOfDay().toISOString(),
      });
      if (used >= (await companyDailyLimit(row.company_id))) {
        await report(row, 'defer', {
          error: 'The daily sending limit of the company is reached.',
          retryAt: nextDay(),
        });
        return 'defer';
      }
    }
    const chain = await resolveChain(row.company_id);
    if (chain.length === 0) {
      await report(row, 'failed', { error: 'No e-mail provider is set up.' });
      return 'failed';
    }
    let lastTemporary = '';
    let allLimited = true;
    for (const provider of chain) {
      if (await overLimit(provider)) continue;
      allLimited = false;
      const message: OutgoingMessage = {
        from: provider.from,
        to: row.to_email,
        replyTo: provider.replyTo,
        subject: row.subject,
        html: row.body_html,
        text: row.body_text,
        headers: headersFor(row),
      };
      try {
        const result = await adapterFactory(provider).send(message);
        await report(row, 'sent', {
          provider: provider.kind,
          messageId: result.providerMessageId,
          setting: provider.settingId,
        });
        return 'sent';
      } catch (error) {
        if (error instanceof PermanentEmailError && error.scope === 'message') {
          await report(row, 'failed', {
            provider: provider.kind,
            error: error.message,
            setting: provider.settingId,
          });
          return 'failed';
        }
        // Temporary trouble or wrong provider settings: the next provider of the chain gets the message.
        lastTemporary = error instanceof Error ? error.message : 'The provider failed.';
        log.warn('e-mail provider failed', {
          provider: provider.kind,
          scope: provider.scope,
          message: lastTemporary,
          config: error instanceof PermanentEmailError,
        });
      }
    }
    if (allLimited) {
      await report(row, 'defer', {
        error: 'All providers reached their sending limit.',
        retryAt: nextDay(),
      });
      return 'defer';
    }
    if (row.attempts >= MAX_ATTEMPTS) {
      await report(row, 'failed', { error: lastTemporary || 'The message could not be sent.' });
      return 'failed';
    }
    await report(row, 'retry', { error: lastTemporary, retryAt: retryAt(row.attempts) });
    return 'retry';
  } catch (error) {
    log.error('e-mail delivery crashed', { id: row.id, error });
    await report(row, row.attempts >= MAX_ATTEMPTS ? 'failed' : 'retry', {
      error: 'Internal error while sending.',
      retryAt: retryAt(row.attempts),
    }).catch(() => undefined);
    return 'retry';
  }
}

export async function processQueue(
  limit = 25,
  onlyId?: string,
): Promise<{ sent: number; retried: number; failed: number; deferred: number }> {
  const { data, error } = await getAdminSupabase().rpc('kd_email_claim', {
    p_limit: limit,
    ...(onlyId ? { p_id: onlyId } : {}),
  });
  if (error) throw new InternalError(error);
  const totals = { sent: 0, retried: 0, failed: 0, deferred: 0 };
  const rows = z.array(outboxRow).parse(data ?? []);
  // Five at a time keeps the provider rate (feature 463) and the request time short.
  for (let i = 0; i < rows.length; i += 5) {
    const results = await Promise.all(rows.slice(i, i + 5).map((r) => deliver(r)));
    for (const r of results) {
      if (r === 'sent') totals.sent += 1;
      else if (r === 'failed') totals.failed += 1;
      else if (r === 'defer') totals.deferred += 1;
      else totals.retried += 1;
    }
  }
  return totals;
}
