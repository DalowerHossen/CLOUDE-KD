// path: services/payment/processors.ts
// Super admin processor management (REQ-ADMIN-CONNECT): view, save credentials, test, enable, disable, environment.
// Every action is audit logged; no response carries a secret.
import { getService } from '@/lib/container';
import { ForbiddenError, ValidationError } from '@/lib/errors';
import { logger } from '@/lib/logger';
import { getContext } from '@/lib/logger/correlation';
import { getPublicEnv } from '@/lib/env/public';
import { hasSecureForm } from '@/config/processors';
import { describeCredentials, type CredentialFieldStatus } from '@/lib/payment/credentials';
import { describeSwitch, hasChoice, requireMode } from '@/lib/payment/modes';
import { hasAdapter, isKnownProcessor, listRegistry, loadAdapter } from '@/lib/payment/registry';
import { credentialFormFields } from '@/schemas/payment/credentials';
import type { ProcessorAction } from '@/schemas/payment/processors';
import { getAdminSupabase } from '@/lib/supabase/admin';
import type { Actor, ProcessorEnvironment, ProcessorId } from '@/types/contracts';
import {
  currentCredentialMeta,
  ensureProcessor,
  getProcessorRow,
  listProcessorRows,
  loadCurrentCredentials,
  recordTest,
  saveCredentials,
  setEnabled,
  setEnvironment,
  switchMode,
  type ProcessorRow,
} from './credential-store';
import { resetHealthState } from './health';
import { mapPaymentDbError } from './rpc';

export interface ModeView {
  id: string;
  label: string;
  isActive: boolean;
  /** Result of the latest test of this mode for the current credentials and environment, or null. */
  lastTest: { ok: boolean; at: string; message: string } | null;
}

export interface ProcessorSummary {
  id: ProcessorId;
  name: string;
  step: number;
  docsUrl: string;
  sandboxUrl: string | null;
  /** False when no adapter file exists in code: such a processor cannot be configured or enabled. */
  available: boolean;
  /** False when no secure card form exists in code for this processor: it cannot be enabled. */
  hasSecureForm: boolean;
  enabled: boolean;
  environment: ProcessorEnvironment | null;
  activeMode: string | null;
  hasCredentials: boolean;
  lastTestOk: boolean | null;
  lastTestAt: string | null;
  disabledReason: string | null;
}

export interface ProcessorDetail extends ProcessorSummary {
  /** The address to give to the processor for its payment webhooks. */
  webhookUrl: string;
  /** True when the platform can create the webhook at the processor itself (its API has a call for it). */
  canCreateWebhooks: boolean;
  version: number;
  credentialsVersion: number;
  credentialsUpdatedAt: string | null;
  fields: CredentialFieldStatus[];
  modes: ModeView[];
  capabilities: {
    threeDS: boolean;
    authCapture: boolean;
    refund: boolean;
    partialRefund: boolean;
    merchantOfRecord: boolean;
  };
}

function summaryOf(
  entry: ReturnType<typeof listRegistry>[number],
  row: ProcessorRow | undefined,
): ProcessorSummary {
  const m = entry.metadata;
  return {
    id: m.id,
    name: m.name,
    step: m.step,
    docsUrl: m.docsUrl,
    sandboxUrl: m.sandboxUrl,
    available: entry.available,
    hasSecureForm: hasSecureForm(m.id),
    enabled: row?.enabled ?? false,
    environment: row?.environment ?? null,
    activeMode: row?.active_mode ?? null,
    hasCredentials: (row?.credentials_version ?? 0) > 0,
    lastTestOk: row?.last_test_ok ?? null,
    lastTestAt: row?.last_test_at ?? null,
    disabledReason: row?.disabled_reason ?? null,
  };
}

export async function listProcessors(): Promise<ProcessorSummary[]> {
  const rows = await listProcessorRows();
  const byId = new Map(rows.map((r) => [r.processor_id, r]));
  return listRegistry().map((entry) => summaryOf(entry, byId.get(entry.metadata.id)));
}

