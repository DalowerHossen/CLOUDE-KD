// path: services/domain/domains.ts
// Custom domains of a company: add, show the DNS records to create, check them, certificate state, primary domain and
// removal. The certificate itself is issued by the hosting platform once the name points to it; this service checks the
// result with a plain HTTPS request to a name whose address was first checked to be a public one.
import 'server-only';
import { resolve4, resolve6, resolveCname, resolveTxt } from 'node:dns/promises';
import { z } from 'zod';
import { getService } from '@/lib/container';
import {
  DuplicateError,
  ForbiddenError,
  InternalError,
  NotFoundError,
  ValidationError,
} from '@/lib/errors';
import { createLogger } from '@/lib/logger';
import {
  dnsRecords,
  evaluateDns,
  isPublicAddress,
  normalizeHostname,
  validateHostname,
  type DnsRecord,
} from '@/lib/domain/hostnames';
import { getPublicEnv } from '@/lib/env/public';
import { getAdminSupabase } from '@/lib/supabase/admin';
import { randomHex } from '@/lib/utils/hash';
import { planHas } from '@/services/company/plan';
import type { Actor } from '@/types/contracts';

const log = createLogger({ component: 'domains' });
export const MAX_DOMAINS = 5;
const DAY = 86_400_000;
/** A verified domain whose proof record has been missing this long is marked failed. */
const GRACE_DAYS = 7;

export const addSchema = z.object({ hostname: z.string().trim().min(4).max(253) }).strict();
export const actionSchema = z
  .object({ id: z.string().uuid(), action: z.enum(['check', 'primary']) })
  .strict();
export const removeSchema = z.object({ id: z.string().uuid() }).strict();

export const platformHost = (): string => new URL(getPublicEnv().NEXT_PUBLIC_APP_URL).hostname;

export interface DomainView {
  id: string;
  hostname: string;
  status: 'pending_dns' | 'verified' | 'failed';
  routingOk: boolean;
  sslStatus: 'pending' | 'active' | 'error';
  isPrimary: boolean;
  lastCheckedAt: string | null;
  lastError: string;
  records: DnsRecord[];
  version: number;
}

const COLUMNS =
  'id, hostname, verification_token, status, routing_ok, ssl_status, is_primary, last_checked_at, last_error, failing_since, version';

function toView(r: Record<string, unknown>): DomainView {
  return {
    id: String(r.id),
    hostname: String(r.hostname),
    status: String(r.status) as DomainView['status'],
    routingOk: r.routing_ok === true,
    sslStatus: String(r.ssl_status) as DomainView['sslStatus'],
    isPrimary: r.is_primary === true,
    lastCheckedAt: r.last_checked_at ? String(r.last_checked_at) : null,
    lastError: String(r.last_error ?? ''),
    records: dnsRecords(String(r.hostname), String(r.verification_token), platformHost()),
    version: Number(r.version),
  };
}

export async function listDomains(companyId: string): Promise<DomainView[]> {
  const { data, error } = await getAdminSupabase()
    .from('custom_domains')
    .select(COLUMNS)
    .eq('company_id', companyId)
    .is('deleted_at', null)
    .order('created_at');
  if (error) throw new InternalError(error);
  return (data ?? []).map(toView);
}

export async function addDomain(
  actor: Actor,
  input: z.infer<typeof addSchema>,
): Promise<DomainView> {
  const companyId = actor.companyId;
  if (!companyId) throw new ValidationError('A company is needed.');
  if (!(await planHas(companyId, 'domain.custom')))
    throw new ForbiddenError('Custom domains are not part of your plan.');
  const hostname = normalizeHostname(input.hostname);
  const problem = validateHostname(hostname, platformHost());
  if (problem) throw new ValidationError(problem);
  const existing = await listDomains(companyId);
  if (existing.length >= MAX_DOMAINS)
    throw new ValidationError(`You can add up to ${MAX_DOMAINS} domains.`);
  const { data, error } = await getAdminSupabase()
    .from('custom_domains')
    .insert({ company_id: companyId, hostname, verification_token: randomHex(16) })
    .select(COLUMNS)
    .single();
  if (error) {
    if (error.code === '23505') throw new DuplicateError('This domain is already in use.');
    throw new InternalError(error);
  }
  await getService('audit').record({
    action: 'domain.added',
    resourceType: 'custom_domain',
    resourceId: String(data.id),
    companyId,
    metadata: { hostname, by: actor.userId },
  });
  return toView(data);
}

