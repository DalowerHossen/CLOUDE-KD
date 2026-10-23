// path: services/approval/routes.ts
// Route handlers shared by the tenant API (/api/approvals) and the platform API (/api/approvals/platform).
import 'server-only';
import type { NextRequest } from 'next/server';
import { z } from 'zod';
import { withApi, type RouteContext } from '@/lib/api/with-api';
import { ForbiddenError } from '@/lib/errors';
import { createServerSupabase } from '@/lib/supabase/server';
import { createDelegation, delegationSchema, revokeDelegation } from './delegation';
import { approvalHistory, approvalListSchema, listApprovals } from './queries';
import { bulkDecide } from './bulk';
import { decideAs } from './approval-service';
import { setSoloMode } from './solo-mode';

const reasonSchema = z.string().trim().max(1000).nullable().default(null);
const decisionBody = z
  .object({ decision: z.enum(['approve', 'reject']), reason: reasonSchema })
  .strict();
const bulkBody = z
  .object({
    ids: z.array(z.string().uuid()).min(1).max(50),
    decision: z.enum(['approve', 'reject']),
    reason: reasonSchema,
  })
  .strict();
const idParams = z.object({ id: z.string().uuid() }).strict();
const revokeQuery = z.object({ id: z.string().uuid() }).strict();
const soloBody = z.object({ enabled: z.boolean() }).strict();

const AUDITED_BY_SERVICE = 'The approval service writes the audit entry.';

type RouteHandler = (request: NextRequest, routeContext: RouteContext) => Promise<Response>;

export interface ApprovalRoutes {
  list: RouteHandler;
  decide: RouteHandler;
  bulk: RouteHandler;
  history: RouteHandler;
  delegate: RouteHandler;
  undelegate: RouteHandler;
}

export function buildApprovalRoutes(scope: 'tenant' | 'platform'): ApprovalRoutes {
  const common = { scope, ...(scope === 'platform' ? { networkContext: 'admin' as const } : {}) };
  const prefix = scope === 'platform' ? 'admin.approvals' : 'approvals';

  const list = withApi(
    {
      id: `${prefix}.list`,
      ...common,
      permission: { action: 'approval.read', resourceType: 'approval_request' },
      query: approvalListSchema,
    },
    async ({ query }) => ({ data: await listApprovals(await createServerSupabase(), query) }),
  );

  const history = withApi(
    {
      id: `${prefix}.history`,
      ...common,
      permission: { action: 'approval.read', resourceType: 'approval_request' },
      params: idParams,
    },
    async ({ params }) => ({
      data: { steps: await approvalHistory(await createServerSupabase(), params.id) },
    }),
  );

  const decide = withApi(
    {
      id: `${prefix}.decide`,
      ...common,
      permission: { action: 'approval.decide', resourceType: 'approval_request' },
      params: idParams,
      body: decisionBody,
      auditExempt: AUDITED_BY_SERVICE,
    },
    async ({ params, body, actor }) => {
      if (!actor) throw new ForbiddenError();
      const state = await decideAs(
        actor,
        params.id,
        { approverId: actor.userId, decision: body.decision, reason: body.reason },
        actor.companyId,
      );
      return { data: state };
    },
  );

  const bulk = withApi(
    {
      id: `${prefix}.bulk`,
      ...common,
      permission: { action: 'approval.bulk_decide', resourceType: 'approval_request' },
      body: bulkBody,
      auditExempt: AUDITED_BY_SERVICE,
    },
    async ({ body, actor }) => {
      if (!actor) throw new ForbiddenError();
      return { data: { results: await bulkDecide(actor, body.ids, body.decision, body.reason) } };
    },
  );

  const delegate = withApi(
    {
      id: `${prefix}.delegate`,
      ...common,
      permission: { action: 'approval.delegate', resourceType: 'approval_delegation' },
      body: delegationSchema,
      auditExempt: AUDITED_BY_SERVICE,
    },
    async ({ body, actor }) => {
      if (!actor) throw new ForbiddenError();
      return { status: 201, data: { id: await createDelegation(actor, body) } };
    },
  );

  const undelegate = withApi(
    {
      id: `${prefix}.undelegate`,
      ...common,
      permission: { action: 'approval.delegate', resourceType: 'approval_delegation' },
      query: revokeQuery,
      auditExempt: AUDITED_BY_SERVICE,
    },
    async ({ query, actor }) => {
      if (!actor) throw new ForbiddenError();
      await revokeDelegation(actor, query.id);
      return { data: { revoked: true } };
    },
  );

  return { list, history, decide, bulk, delegate, undelegate };
}

export const soloModeRoute = withApi(
  {
    id: 'admin.approvals.solo_mode',
    scope: 'platform',
    roles: ['super_admin'],
    networkContext: 'admin',
    permission: { action: 'approval.solo_mode', resourceType: 'feature_flag' },
    stepUp: { maxAgeSeconds: 300 },
    body: soloBody,
    auditExempt: AUDITED_BY_SERVICE,
  },
  async ({ body, actor }) => {
    if (!actor) throw new ForbiddenError();
    await setSoloMode(actor, body.enabled);
    return { data: { enabled: body.enabled } };
  },
);
