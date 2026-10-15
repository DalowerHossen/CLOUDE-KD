// path: services/audit/search.ts
// Audit search with keyset pagination on the time-ordered UUID v7 id. Runs with the caller's client so RLS applies.
import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import { z } from 'zod';
import { InternalError } from '@/lib/errors';
import type { AuditExportRow } from '@/lib/compliance/audit-export';

export const auditSearchSchema = z
  .object({
    action: z.string().trim().max(100).regex(/^[a-z0-9_.]*$/).optional(),
    resourceType: z.string().trim().max(100).regex(/^[a-z0-9_]*$/).optional(),
    resourceId: z.string().uuid().optional(),
    actorUserId: z.string().uuid().optional(),
    companyId: z.string().uuid().optional(),
    from: z.string().datetime({ offset: true }).optional(),
    to: z.string().datetime({ offset: true }).optional(),
    cursor: z.string().uuid().nullable().default(null),
    limit: z.coerce.number().int().min(1).max(200).default(50),
  })
  .strict();

export type AuditSearch = z.infer<typeof auditSearchSchema>;

const rowSchema = z
  .object({
    id: z.string().uuid(),
    company_id: z.string().uuid().nullable(),
    chain_key: z.string(),
    sequence: z.coerce.string(),
    actor_user_id: z.string().uuid().nullable(),
    actor_role: z.string().nullable(),
    action: z.string(),
    resource_type: z.string(),
    resource_id: z.string().uuid().nullable(),
    ip_masked: z.string().nullable(),
    correlation_id: z.string().nullable(),
    created_at: z.string(),
    entry_hash: z.string(),
  })
  .strip();

const COLUMNS =
  'id, company_id, chain_key, sequence, actor_user_id, actor_role, action, resource_type, resource_id, ip_masked, correlation_id, created_at, entry_hash';

export interface AuditPage {
  items: AuditExportRow[];
  nextCursor: string | null;
}

export async function searchAudit(client: SupabaseClient, filter: AuditSearch): Promise<AuditPage> {
  let query = client.from('audit_logs').select(COLUMNS).order('id', { ascending: false }).limit(filter.limit + 1);
  if (filter.action) query = query.like('action', `${filter.action}%`);
  if (filter.resourceType) query = query.eq('resource_type', filter.resourceType);
  if (filter.resourceId) query = query.eq('resource_id', filter.resourceId);
  if (filter.actorUserId) query = query.eq('actor_user_id', filter.actorUserId);
  if (filter.companyId) query = query.eq('company_id', filter.companyId);
  if (filter.from) query = query.gte('created_at', filter.from);
  if (filter.to) query = query.lte('created_at', filter.to);
  if (filter.cursor) query = query.lt('id', filter.cursor);
  const { data, error } = await query;
  if (error) throw new InternalError(error);
  const rows = z.array(rowSchema).parse(data);
  const hasMore = rows.length > filter.limit;
  const page = hasMore ? rows.slice(0, filter.limit) : rows;
  const items: AuditExportRow[] = page.map((r) => ({
    id: r.id,
    companyId: r.company_id,
    chainKey: r.chain_key,
    sequence: r.sequence,
    actorUserId: r.actor_user_id,
    actorRole: r.actor_role,
    action: r.action,
    resourceType: r.resource_type,
    resourceId: r.resource_id,
    ipMasked: r.ip_masked,
    correlationId: r.correlation_id,
    createdAt: r.created_at,
    entryHash: r.entry_hash,
  }));
  return { items, nextCursor: hasMore ? (page[page.length - 1]?.id ?? null) : null };
}