async function lookup<T>(run: () => Promise<T>, empty: T): Promise<T> {
  try {
    return await run();
  } catch {
    return empty;
  }
}

/** Looks at the DNS and, when the name points to the platform, asks for the certificate state. */
async function runChecks(
  row: Record<string, unknown>,
): Promise<{
  ownership: boolean;
  routing: boolean;
  ssl: 'pending' | 'active' | 'error';
  error: string;
}> {
  const hostname = String(row.hostname);
  const [txt, cname] = await Promise.all([
    lookup(() => resolveTxt(`_kd-verify.${hostname}`), [] as string[][]),
    lookup(() => resolveCname(hostname), [] as string[]),
  ]);
  const { ownership, routing } = evaluateDns(
    { txt, cname },
    String(row.verification_token),
    platformHost(),
  );
  let ssl: 'pending' | 'active' | 'error' = 'pending';
  let error = '';
  if (!ownership)
    error = 'The ownership record was not found yet. DNS changes can take up to a day.';
  else if (!routing)
    error =
      'The ownership record is correct. Add the CNAME record to send visitors to the platform.';
  else {
    ssl = await probeHttps(hostname);
    if (ssl === 'error')
      error =
        'The name points to the platform but no valid certificate answers yet. The hosting platform issues it automatically; try again in a few minutes.';
  }
  return { ownership, routing, ssl, error };
}

/** One HTTPS request to the verified hostname. The address must be public first, so a name cannot aim the server at the inside network. */
async function probeHttps(hostname: string): Promise<'pending' | 'active' | 'error'> {
  const addresses = [
    ...(await lookup(() => resolve4(hostname), [] as string[])),
    ...(await lookup(() => resolve6(hostname), [] as string[])),
  ];
  if (addresses.length === 0 || addresses.some((a) => !isPublicAddress(a))) return 'error';
  try {
    const response = await fetch(`https://${hostname}/api/health`, {
      method: 'GET',
      redirect: 'manual',
      signal: AbortSignal.timeout(4000),
    });
    await response.body?.cancel();
    return response.status < 500 ? 'active' : 'pending';
  } catch {
    return 'error';
  }
}

export async function checkDomain(
  companyId: string,
  id: string,
  actor: Actor | null,
): Promise<DomainView> {
  const admin = getAdminSupabase();
  const found = await admin
    .from('custom_domains')
    .select(COLUMNS)
    .eq('id', id)
    .eq('company_id', companyId)
    .is('deleted_at', null)
    .maybeSingle();
  if (found.error) throw new InternalError(found.error);
  if (!found.data) throw new NotFoundError();
  const row = found.data;
  const result = await runChecks(row);
  const now = new Date();
  let status = String(row.status) as DomainView['status'];
  let verifiedAt: string | null | undefined;
  let failingSince: string | null = row.failing_since ? String(row.failing_since) : null;
  if (result.ownership) {
    if (status !== 'verified') verifiedAt = now.toISOString();
    status = 'verified';
    failingSince = null;
  } else if (status === 'verified') {
    failingSince = failingSince ?? now.toISOString();
    if (now.getTime() - Date.parse(failingSince) > GRACE_DAYS * DAY) status = 'failed';
  } else if (status === 'failed' && !result.ownership) {
    status = 'failed';
  }
  const patch: Record<string, unknown> = {
    status,
    routing_ok: result.routing,
    ssl_status: result.ssl,
    last_checked_at: now.toISOString(),
    last_error: result.error,
    failing_since: failingSince,
    ...(verifiedAt ? { verified_at: verifiedAt } : {}),
    ...(status !== 'verified' ? { is_primary: false } : {}),
  };
  const updated = await admin
    .from('custom_domains')
    .update(patch)
    .eq('id', id)
    .select(COLUMNS)
    .single();
  if (updated.error) throw new InternalError(updated.error);
  if (verifiedAt) {
    await getService('audit').record({
      action: 'domain.verified',
      resourceType: 'custom_domain',
      resourceId: id,
      companyId,
      metadata: { hostname: String(row.hostname), by: actor?.userId ?? 'system' },
    });
    await getService('notification')
      .notify({
        companyId,
        type: 'domain.verified',
        title: 'Domain verified',
        body: `${String(row.hostname)} is verified.`,
      })
      .catch(() => undefined);
  }
  if (status === 'failed' && row.status === 'verified')
    await getService('notification')
      .notify({
        companyId,
        type: 'domain.failed',
        title: 'Domain needs attention',
        body: `The DNS records of ${String(row.hostname)} were not found for a week.`,
      })
      .catch(() => undefined);
  return toView(updated.data);
}

