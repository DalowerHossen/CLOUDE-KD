// path: services/approval/queries.ts
// Read models for the approval pages. They run with the caller's client, so RLS limits the rows.
import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import { z } from 'zod';
import { InternalError } from '@/lib/errors';

export const approvalListSchema = z
  .object({
    status: z
      .enum(['pending', 'approved', 'rejected', 'escalated', 'expired', 'cancelled'])
      .optional(),
    cursor: z.string().uuid().nullable().default(null),
    limit: z.coerce.number().int().min(1).max(100).default(25),
  })
  .strict();
export type ApprovalListQuery = z.infer<typeof approvalListSchema>;

const requestRow = z
  .object({
    id: z.string().uuid(),
    company_id: z.string().uuid().nullable(),
    action: z.string(),
    requester_id: z.string().uuid(),
    requester_role: z.string(),
    is_draft: z.boolean(),
    required_level: z.string(),
    current_level: z.string(),
    status: z.string(),
    escalation_count: z.number().int(),
    decision_reason: z.string().nullable(),
    created_at: z.string(),
    decided_at: z.string().nullable(),
  })
  .strip();

export interface ApprovalListItem {
  id: string;
  companyId: string | null;
  action: string;
  requesterId: string;
  requesterRole: string;
  isDraft: boolean;
  requiredLevel: string;
  currentLevel: string;
  status: string;
  escalationCount: number;
  decisionReason: string | null;
  createdAt: string;
  decidedAt: string | null;
}

export interface ApprovalListPage {
  items: ApprovalListItem[];
  nextCursor: string | null;
}

export async function listApprovals(
  client: SupabaseClient,
  query: ApprovalListQuery,
): Promise<ApprovalListPage> {
  let q = client
    .from('approval_requests')
    .select(
      'id, company_id, action, requester_id, requester_role, is_draft, required_level, current_level, status, escalation_count, decision_reason, created_at, decided_at',
    )
    .is('deleted_at', null)
    .order('id', { ascending: false })
    .limit(query.limit + 1);
  if (query.status) q = q.eq('status', query.status);
  if (query.cursor) q = q.lt('id', query.cursor);
  const { data, error } = await q;
  if (error) throw new InternalError(error);
  const rows = z.array(requestRow).parse(data);
  const hasMore = rows.length > query.limit;
  const page = hasMore ? rows.slice(0, query.limit) : rows;
  return {
    items: page.map((r) => ({
      id: r.id,
      companyId: r.company_id,
      action: r.action,
      requesterId: r.requester_id,
      requesterRole: r.requester_role,
      isDraft: r.is_draft,
      requiredLevel: r.required_level,
      currentLevel: r.current_level,
      status: r.status,
      escalationCount: r.escalation_count,
      decisionReason: r.decision_reason,
      createdAt: r.created_at,
      decidedAt: r.decided_at,
    })),
    nextCursor: hasMore ? (page[page.length - 1]?.id ?? null) : null,
  };
}

const stepRow = z
  .object({
    id: z.string().uuid(),
    step_order: z.number().int(),
    level: z.string(),
    status: z.string(),
    sla_due_at: z.string(),
    decided_by: z.string().uuid().nullable(),
    decided_role: z.string().nullable(),
    acted_for: z.string().uuid().nullable(),
    reason: z.string().nullable(),
    decided_at: z.string().nullable(),
  })
  .strip();

export interface ApprovalHistoryStep {
  id: string;
  order: number;
  level: string;
  status: string;
  slaDueAt: string;
  decidedBy: string | null;
  decidedRole: string | null;
  actedFor: string | null;
  reason: string | null;
  decidedAt: string | null;
}

export async function approvalHistory(
  client: SupabaseClient,
  requestId: string,
): Promise<ApprovalHistoryStep[]> {
  const { data, error } = await client
    .from('approval_steps')
    .select(
      'id, step_order, level, status, sla_due_at, decided_by, decided_role, acted_for, reason, decided_at',
    )
    .eq('request_id', requestId)
    .is('deleted_at', null)
    .order('step_order', { ascending: true });
  if (error) throw new InternalError(error);
  return z
    .array(stepRow)
    .parse(data)
    .map((r) => ({
      id: r.id,
      order: r.step_order,
      level: r.level,
      status: r.status,
      slaDueAt: r.sla_due_at,
      decidedBy: r.decided_by,
      decidedRole: r.decided_role,
      actedFor: r.acted_for,
      reason: r.reason,
      decidedAt: r.decided_at,
    }));
}
