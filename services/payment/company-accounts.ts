// path: services/payment/company-accounts.ts
// A company's own merchant account at a processor (S16_040). Platform staff save its credentials (sealed like the platform's),
// test the connection and switch the account on. While an account is active, payments of that company that are routed to
// the processor use it and the money goes to that merchant; every follow-up call (capture, refund, webhook) uses the
// account the payment was made with. Without an active account the platform's own account is used, as before.
import 'server-only';
import { getService } from '@/lib/container';
import {
  ConflictError,
  ForbiddenError,
  InternalError,
  NotFoundError,
  ValidationError,
} from '@/lib/errors';
import { logger } from '@/lib/logger';
import { getContext } from '@/lib/logger/correlation';
import {
  describeCredentials,
  openCredentials,
  sealCredentials,
  type StoredCredentialRow,
} from '@/lib/payment/credentials';
import { COMPANY_ACCOUNT_OVERLAY, type AccountView } from '@/lib/payment/company-accounts-rules';
import { defaultMode } from '@/lib/payment/modes';
import { hasAdapter, isKnownProcessor, listRegistry, loadAdapter } from '@/lib/payment/registry';
import { credentialFormFields } from '@/schemas/payment/credentials';
import { getAdminSupabase } from '@/lib/supabase/admin';
import type { Actor, ProcessorEnvironment, ProcessorId } from '@/types/contracts';
import { getProcessorRow, loadCurrentCredentials } from './credential-store';
import { mapPaymentDbError } from './rpc';

const COLUMNS =
  'id, company_id, processor_id, environment, status, ciphertext, iv, tag, key_version, field_keys, last_chars, application_id, merchant_reference, last_test_at, last_test_ok, last_test_message, created_by, version';

interface Row extends StoredCredentialRow {
  id: string;
  company_id: string;
  processor_id: string;
  environment: ProcessorEnvironment;
  status: 'active' | 'disabled';
  field_keys: string[];
  last_chars: Record<string, string | null>;
  application_id: string | null;
  merchant_reference: string | null;
  last_test_at: string | null;
  last_test_ok: boolean | null;
  last_test_message: string | null;
  version: number;
}

/** Credentials of a company account; for an overlay processor the platform's own credentials sit underneath. */
async function valuesOfAccount(
  row: Row,
  platform: () => Promise<{ values: Record<string, string>; environment: ProcessorEnvironment }>,
): Promise<{ values: Record<string, string>; environment: ProcessorEnvironment }> {
  const own = await openCredentials(row.processor_id as ProcessorId, row);
  if (!(row.processor_id in COMPANY_ACCOUNT_OVERLAY))
    return { values: own, environment: row.environment };
  const base = await platform();
  return { values: { ...base.values, ...own }, environment: base.environment };
}

export interface ResolvedCredentials {
  values: Record<string, string>;
  environment: ProcessorEnvironment;
  /** The company account used, or null for the platform's own account. */
  accountId: string | null;
}

function requireSuperAdmin(actor: Actor): void {
  if (actor.role !== 'super_admin') throw new ForbiddenError();
}

const clean = (message: string): string => message.replace(/\s+/g, ' ').slice(0, 300);

async function rowById(id: string, includeRemoved = false): Promise<Row> {
  const query = getAdminSupabase().from('company_processor_accounts').select(COLUMNS).eq('id', id);
  const { data, error } = await (
    includeRemoved ? query : query.is('deleted_at', null)
  ).maybeSingle();
  if (error) throw mapPaymentDbError(error);
  if (!data) throw new NotFoundError();
  return data as Row;
}

/** The active account of a company at a processor, or null. */
export async function activeAccountOf(companyId: string, processorId: string): Promise<Row | null> {
  const { data, error } = await getAdminSupabase()
    .from('company_processor_accounts')
    .select(COLUMNS)
    .eq('company_id', companyId)
    .eq('processor_id', processorId)
    .eq('status', 'active')
    .is('deleted_at', null)
    .maybeSingle();
  if (error) throw mapPaymentDbError(error);
  return (data as Row | null) ?? null;
}

/**
 * Credentials for one processor call. With `accountId` (a payment that was made with an account) exactly that account is
 * used, whatever its state; without it the company's active account is used when it has one; otherwise the platform's.
 */
export async function resolveCredentials(input: {
  processorId: ProcessorId;
  companyId: string | null;
  accountId?: string | null;
  platform: () => Promise<{ values: Record<string, string>; environment: ProcessorEnvironment }>;
}): Promise<ResolvedCredentials> {
  let row: Row | null = null;
  if (input.accountId) {
    row = await rowById(input.accountId);
    if (
      row.processor_id !== input.processorId ||
      (input.companyId && row.company_id !== input.companyId)
    )
      throw new NotFoundError();
  } else if (input.companyId) {
    row = await activeAccountOf(input.companyId, input.processorId);
  }
  if (row) {
    const used = await valuesOfAccount(row, input.platform);
    return { values: used.values, environment: used.environment, accountId: row.id };
  }
  const platform = await input.platform();
  return { values: platform.values, environment: platform.environment, accountId: null };
}

