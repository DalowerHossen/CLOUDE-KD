// path: services/audit/audit-service.ts
// Implements the audit contract. Writes go through the service-role function kd_audit_append, which assigns the
// sequence and the hash chain inside the database. Reads for the admin page use the caller's own client (RLS applies).
import 'server-only';
import { z } from 'zod';
import { InternalError } from '@/lib/errors';
import { tryGetService } from '@/lib/container';
import { getContext } from '@/lib/logger/correlation';
import { getAdminSupabase } from '@/lib/supabase/admin';
import type { AuditEntryInput, AuditService, ChainVerificationResult } from '@/types/contracts';
import { readRequestMeta } from './request-meta';

const verifySchema = z
  .object({
    ok: z.boolean(),
    chain: z.string(),
    checkedFrom: z.coerce.string().nullable(),
    checkedTo: z.coerce.string().nullable(),
    firstBrokenSequence: z.coerce.string().nullable(),
    gaps: z.array(z.coerce.string()),
  })
  .strip();

/** Chain key of a tenant or of the platform chain. Mirrors the database rule coalesce(company_id::text, 'platform'). */
export const chainKeyFor = (companyId: string | null): string => companyId ?? 'platform';

export async function verifyChainByKey(
  chainKey: string,
  range: { fromSequence: string | null; toSequence: string | null },
): Promise<ChainVerificationResult> {
  const { data, error } = await getAdminSupabase().rpc('kd_audit_verify', {
    p_chain: chainKey,
    p_from: range.fromSequence === null ? null : Number(range.fromSequence),
    p_to: range.toSequence === null ? null : Number(range.toSequence),
  });
  if (error) throw new InternalError(error);
  const parsed = verifySchema.parse(data);
  return {
    ok: parsed.ok,
    checkedFrom: parsed.checkedFrom ?? '0',
    checkedTo: parsed.checkedTo ?? '0',
    firstBrokenSequence: parsed.firstBrokenSequence,
    gaps: parsed.gaps,
  };
}

export function createAuditService(): AuditService {
  return {
    async record(entry: AuditEntryInput): Promise<void> {
      const context = getContext();
      const actor = (await tryGetService('auth')?.getActor()) ?? null;
      const companyId =
        entry.companyId !== undefined
          ? entry.companyId
          : (context?.companyId ?? actor?.companyId ?? null);
      const meta = await readRequestMeta();
      const { error } = await getAdminSupabase().rpc('kd_audit_append', {
        p_company: companyId,
        p_actor: actor?.userId ?? context?.actorId ?? null,
        p_role: actor?.role ?? null,
        p_impersonated_by: actor?.impersonatedBy ?? null,
        p_action: entry.action,
        p_resource_type: entry.resourceType,
        p_resource_id: entry.resourceId,
        p_ip_masked: meta.ipMasked,
        p_ip_hash: meta.ipHash,
        p_user_agent_hash: meta.userAgentHash,
        p_correlation: context?.correlationId ?? null,
        p_metadata: entry.metadata ?? {},
      });
      if (error) throw new InternalError(error);
    },
    async verifyChain(range) {
      const context = getContext();
      return verifyChainByKey(chainKeyFor(context?.companyId ?? null), range);
    },
  };
}