export async function makePrimary(actor: Actor, id: string): Promise<void> {
  const companyId = actor.companyId;
  if (!companyId) throw new ValidationError('A company is needed.');
  const admin = getAdminSupabase();
  const found = await admin
    .from('custom_domains')
    .select('id, status')
    .eq('id', id)
    .eq('company_id', companyId)
    .is('deleted_at', null)
    .maybeSingle();
  if (found.error) throw new InternalError(found.error);
  if (!found.data) throw new NotFoundError();
  if (found.data.status !== 'verified') throw new ValidationError('Verify the domain first.');
  const clear = await admin
    .from('custom_domains')
    .update({ is_primary: false })
    .eq('company_id', companyId)
    .eq('is_primary', true)
    .is('deleted_at', null);
  if (clear.error) throw new InternalError(clear.error);
  const set = await admin.from('custom_domains').update({ is_primary: true }).eq('id', id);
  if (set.error) throw new InternalError(set.error);
  await getService('audit').record({
    action: 'domain.primary_set',
    resourceType: 'custom_domain',
    resourceId: id,
    companyId,
    metadata: { by: actor.userId },
  });
}

export async function removeDomain(actor: Actor, id: string): Promise<void> {
  const companyId = actor.companyId;
  if (!companyId) throw new ValidationError('A company is needed.');
  const { data, error } = await getAdminSupabase()
    .from('custom_domains')
    .update({ deleted_at: new Date().toISOString(), is_primary: false })
    .eq('id', id)
    .eq('company_id', companyId)
    .is('deleted_at', null)
    .select('hostname');
  if (error) throw new InternalError(error);
  if (!data || data.length === 0) throw new NotFoundError();
  await getService('audit').record({
    action: 'domain.removed',
    resourceType: 'custom_domain',
    resourceId: id,
    companyId,
    metadata: { hostname: String(data[0]?.hostname), by: actor.userId },
  });
}

/** The company that owns a verified hostname, for the code that serves client pages on custom domains. */
export async function companyForHost(hostname: string): Promise<string | null> {
  const { data, error } = await getAdminSupabase()
    .from('custom_domains')
    .select('company_id')
    .eq('hostname', normalizeHostname(hostname))
    .eq('status', 'verified')
    .is('deleted_at', null)
    .maybeSingle();
  if (error) throw new InternalError(error);
  return data ? String(data.company_id) : null;
}

/** Periodic check of domains that are not settled (job). Checks the least recently checked first. */
export async function checkDueDomains(limit = 50): Promise<number> {
  const staleBefore = new Date(Date.now() - 6 * 3_600_000).toISOString();
  const { data, error } = await getAdminSupabase()
    .from('custom_domains')
    .select('id, company_id, status, ssl_status, last_checked_at')
    .is('deleted_at', null)
    .or(`last_checked_at.is.null,last_checked_at.lt.${staleBefore}`)
    .order('last_checked_at', { ascending: true, nullsFirst: true })
    .limit(limit);
  if (error) throw new InternalError(error);
  let n = 0;
  for (const row of data ?? []) {
    try {
      await checkDomain(String(row.company_id), String(row.id), null);
      n += 1;
    } catch (e) {
      log.warn('domain check failed', { error: e instanceof Error ? e.message : 'failed' });
    }
  }
  return n;
}