function webhookUrlOf(id: string): string {
  return `${getPublicEnv().NEXT_PUBLIC_APP_URL.replace(/\/+$/, '')}/api/webhooks/${id}`;
}

export async function getProcessorDetail(id: string): Promise<ProcessorDetail> {
  if (!isKnownProcessor(id)) throw new ValidationError('Unknown payment processor.');
  const entry = listRegistry().find((e) => e.metadata.id === id);
  if (!entry) throw new ValidationError('Unknown payment processor.');
  if (!hasAdapter(id)) {
    return {
      ...summaryOf(entry, undefined),
      webhookUrl: webhookUrlOf(id),
      canCreateWebhooks: false,
      version: 0,
      credentialsVersion: 0,
      credentialsUpdatedAt: null,
      fields: [],
      modes: [],
      capabilities: {
        threeDS: false,
        authCapture: false,
        refund: false,
        partialRefund: false,
        merchantOfRecord: false,
      },
    };
  }
  const adapter = await loadAdapter(id);
  const row = await ensureProcessor(id);
  const meta = await currentCredentialMeta(id);
  const { data: modeRows, error: modeError } = await getAdminSupabase()
    .from('processor_modes')
    .select('mode_id, label, is_active')
    .eq('processor_id', id)
    .is('deleted_at', null);
  if (modeError) throw mapPaymentDbError(modeError);
  const { data: tests, error: testError } = await getAdminSupabase()
    .from('processor_mode_tests')
    .select('mode_id, ok, message, tested_at')
    .eq('processor_id', id)
    .eq('environment', row.environment)
    .eq('credentials_version', row.credentials_version)
    .order('tested_at', { ascending: false })
    .limit(50);
  if (testError) throw mapPaymentDbError(testError);
  const latest = new Map<string, { ok: boolean; at: string; message: string }>();
  for (const t of tests ?? []) {
    const modeId = String(t.mode_id);
    if (!latest.has(modeId))
      latest.set(modeId, {
        ok: Boolean(t.ok),
        at: String(t.tested_at),
        message: String(t.message ?? ''),
      });
  }
  const labelFor = new Map((modeRows ?? []).map((m) => [String(m.mode_id), m]));
  const modes: ModeView[] = adapter.capabilities.modes.map((m) => ({
    id: m.id,
    label: labelFor.get(m.id) ? String(labelFor.get(m.id)?.label) : m.label,
    isActive: m.id === row.active_mode,
    lastTest: latest.get(m.id) ?? null,
  }));
  const caps = adapter.capabilities;
  return {
    ...summaryOf(entry, row),
    webhookUrl: webhookUrlOf(id),
    canCreateWebhooks: id === 'stripe',
    version: row.version,
    credentialsVersion: row.credentials_version,
    credentialsUpdatedAt: meta?.updated_at ?? null,
    fields: describeCredentials(adapter, meta?.field_keys ?? [], meta?.last_chars ?? {}),
    modes,
    capabilities: {
      threeDS: caps.supportsThreeDS,
      authCapture: caps.supportsAuthCapture,
      refund: caps.supportsRefund,
      partialRefund: caps.supportsPartialRefund,
      merchantOfRecord: caps.isMerchantOfRecord,
    },
  };
}

/** Form description for the dashboard (labels only). */
export async function credentialForm(id: string): Promise<ReturnType<typeof credentialFormFields>> {
  return credentialFormFields(await loadAdapter(id));
}

function requireSuperAdmin(actor: Actor): void {
  if (actor.role !== 'super_admin') throw new ForbiddenError();
}

async function audit(
  actor: Actor,
  action: string,
  row: ProcessorRow,
  metadata: Record<string, unknown>,
): Promise<void> {
  await getService('audit').record({
    action,
    resourceType: 'processor',
    resourceId: row.id,
    metadata: { processorId: row.processor_id, actorRole: actor.role, ...metadata },
  });
}

const MESSAGE_LIMIT = 300;
function safeMessage(text: string): string {
  return text.replace(/[^\x20-\x7e]/g, ' ').slice(0, MESSAGE_LIMIT);
}

