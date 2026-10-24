// path: services/base/permission-service.ts
// Implements the permissions contract. Staff grants are read through the user-bound client (RLS: own membership only);
// role overrides are read with the service role and cached for a short time.
import 'server-only';
import { z } from 'zod';
import { resolveApprovalLevel } from '@/lib/auth/approval-rules';
import { evaluatePermission, type RoleOverride } from '@/lib/auth/permissions';
import { getAdminSupabase } from '@/lib/supabase/admin';
import { createServerSupabase } from '@/lib/supabase/server';
import type { Actor, PermissionService } from '@/types/contracts';

const OVERRIDE_TTL_MS = 30_000;
const overrideCache = new Map<string, { at: number; rows: RoleOverride[] }>();

const overrideRows = z.array(z.object({ permission: z.string(), allowed: z.boolean() }).strip());
const grantRows = z.array(z.object({ granted_permissions: z.array(z.string()) }).strip());

async function loadOverrides(actor: Actor): Promise<RoleOverride[]> {
  const key = `${actor.role}:${actor.companyId ?? 'platform'}`;
  const hit = overrideCache.get(key);
  if (hit && Date.now() - hit.at < OVERRIDE_TTL_MS) return hit.rows;
  let query = getAdminSupabase()
    .from('role_permissions')
    .select('permission, allowed')
    .eq('role_key', actor.role)
    .is('deleted_at', null);
  query = actor.companyId
    ? query.or(`company_id.is.null,company_id.eq.${actor.companyId}`)
    : query.is('company_id', null);
  const { data, error } = await query;
  if (error) throw error;
  const rows = overrideRows
    .parse(data)
    .map((r): RoleOverride => ({ action: r.permission, allowed: r.allowed }));
  overrideCache.set(key, { at: Date.now(), rows });
  return rows;
}

async function loadStaffGrants(actor: Actor): Promise<string[]> {
  if (!actor.companyId) return [];
  const client = await createServerSupabase();
  const { data, error } = await client
    .from('memberships')
    .select('granted_permissions')
    .eq('user_id', actor.userId)
    .eq('company_id', actor.companyId)
    .eq('status', 'active')
    .is('deleted_at', null);
  if (error) throw error;
  return grantRows.parse(data).flatMap((r) => r.granted_permissions);
}

export function clearPermissionCache(): void {
  overrideCache.clear();
}

export function createPermissionService(): PermissionService {
  return {
    async can(actor, action) {
      try {
        const overrides = await loadOverrides(actor);
        const grantedPermissions = actor.role === 'staff' ? await loadStaffGrants(actor) : [];
        return evaluatePermission({ actor, action, overrides, grantedPermissions });
      } catch {
        return false;
      }
    },
    requireApproval: async (action) => resolveApprovalLevel(action),
  };
}
