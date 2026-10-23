// path: lib/auth/permissions.ts
// Pure permission evaluation (no database). The service in services/base/permission-service.ts loads the inputs.
// Rules: unknown action = deny. Platform roles need the role in defaultRoles. admin_staff additionally needs a sub-role
// whose domain list contains the action domain. Staff need the action in defaultRoles AND an owner grant.
import { permissions as registeredPermissions } from '@/config/permissions';
import type { Actor, PermissionDefinition } from '@/types/contracts';
import { SUB_ROLE_DOMAINS } from './roles';

export interface RoleOverride {
  action: string;
  allowed: boolean;
}

export interface EvaluationInput {
  actor: Pick<Actor, 'role' | 'subRole'>;
  action: string;
  /** Permission list granted to a staff member by the owner. Entries may end in ".*" (a whole domain). */
  grantedPermissions?: readonly string[];
  /** Company-level rows of role_permissions for the actor's role. An explicit deny always wins. */
  overrides?: readonly RoleOverride[];
  definitions?: readonly PermissionDefinition[];
}

const ACTION_RE = /^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)+$/;
const GRANT_RE = /^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)*(\.\*)?$/;

export function domainOf(action: string): string {
  return action.split('.')[0] ?? '';
}

export function grantMatches(grant: string, action: string): boolean {
  if (grant === action) return true;
  return grant.endsWith('.*') && action.startsWith(grant.slice(0, -1));
}

export function isValidAction(action: string): boolean {
  return ACTION_RE.test(action);
}

export function evaluatePermission(input: EvaluationInput): boolean {
  const definitions = input.definitions ?? registeredPermissions;
  if (!isValidAction(input.action)) return false;
  const definition = definitions.find((d) => d.action === input.action);
  if (!definition) return false;
  const overrides = input.overrides ?? [];
  if (overrides.some((o) => o.action === input.action && !o.allowed)) return false;

  const { role, subRole } = input.actor;
  const extraAllow = overrides.some((o) => o.action === input.action && o.allowed);
  if (!definition.defaultRoles.includes(role) && !extraAllow) return false;

  if (role === 'admin_staff') {
    if (!subRole) return false;
    if (!SUB_ROLE_DOMAINS[subRole].includes(domainOf(input.action))) return false;
  }
  if (role === 'staff') {
    return (input.grantedPermissions ?? []).some((g) => grantMatches(g, input.action));
  }
  return true;
}

export interface GrantValidation {
  ok: boolean;
  rejected: string[];
}

/** Checks a list an owner wants to give to staff: well-formed, and every matched action must be open to staff. */
export function validateStaffGrants(
  grants: readonly string[],
  definitions: readonly PermissionDefinition[] = registeredPermissions,
): GrantValidation {
  const rejected: string[] = [];
  for (const grant of grants) {
    if (!GRANT_RE.test(grant)) {
      rejected.push(grant);
      continue;
    }
    const matched = definitions.filter((d) => grantMatches(grant, d.action));
    if (matched.length === 0 || matched.some((d) => !d.defaultRoles.includes('staff'))) {
      rejected.push(grant);
    }
  }
  return { ok: rejected.length === 0, rejected };
}