async function companyNames(ids: readonly string[]): Promise<Map<string, string>> {
  const names = new Map<string, string>();
  if (ids.length === 0) return names;
  const { data, error } = await getAdminSupabase()
    .from('companies')
    .select('id, name')
    .in('id', [...new Set(ids)]);
  if (error) throw new InternalError(error);
  for (const c of data ?? []) names.set(String(c.id), String(c.name));
  return names;
}

async function viewOf(row: Row, name: string): Promise<AccountView> {
  const adapter = await loadAdapter(row.processor_id as ProcessorId);
  return {
    id: row.id,
    companyId: row.company_id,
    companyName: name,
    processorId: row.processor_id,
    environment: row.environment,
    status: row.status,
    merchantReference: row.merchant_reference,
    fields: describeCredentials(adapter, row.field_keys, row.last_chars),
    lastTestAt: row.last_test_at,
    lastTestOk: row.last_test_ok,
    lastTestMessage: row.last_test_message,
    version: row.version,
  };
}

export async function listAccounts(): Promise<AccountView[]> {
  const { data, error } = await getAdminSupabase()
    .from('company_processor_accounts')
    .select(COLUMNS)
    .is('deleted_at', null)
    .order('created_at', { ascending: false })
    .limit(300);
  if (error) throw mapPaymentDbError(error);
  const rows = (data ?? []) as Row[];
  const names = await companyNames(rows.map((r) => r.company_id));
  const out: AccountView[] = [];
  for (const r of rows) {
    if (!hasAdapter(r.processor_id as ProcessorId)) continue;
    out.push(await viewOf(r, names.get(r.company_id) ?? ''));
  }
  return out;
}

async function audit(
  actor: Actor,
  action: string,
  row: Row,
  extra: Record<string, unknown> = {},
): Promise<void> {
  await getService('audit').record({
    action,
    resourceType: 'company_processor_account',
    resourceId: row.id,
    companyId: row.company_id,
    metadata: {
      by: actor.userId,
      processor: row.processor_id,
      environment: row.environment,
      ...extra,
    },
  });
}

/** Saves (or replaces) the credentials of a company at a processor. The account stays off until a new test passes. */
export async function saveAccount(
  actor: Actor,
  input: {
    companyId: string;
    processorId: string;
    environment: ProcessorEnvironment;
    values: Record<string, string>;
    merchantReference?: string | undefined;
    applicationId?: string | undefined;
  },
): Promise<AccountView> {
  requireSuperAdmin(actor);
  if (!isKnownProcessor(input.processorId) || !hasAdapter(input.processorId))
    throw new ValidationError('This processor has no adapter in this build yet.');
  const adapter = await loadAdapter(input.processorId);
  const values: Record<string, string> = {};
  for (const [key, value] of Object.entries(input.values))
    if (value.trim() !== '') values[key] = value.trim();
  const sealed = await sealCredentials(adapter, values, COMPANY_ACCOUNT_OVERLAY[input.processorId]);
  const db = getAdminSupabase();
  const company = await db
    .from('companies')
    .select('id, name')
    .eq('id', input.companyId)
    .is('deleted_at', null)
    .maybeSingle();
  if (company.error) throw new InternalError(company.error);
  if (!company.data) throw new NotFoundError();
  const existing = await db
    .from('company_processor_accounts')
    .select('id, version')
    .eq('company_id', input.companyId)
    .eq('processor_id', input.processorId)
    .is('deleted_at', null)
    .maybeSingle();
  if (existing.error) throw mapPaymentDbError(existing.error);
  const fields = {
    environment: input.environment,
    status: 'disabled' as const,
    ciphertext: sealed.payload.ciphertext,
    iv: sealed.payload.iv,
    tag: sealed.payload.tag,
    key_version: sealed.payload.keyVersion,
    field_keys: sealed.fieldKeys,
    last_chars: sealed.lastChars,
    last_test_at: null,
    last_test_ok: null,
    last_test_message: null,
    merchant_reference: input.merchantReference ?? null,
    application_id: input.applicationId ?? null,
  };
  const saved = existing.data
    ? await db
        .from('company_processor_accounts')
        .update(fields)
        .eq('id', String(existing.data.id))
        .select(COLUMNS)
        .single()
    : await db
        .from('company_processor_accounts')
        .insert({
          ...fields,
          company_id: input.companyId,
          processor_id: input.processorId,
          created_by: actor.userId,
        })
        .select(COLUMNS)
        .single();
  if (saved.error) throw mapPaymentDbError(saved.error);
  const row = saved.data as Row;
  await audit(actor, 'company_processor_account.saved', row, { fieldKeys: sealed.fieldKeys });
  return viewOf(row, String(company.data.name));
}

