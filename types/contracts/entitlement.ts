// path: types/contracts/entitlement.ts
import type { Uuid } from './common';

export interface EntitlementService {
  has(companyId: Uuid, key: string): Promise<boolean>;
  /** Numeric limit for the key, or null when unlimited. */
  limit(companyId: Uuid, key: string): Promise<number | null>;
}
