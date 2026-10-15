// path: lib/auth/roles.ts
// Role model: super_admin > ceo > admin_staff > owner > staff. Clients have no login (tokenized links only).
import { ADMIN_SUB_ROLES, PLATFORM_ROLES, ROLES, TENANT_ROLES } from '@/types/contracts/common';
import type { AdminSubRole, Role } from '@/types/contracts/common';

export { ADMIN_SUB_ROLES, PLATFORM_ROLES, ROLES, TENANT_ROLES };
export type { AdminSubRole, Role };

/** Lower number = more authority. */
export const ROLE_RANK: Readonly<Record<Role, number>> = {
  super_admin: 1,
  ceo: 2,
  admin_staff: 3,
  owner: 4,
  staff: 5,
};

export function isRole(value: unknown): value is Role {
  return typeof value === 'string' && (ROLES as readonly string[]).includes(value);
}

export function isAdminSubRole(value: unknown): value is AdminSubRole {
  return typeof value === 'string' && (ADMIN_SUB_ROLES as readonly string[]).includes(value);
}

export function isPlatformRole(role: Role): boolean {
  return PLATFORM_ROLES.includes(role);
}

export function isTenantRole(role: Role): boolean {
  return TENANT_ROLES.includes(role);
}

/** True when `a` has strictly more authority than `b`. */
export function outranks(a: Role, b: Role): boolean {
  return ROLE_RANK[a] < ROLE_RANK[b];
}

/**
 * Permission domains (first segment of an action such as "kyc.review") that each admin_staff sub-role may use.
 * An admin_staff user without a sub-role has no permissions (least privilege).
 */
export const SUB_ROLE_DOMAINS: Readonly<Record<AdminSubRole, readonly string[]>> = {
  kyc_reviewer: ['kyc'],
  payment_processor: ['payment', 'payout', 'processor'],
  support_agent: ['support', 'client', 'ticket'],
  content_manager: ['content', 'cms', 'blog', 'help'],
  compliance_officer: ['audit', 'compliance', 'consent', 'dsar', 'approval'],
  fraud_analyst: ['fraud', 'security', 'risk'],
  finance_analyst: ['report', 'accounting', 'payout', 'subscription'],
};
