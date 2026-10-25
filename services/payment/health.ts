// path: services/payment/health.ts
// Processor health (REQ-ADMIN-CONNECT). A cron job checks every enabled processor and keeps the history and the current
// state; a processor that is "down" for the allowed number of checks in a row is switched off and the super admins are told.
// Fail closed: a check that could not run, or that cannot be trusted (the platform itself cannot reach the internet, or
// every processor failed at once), never counts toward switching anything off.
import 'server-only';
import { HEALTH_HISTORY_DAYS, HEALTH_TIMEOUT_MS, healthConfigOf } from '@/config/processor-health';
import { TURNSTILE_ORIGIN } from '@/config/security';
import { getService, tryGetService } from '@/lib/container';
import { ForbiddenError, InternalError, ValidationError } from '@/lib/errors';
import { createLogger } from '@/lib/logger';
import {
  autoDisableReason,
  classify,
  isDue,
  isValidHealthUrl,
  looksLikeOwnOutage,
  nextFailureCount,
  safeHealthMessage,
  sampleFromHttp,
  shouldDisable,
  wasAutoDisabled,
  type HealthStatus,
} from '@/lib/payment/health-rules';
import { defaultMode } from '@/lib/payment/modes';
import { hasAdapter, isKnownProcessor, listRegistry, loadAdapter } from '@/lib/payment/registry';
import { safeHttpsRequest } from '@/lib/security/ssrf';
import { getAdminSupabase } from '@/lib/supabase/admin';
import type { Actor, ProcessorEnvironment, ProcessorId } from '@/types/contracts';
import { getProcessorRow, listProcessorRows, loadCurrentCredentials } from './credential-store';

const log = createLogger({ service: 'processor-health' });
const SAFE_ERROR = 'The processor did not answer the check.';

export interface ProbeOutcome {
  status: HealthStatus;
  probe: 'url' | 'adapter';
  responseMs: number | null;
  error: string | null;
  environment: ProcessorEnvironment;
}

function withTimeout<T>(work: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('timeout')), ms);
    work.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error: unknown) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}

/** One check of one processor. It never throws: a check that cannot run is "unknown". */
export async function probeProcessor(id: ProcessorId): Promise<ProbeOutcome> {
  const config = healthConfigOf(id);
  let environment: ProcessorEnvironment = 'sandbox';
  try {
    const row = await getProcessorRow(id);
    environment = row.environment;
    const started = Date.now();
    if (config.healthCheckUrl && isValidHealthUrl(config.healthCheckUrl)) {
      try {
        const response = await safeHttpsRequest(config.healthCheckUrl, {
          method: 'GET',
          maxBytes: 16 * 1024,
          timeoutMs: HEALTH_TIMEOUT_MS,
          headers: { accept: '*/*' },
        });
        const ms = Date.now() - started;
        return {
          status: classify(sampleFromHttp(response.status, ms)),
          probe: 'url',
          responseMs: ms,
          error: response.status >= 500 ? `The ping answered HTTP ${response.status}.` : null,
          environment,
        };
      } catch (error) {
        return {
          status: 'down',
          probe: 'url',
          responseMs: Date.now() - started,
          error: safeHealthMessage(error instanceof Error ? error.message : SAFE_ERROR),
          environment,
        };
      }
    }
    // No ping address: ask the adapter to test the saved credentials. A problem on our side (no adapter, credentials that
    // cannot be opened) is "unknown", not "down".
    let adapter;
    let values: Record<string, string>;
    try {
      adapter = await loadAdapter(id);
      values = (await loadCurrentCredentials(id)).values;
    } catch (error) {
      return {
        status: 'unknown',
        probe: 'adapter',
        responseMs: null,
        error: safeHealthMessage(
          `The check could not start: ${error instanceof Error ? error.message : 'unknown'}`,
        ),
        environment,
      };
    }
    const adapterStarted = Date.now();
    try {
      const result = await withTimeout(
        adapter.testConnection({
          credentials: values,
          environment,
          mode: row.active_mode || defaultMode(adapter).id,
          correlationId: `health-${id}`,
        }),
        HEALTH_TIMEOUT_MS,
      );
      const ms = Date.now() - adapterStarted;
      return {
        status: classify({ reachable: result.ok, ms }),
        probe: 'adapter',
        responseMs: ms,
        error: result.ok ? null : safeHealthMessage(result.message || SAFE_ERROR),
        environment,
      };
    } catch (error) {
      return {
        status: 'down',
        probe: 'adapter',
        responseMs: Date.now() - adapterStarted,
        error: safeHealthMessage(error instanceof Error ? error.message : SAFE_ERROR),
        environment,
      };
    }
  } catch (error) {
    return {
      status: 'unknown',
      probe: 'adapter',
      responseMs: null,
      error: safeHealthMessage(
        `The check could not run: ${error instanceof Error ? error.message : 'unknown'}`,
      ),
      environment,
    };
  }
}

