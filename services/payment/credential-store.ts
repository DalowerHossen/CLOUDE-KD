// path: services/payment/credential-store.ts
// Persistence of processors, credentials, tests and enable state. The tables are platform level (no company_id), only
// the server service role can reach them, and every state change goes through the S10_002 database functions.
import { getAdminSupabase } from '@/lib/supabase/admin';
import { NotFoundError } from '@/lib/errors';
import {
  openCredentials,
  sealCredentials,
  type StoredCredentialRow,
} from '@/lib/payment/credentials';
import { loadAdapter } from '@/lib/payment/registry';
import type { ProcessorEnvironment, ProcessorId } from '@/types/contracts';
import { mapPaymentDbError } from './rpc';

export interface ProcessorRow {
  id: string;
  processor_id: ProcessorId;
  enabled: boolean;
  environment: ProcessorEnvironment;
  active_mode: string;
  credentials_version: number;
  disabled_reason: string | null;
  last_test_at: string | null;
  last_test_ok: boolean | null;
  last_test_version: number | null;
  last_test_mode: string | null;
  last_test_environment: string | null;
  updated_by: string | null;
  updated_at: string;
  version: number;
}

export interface CredentialMeta {
  credentials_version: number;
  field_keys: string[];
  last_chars: Record<string, string | null>;
  updated_at: string;
  updated_by: string | null;
}

const PROCESSOR_COLUMNS =
  'id, processor_id, enabled, environment, active_mode, credentials_version, disabled_reason, last_test_at, last_test_ok, last_test_version, last_test_mode, last_test_environment, updated_by, updated_at, version';

/** Creates the processor row and its mode rows from the adapter when they are missing. */
export async function ensureProcessor(processorId: ProcessorId): Promise<ProcessorRow> {
  const adapter = await loadAdapter(processorId);
  const db = getAdminSupabase();
  const { error } = await db.rpc('kd_processor_ensure', {
    p_processor: processorId,
    p_modes: adapter.capabilities.modes.map((m) => ({
      id: m.id,
      label: m.label,
      isDefault: m.isDefault,
    })),
  });
  if (error) throw mapPaymentDbError(error);
  return getProcessorRow(processorId);
}

export async function getProcessorRow(processorId: ProcessorId): Promise<ProcessorRow> {
  const { data, error } = await getAdminSupabase()
    .from('processors')
    .select(PROCESSOR_COLUMNS)
    .eq('processor_id', processorId)
    .is('deleted_at', null)
    .maybeSingle();
  if (error) throw mapPaymentDbError(error);
  if (!data) throw new NotFoundError();
  return data as ProcessorRow;
}

export async function listProcessorRows(): Promise<ProcessorRow[]> {
  const { data, error } = await getAdminSupabase()
    .from('processors')
    .select(PROCESSOR_COLUMNS)
    .is('deleted_at', null);
  if (error) throw mapPaymentDbError(error);
  return (data ?? []) as ProcessorRow[];
}

export async function currentCredentialMeta(
  processorId: ProcessorId,
): Promise<CredentialMeta | null> {
  const { data, error } = await getAdminSupabase()
    .from('processor_credentials')
    .select('credentials_version, field_keys, last_chars, updated_at, updated_by')
    .eq('processor_id', processorId)
    .eq('is_current', true)
    .is('deleted_at', null)
    .maybeSingle();
  if (error) throw mapPaymentDbError(error);
  return (data as CredentialMeta | null) ?? null;
}

/** Validates, encrypts and stores a new credentials version. The processor is disabled until a new test passes. */
export async function saveCredentials(input: {
  processorId: ProcessorId;
  values: unknown;
  actorId: string;
  expectedVersion: number | null;
}): Promise<number> {
  const adapter = await loadAdapter(input.processorId);
  await ensureProcessor(input.processorId);
  const sealed = await sealCredentials(adapter, input.values);
  const { data, error } = await getAdminSupabase().rpc('kd_processor_save_credentials', {
    p_processor: input.processorId,
    p_ciphertext: sealed.payload.ciphertext,
    p_iv: sealed.payload.iv,
    p_tag: sealed.payload.tag,
    p_key_version: sealed.payload.keyVersion,
    p_field_keys: sealed.fieldKeys,
    p_last_chars: sealed.lastChars,
    p_by: input.actorId,
    p_expected_version: input.expectedVersion,
  });
  if (error) throw mapPaymentDbError(error);
  return data as number;
}

/** Server use only: decrypts the current credentials for one adapter call. Never pass the result to a client. */
export async function loadCurrentCredentials(
  processorId: ProcessorId,
): Promise<{ values: Record<string, string>; version: number }> {
  const { data, error } = await getAdminSupabase()
    .from('processor_credentials')
    .select('ciphertext, iv, tag, key_version, credentials_version')
    .eq('processor_id', processorId)
    .eq('is_current', true)
    .is('deleted_at', null)
    .maybeSingle();
  if (error) throw mapPaymentDbError(error);
  if (!data) throw new NotFoundError('No credentials are saved for this processor.');
  const row = data as StoredCredentialRow & { credentials_version: number };
  return { values: await openCredentials(processorId, row), version: row.credentials_version };
}

export async function recordTest(input: {
  processorId: ProcessorId;
  modeId: string;
  ok: boolean;
  message: string;
  actorId: string;
}): Promise<string> {
  const { data, error } = await getAdminSupabase().rpc('kd_processor_record_test', {
    p_processor: input.processorId,
    p_mode: input.modeId,
    p_ok: input.ok,
    p_message: input.message,
    p_by: input.actorId,
  });
  if (error) throw mapPaymentDbError(error);
  return String(data);
}

export async function setEnabled(input: {
  processorId: ProcessorId;
  enabled: boolean;
  actorId: string;
  expectedVersion: number | null;
}): Promise<void> {
  const { error } = await getAdminSupabase().rpc('kd_processor_set_enabled', {
    p_processor: input.processorId,
    p_enabled: input.enabled,
    p_by: input.actorId,
    p_expected_version: input.expectedVersion,
  });
  if (error) throw mapPaymentDbError(error);
}

export async function setEnvironment(input: {
  processorId: ProcessorId;
  environment: ProcessorEnvironment;
  actorId: string;
  expectedVersion: number | null;
}): Promise<void> {
  const { error } = await getAdminSupabase().rpc('kd_processor_set_environment', {
    p_processor: input.processorId,
    p_environment: input.environment,
    p_by: input.actorId,
    p_expected_version: input.expectedVersion,
  });
  if (error) throw mapPaymentDbError(error);
}
