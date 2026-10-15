// path: types/contracts/approval.ts
import type { ApprovalLevel, Uuid } from './common';

export type ApprovalStatus = 'pending' | 'approved' | 'rejected' | 'escalated' | 'expired' | 'cancelled';

export interface ApprovalRequestInput {
  action: string;
  payload: Record<string, unknown>;
  requesterId: Uuid;
  companyId: Uuid | null;
}

export interface ApprovalDecision {
  approverId: Uuid;
  decision: 'approve' | 'reject';
  reason: string | null;
}

export interface ApprovalState {
  requestId: Uuid;
  status: ApprovalStatus;
  requiredLevel: ApprovalLevel;
  currentLevel: ApprovalLevel;
}

export interface ApprovalService {
  request(input: ApprovalRequestInput): Promise<ApprovalState>;
  decide(requestId: Uuid, decision: ApprovalDecision): Promise<ApprovalState>;
  status(requestId: Uuid): Promise<ApprovalState>;
}

/** Shape of an approval rule fragment entry (config/approval/sNN-*.ts). */
export interface ApprovalRuleDefinition {
  action: string;
  level: ApprovalLevel;
  slaHours: number;
}