/** Can the platform itself reach the internet? Any HTTP answer from a neutral host proves it. */
async function platformReachesInternet(): Promise<boolean> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 5000);
  try {
    await fetch(TURNSTILE_ORIGIN, { method: 'HEAD', signal: controller.signal, cache: 'no-store' });
    return true;
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

interface StateRow {
  id: string;
  processor_id: string;
  status: HealthStatus;
  consecutive_failures: number;
  response_ms: number | null;
  last_error: string | null;
  last_checked_at: string | null;
  last_ok_at: string | null;
  auto_disabled_at: string | null;
}
const STATE_COLUMNS =
  'id, processor_id, status, consecutive_failures, response_ms, last_error, last_checked_at, last_ok_at, auto_disabled_at';

async function loadStates(): Promise<Map<string, StateRow>> {
  const { data, error } = await getAdminSupabase()
    .from('processor_health_state')
    .select(STATE_COLUMNS)
    .is('deleted_at', null);
  if (error) throw new InternalError(error);
  return new Map(((data ?? []) as StateRow[]).map((r) => [r.processor_id, r]));
}

async function saveResult(
  id: ProcessorId,
  outcome: ProbeOutcome,
  status: HealthStatus,
  note: string | null,
  previous: StateRow | undefined,
  counts: boolean,
  at: Date = new Date(),
): Promise<number> {
  const db = getAdminSupabase();
  const now = at.toISOString();
  const error = note ?? outcome.error;
  const history = await db.from('processor_health').insert({
    processor_id: id,
    environment: outcome.environment,
    status,
    probe: outcome.probe,
    response_ms: outcome.responseMs,
    error_message: error,
    checked_at: now,
  });
  if (history.error) throw new InternalError(history.error);
  const before = previous?.consecutive_failures ?? 0;
  const failures = counts ? nextFailureCount(before, status) : before;
  const values = {
    status,
    consecutive_failures: failures,
    probe: outcome.probe,
    response_ms: outcome.responseMs,
    last_error: error,
    last_checked_at: now,
    ...(status === 'healthy' || status === 'degraded' ? { last_ok_at: now } : {}),
  };
  const saved = previous
    ? await db.from('processor_health_state').update(values).eq('id', previous.id)
    : await db.from('processor_health_state').insert({ processor_id: id, ...values });
  if (saved.error) throw new InternalError(saved.error);
  return failures;
}

async function superAdmins(): Promise<{ userId: string; email: string }[]> {
  const { data, error } = await getAdminSupabase()
    .from('profiles')
    .select('user_id, email')
    .eq('platform_role', 'super_admin')
    .is('deleted_at', null)
    .limit(50);
  if (error) throw new InternalError(error);
  return (data ?? []).map((p) => ({ userId: String(p.user_id), email: String(p.email) }));
}

/** Tells every super admin in the app and by e-mail. A problem with one person never stops the others. */
async function tellSuperAdmins(
  name: string,
  id: ProcessorId,
  failures: number,
  lastError: string | null,
): Promise<void> {
  const title = `${name} was switched off`;
  const body = `${name} failed ${failures} health checks in a row and was switched off automatically.${lastError ? ` Last error: ${lastError}` : ''} Check that it is back online, then test and enable it again.`;
  let admins: { userId: string; email: string }[] = [];
  try {
    admins = await superAdmins();
  } catch (error) {
    log.error('the super admins could not be listed', { error });
    return;
  }
  const bucket = new Date().toISOString().slice(0, 13);
  for (const admin of admins) {
    try {
      await tryGetService('notification')?.notify({
        userId: admin.userId,
        type: 'system.processor_auto_disabled',
        title,
        body,
        href: '/admin/processors/health',
      });
    } catch (error) {
      log.warn('the in-app notice failed', {
        error: error instanceof Error ? error.name : 'unknown',
      });
    }
    try {
      await tryGetService('email')?.send({
        template: 'security.alert',
        to: admin.email,
        data: { severity: 'high', title, body },
        idempotencyKey: `processor-disabled:${id}:${admin.userId}:${bucket}`,
      });
    } catch (error) {
      log.warn('the alert e-mail failed', {
        error: error instanceof Error ? error.name : 'unknown',
      });
    }
  }
}

async function autoDisable(
  id: ProcessorId,
  name: string,
  failures: number,
  lastError: string | null,
  environment: ProcessorEnvironment,
): Promise<boolean> {
  const { data, error } = await getAdminSupabase().rpc('kd_processor_auto_disable', {
    p_processor: id,
    p_reason: autoDisableReason(failures),
  });
  if (error) throw new InternalError(error);
  if (data !== true) return false;
  const row = await getProcessorRow(id);
  await getService('audit').record({
    action: 'processor.auto_disabled',
    resourceType: 'processor',
    resourceId: row.id,
    metadata: { processorId: id, failures, lastError, environment, by: 'system' },
  });
  await getAdminSupabase()
    .from('processor_health_state')
    .update({ auto_disabled_at: new Date().toISOString() })
    .eq('processor_id', id)
    .is('deleted_at', null);
  await tellSuperAdmins(name, id, failures, lastError);
  return true;
}

export interface CycleSummary {
  checked: number;
  disabled: ProcessorId[];
  untrusted: boolean;
}

/** The cron job: check what is due, record it, and switch off what failed enough times in a row. */
export async function runHealthCycle(now: Date = new Date()): Promise<CycleSummary> {
  const rows = (await listProcessorRows()).filter((r) => r.enabled && hasAdapter(r.processor_id));
  const states = await loadStates();
  const due = rows.filter((r) =>
    isDue(
      states.get(r.processor_id)?.last_checked_at ?? null,
      now,
      healthConfigOf(r.processor_id).healthCheckIntervalMinutes,
    ),
  );
  if (due.length === 0) return { checked: 0, disabled: [], untrusted: false };
  const outcomes = await Promise.all(
    due.map(async (r) => ({ row: r, outcome: await probeProcessor(r.processor_id) })),
  );
  const anyDown = outcomes.some((o) => o.outcome.status === 'down');
  const internetOk = anyDown ? await platformReachesInternet() : true;
  const untrusted = !internetOk || looksLikeOwnOutage(outcomes.map((o) => o.outcome.status));
  if (untrusted)
    log.warn('health results not trusted: the platform may have lost its network', { internetOk });
  const disabled: ProcessorId[] = [];
  const names = new Map(listRegistry().map((e) => [e.metadata.id, e.metadata.name]));
  const toDisable: {
    id: ProcessorId;
    failures: number;
    error: string | null;
    env: ProcessorEnvironment;
  }[] = [];
  for (const { row, outcome } of outcomes) {
    const id = row.processor_id;
    const distrust = untrusted && outcome.status === 'down';
    const status: HealthStatus = distrust ? 'unknown' : outcome.status;
    const note = distrust
      ? 'Not counted: the platform could not confirm its own network, or every processor failed at once.'
      : null;
    const failures = await saveResult(id, outcome, status, note, states.get(id), true, now);
    if (shouldDisable(failures, healthConfigOf(id).consecutiveFailuresAllowed, row.enabled))
      toDisable.push({ id, failures, error: outcome.error, env: outcome.environment });
  }
  // Switching off happens last, after every result is safely stored.
  for (const item of toDisable) {
    try {
      if (
        await autoDisable(
          item.id,
          names.get(item.id) ?? item.id,
          item.failures,
          item.error,
          item.env,
        )
      )
        disabled.push(item.id);
    } catch (error) {
      log.error('a processor could not be switched off', { processor: item.id, error });
    }
  }
  const cutoff = new Date(now.getTime() - HEALTH_HISTORY_DAYS * 86_400_000).toISOString();
  await getAdminSupabase()
    .from('processor_health')
    .update({ deleted_at: now.toISOString() })
    .lt('checked_at', cutoff)
    .is('deleted_at', null);
  return { checked: due.length, disabled, untrusted };
}

/** A check the super admin asks for. It is recorded and shown, but it never switches anything off by itself. */
export async function checkProcessorNow(
  actor: Actor,
  idRaw: string,
): Promise<ProbeOutcome & { checkedAt: string }> {
  if (actor.role !== 'super_admin') throw new ForbiddenError();
  if (!isKnownProcessor(idRaw)) throw new ValidationError('Unknown payment processor.');
  if (!hasAdapter(idRaw))
    throw new ValidationError('This processor has no adapter in this build yet.');
  const outcome = await probeProcessor(idRaw);
  const states = await loadStates();
  await saveResult(idRaw, outcome, outcome.status, null, states.get(idRaw), false);
  await getService('audit').record({
    action: 'processor.health_checked',
    resourceType: 'processor',
    resourceId: idRaw,
    metadata: {
      processorId: idRaw,
      status: outcome.status,
      responseMs: outcome.responseMs,
      by: actor.userId,
    },
  });
  return { ...outcome, checkedAt: new Date().toISOString() };
}

/** After the super admin enabled a processor again: start counting from zero. */
export async function resetHealthState(id: ProcessorId): Promise<void> {
  const { error } = await getAdminSupabase()
    .from('processor_health_state')
    .update({
      consecutive_failures: 0,
      status: 'unknown',
      auto_disabled_at: null,
      last_error: null,
    })
    .eq('processor_id', id)
    .is('deleted_at', null);
  if (error) throw new InternalError(error);
}

export interface HealthView {
  id: ProcessorId;
  name: string;
  available: boolean;
  enabled: boolean;
  autoDisabled: boolean;
  disabledReason: string | null;
  environment: ProcessorEnvironment | null;
  status: HealthStatus;
  consecutiveFailures: number;
  allowedFailures: number;
  responseMs: number | null;
  lastError: string | null;
  lastCheckedAt: string | null;
  lastOkAt: string | null;
  probe: 'url' | 'adapter';
  intervalMinutes: number;
  recent: HealthStatus[];
}

export async function listHealth(): Promise<HealthView[]> {
  const [rows, states, history] = await Promise.all([
    listProcessorRows(),
    loadStates(),
    getAdminSupabase()
      .from('processor_health')
      .select('processor_id, status, checked_at')
      .is('deleted_at', null)
      .order('checked_at', { ascending: false })
      .limit(1000),
  ]);
  if (history.error) throw new InternalError(history.error);
  const byRow = new Map(rows.map((r) => [r.processor_id, r]));
  const recent = new Map<string, HealthStatus[]>();
  for (const h of history.data ?? []) {
    const list = recent.get(String(h.processor_id)) ?? [];
    if (list.length < 12) list.push(String(h.status) as HealthStatus);
    recent.set(String(h.processor_id), list);
  }
  return listRegistry().map((entry) => {
    const id = entry.metadata.id;
    const row = byRow.get(id);
    const state = states.get(id);
    const config = healthConfigOf(id);
    return {
      id,
      name: entry.metadata.name,
      available: entry.available,
      enabled: row?.enabled ?? false,
      autoDisabled: wasAutoDisabled(row?.disabled_reason ?? null),
      disabledReason: row?.disabled_reason ?? null,
      environment: row?.environment ?? null,
      status: state?.status ?? 'unknown',
      consecutiveFailures: state?.consecutive_failures ?? 0,
      allowedFailures: config.consecutiveFailuresAllowed,
      responseMs: state?.response_ms ?? null,
      lastError: state?.last_error ?? null,
      lastCheckedAt: state?.last_checked_at ?? null,
      lastOkAt: state?.last_ok_at ?? null,
      probe: config.healthCheckUrl ? 'url' : 'adapter',
      intervalMinutes: config.healthCheckIntervalMinutes,
      recent: (recent.get(id) ?? []).reverse(),
    };
  });
}
