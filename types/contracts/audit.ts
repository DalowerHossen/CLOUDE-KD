// path: types/contracts/audit.ts
import type { Uuid } from './common';

export interface AuditEntryInput {
  /** For example "invoice.created" or "payment.captured". */
  action: string;
  resourceType: string;
  resourceId: Uuid | null;
  metadata?: Record<string, unknown>;
  /** Overrides the tenant taken from the request context (platform actions on a tenant). */
  companyId?: Uuid | null;
}

export interface ChainVerificationResult {
  ok: boolean;
  checkedFrom: string;
  checkedTo: string;
  firstBrokenSequence: string | null;
  gaps: string[];
}

export interface AuditService {
  /** Actor, tenant, ip, user agent, device and correlation id come from the request context. */
  record(entry: AuditEntryInput): Promise<void>;
  verifyChain(range: { fromSequence: string | null; toSequence: string | null }): Promise<ChainVerificationResult>;
}