/** Calls the adapter with the account's credentials and records the result. */
export async function testAccount(
  actor: Actor,
  id: string,
): Promise<{ ok: boolean; message: string }> {
  requireSuperAdmin(actor);
  const row = await rowById(id);
  const processorId = row.processor_id as ProcessorId;
  const adapter = await loadAdapter(processorId);
  const platform = await getAdminSupabase()
    .from('processors')
    .select('active_mode')
    .eq('processor_id', processorId)
    .is('deleted_at', null)
    .maybeSingle();
  if (platform.error) throw mapPaymentDbError(platform.error);
  const mode = String(platform.data?.active_mode ?? defaultMode(adapter).id);
  let ok = false;
  let message = '';
  try {
    const used = await valuesOfAccount(row, async () => ({
      values: (await loadCurrentCredentials(processorId)).values,
      environment: (await getProcessorRow(processorId)).environment,
    }));
    const result = await adapter.testConnection({
      credentials: used.values,
      environment: used.environment,
      mode,
      correlationId: getContext()?.correlationId ?? 'none',
    });
    ok = result.ok;
    message = clean(result.message);
    if (ok && processorId === 'stripe') {
      // A connected Stripe account takes payments only when card payments are active on it.
      const { connectedAccountReady } = await import('./stripe-connect');
      const ready = await connectedAccountReady(id);
      ok = ready.ok;
      message = clean(ready.message);
    }
  } catch (error) {
    message = 'The connection test failed.';
    logger.warn('company account test threw', {
      processor: processorId,
      error: error instanceof Error ? error.name : 'unknown',
    });
  }
  const { error } = await getAdminSupabase()
    .from('company_processor_accounts')
    .update({
      last_test_at: new Date().toISOString(),
      last_test_ok: ok,
      last_test_message: message,
    })
    .eq('id', id);
  if (error) throw mapPaymentDbError(error);
  await audit(actor, 'company_processor_account.tested', row, { ok });
  return { ok, message };
}

export async function setAccountStatus(
  actor: Actor,
  id: string,
  status: 'active' | 'disabled',
): Promise<AccountView> {
  requireSuperAdmin(actor);
  const row = await rowById(id);
  if (status === 'active' && row.last_test_ok !== true)
    throw new ConflictError(
      'Test the connection first: an account is switched on only after a passing test.',
    );
  const { data, error } = await getAdminSupabase()
    .from('company_processor_accounts')
    .update({ status })
    .eq('id', id)
    .select(COLUMNS)
    .single();
  if (error) throw mapPaymentDbError(error);
  const updated = data as Row;
  await audit(
    actor,
    status === 'active'
      ? 'company_processor_account.enabled'
      : 'company_processor_account.disabled',
    updated,
  );
  const names = await companyNames([updated.company_id]);
  return viewOf(updated, names.get(updated.company_id) ?? '');
}

/** Removes the account. Payments made with it keep their link; their follow-up calls then fail until it is saved again. */
export async function removeAccount(actor: Actor, id: string): Promise<void> {
  requireSuperAdmin(actor);
  const row = await rowById(id);
  const open = await getAdminSupabase()
    .from('payments')
    .select('id', { count: 'exact', head: true })
    .eq('company_id', row.company_id)
    .eq('account_id', id)
    .in('status', ['created', 'requires_action', 'authorized', 'pending_review']);
  if (open.error) throw mapPaymentDbError(open.error);
  if ((open.count ?? 0) > 0)
    throw new ConflictError(
      'This account has payments that are still open. Wait until they finish, or switch the account off.',
    );
  const { error } = await getAdminSupabase()
    .from('company_processor_accounts')
    .update({ deleted_at: new Date().toISOString(), status: 'disabled' })
    .eq('id', id);
  if (error) throw mapPaymentDbError(error);
  await audit(actor, 'company_processor_account.removed', row);
}

export interface AccountFormOption {
  processorId: string;
  name: string;
  fields: {
    key: string;
    label: string;
    secret: boolean;
    required: boolean;
    helpText: string | null;
  }[];
}

/** Processors that have an adapter, with the credential fields the form shows for each. */
export async function accountFormOptions(): Promise<AccountFormOption[]> {
  const out: AccountFormOption[] = [];
  for (const entry of listRegistry()) {
    if (!entry.available) continue;
    const adapter = await loadAdapter(entry.metadata.id);
    out.push({
      processorId: entry.metadata.id,
      name: entry.metadata.name,
      // Where a company account adds only a few fields to the platform's own keys, only those fields are shown.
      fields: credentialFormFields(adapter).filter(
        (f) =>
          !(entry.metadata.id in COMPANY_ACCOUNT_OVERLAY) ||
          COMPANY_ACCOUNT_OVERLAY[entry.metadata.id]?.includes(f.key),
      ),
    });
  }
  return out;
}

/** The address a company's merchant account gives to the processor for payment webhooks. */
export function accountWebhookPath(processorId: string, accountId: string): string {
  return `/api/webhooks/account/${processorId}/${accountId}`;
}
