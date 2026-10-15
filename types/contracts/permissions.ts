// path: types/contracts/permissions.ts
import type { Actor, ApprovalLevel } from './common';

export interface PermissionService {
  can(actor: Actor, action: string, resource?: { type: string; id?: string | null }): Promise<boolean>;
  /** Looks up the approval level of an action in lib/auth/approval-rules.ts. */
  requireApproval(action: string): Promise<ApprovalLevel>;
}

/** Shape of a permission fragment entry (config/permissions/sNN-*.ts). */
export interface PermissionDefinition {
  action: string;
  description: string;
  defaultRoles: readonly string[];
  approvalLevel: ApprovalLevel;
}