/** Calls the adapter with decrypted credentials for this one call and records the result. */
export async function testProcessor(
  actor: Actor,
  id: ProcessorId,
  modeId?: string,
): Promise<{ ok: boolean; message: string }> {
  requireSuperAdmin(actor);
  const adapter = await loadAdapter(id);
  const row = await getProcessorRow(id);
  const mode = modeId ?? row.active_mode;
  if (!adapter.capabilities.modes.some((m) => m.id === mode))
    throw new ValidationError('Unknown mode for this processor.');
  const { values } = await loadCurrentCredentials(id);
  let ok = false;
  let message = '';
  try {
    const result = await adapter.testConnection({
      credentials: values,
      environment: row.environment,
      mode,
      correlationId: getContext()?.correlationId ?? 'none',
    });
    ok = result.ok;
    message = safeMessage(result.message);
  } catch (e) {
    ok = false;
    message = 'The connection test failed.';
    logger.warn('processor test threw', {
      processor: id,
      error: e instanceof Error ? e.name : 'unknown',
    });
  }
  const testId = await recordTest({
    processorId: id,
    modeId: mode,
    ok,
    message,
    actorId: actor.userId,
  });
  await audit(actor, 'processor.test', row, {
    mode,
    environment: row.environment,
    ok,
    testId,
    credentialsVersion: row.credentials_version,
  });
  return { ok, message };
}

export async function runProcessorAction(
  actor: Actor,
  id: string,
  input: ProcessorAction,
): Promise<unknown> {
  requireSuperAdmin(actor);
  if (!isKnownProcessor(id)) throw new ValidationError('Unknown payment processor.');
  if (!hasAdapter(id))
    throw new ValidationError('This processor has no adapter in this build yet.');
  await loadAdapter(id);
  switch (input.action) {
    case 'save_credentials': {
      const version = await saveCredentials({
        processorId: id,
        values: input.values,
        actorId: actor.userId,
        expectedVersion: input.expectedVersion,
      });
      const row = await getProcessorRow(id);
      const meta = await currentCredentialMeta(id);
      await audit(actor, 'processor.credentials.save', row, {
        credentialsVersion: version,
        fieldKeys: meta?.field_keys ?? [],
      });
      return { credentialsVersion: version };
    }
    case 'switch_mode': {
      const adapter = await loadAdapter(id);
      if (!hasChoice(adapter)) throw new ValidationError('This processor has a single mode.');
      requireMode(adapter, input.modeId);
      const before = await getProcessorRow(id);
      if (before.active_mode === input.modeId) return { activeMode: input.modeId };
      const testId = await switchMode({
        processorId: id,
        modeId: input.modeId,
        actorId: actor.userId,
        expectedVersion: input.expectedVersion,
      });
      const row = await getProcessorRow(id);
      await audit(
        actor,
        'processor.mode.switch',
        row,
        describeSwitch(before.active_mode, input.modeId, testId),
      );
      return { activeMode: row.active_mode };
    }
    case 'test':
      return testProcessor(actor, id, input.modeId);
    case 'enable':
    case 'disable': {
      const enabled = input.action === 'enable';
      if (enabled && !hasSecureForm(id))
        throw new ValidationError(
          'This processor has no card form in this build yet, so it cannot be enabled. Payers would see an error at checkout.',
        );
      await setEnabled({
        processorId: id,
        enabled,
        actorId: actor.userId,
        expectedVersion: input.expectedVersion,
      });
      const row = await getProcessorRow(id);
      await audit(actor, enabled ? 'processor.enable' : 'processor.disable', row, {
        environment: row.environment,
        mode: row.active_mode,
      });
      // Enabled again by a person: the health counters start from zero.
      if (enabled) await resetHealthState(id).catch(() => undefined);
      return { enabled };
    }
    case 'set_environment': {
      const before = await getProcessorRow(id);
      await setEnvironment({
        processorId: id,
        environment: input.environment,
        actorId: actor.userId,
        expectedVersion: input.expectedVersion,
      });
      const row = await getProcessorRow(id);
      await audit(actor, 'processor.environment', row, {
        from: before.environment,
        to: row.environment,
      });
      return { environment: row.environment };
    }
  }
}
