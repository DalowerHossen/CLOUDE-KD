// path: types/contracts/common.ts
// Shared types used by the cross-STEP contracts.

export type Uuid = string;

export const ROLES = ['super_admin', 'ceo', 'admin_staff', 'owner', 'staff'] as const;
export type Role = (typeof ROLES)[number];

export const ADMIN_SUB_ROLES = [
  'kyc_reviewer',
  'payment_processor',
  'support_agent',
  'content_manager',
  'compliance_officer',
  'fraud_analyst',
  'finance_analyst',
] as const;
export type AdminSubRole = (typeof ADMIN_SUB_ROLES)[number];

export const PLATFORM_ROLES: readonly Role[] = ['super_admin', 'ceo', 'admin_staff'];
export const TENANT_ROLES: readonly Role[] = ['owner', 'staff'];

export interface Actor {
  userId: Uuid;
  role: Role;
  subRole: AdminSubRole | null;
  /** Null for platform roles. */
  companyId: Uuid | null;
  email: string;
  sessionId: string;
  /** User id of the administrator when this session is an impersonation. */
  impersonatedBy: Uuid | null;
  /** ISO 8601 UTC time of the last full authentication. */
  authenticatedAt: string;
  /** ISO 8601 UTC time of the last step-up check, or null. */
  lastStepUpAt: string | null;
  mfaVerified: boolean;
}

export interface TenantContext {
  companyId: Uuid;
  planKey: string;
  dataRegion: string;
  status: 'active' | 'suspended' | 'closed';
}

/** L0 no approval, L1 staff action approved by owner or lead, L2 CEO, L3 super_admin, L2+L3 both. */
export type ApprovalLevel = 'L0' | 'L1' | 'L2' | 'L3' | 'L2+L3';

export interface PageRequest {
  cursor: string | null;
  limit: number;
}

export interface Page<T> {
  items: T[];
  nextCursor: string | null;
}

/** Where a request comes from, used by the VPN, proxy and Tor policy. */
export type NetworkContext = 'signup' | 'login' | 'payment' | 'kyc' | 'admin' | 'other';
