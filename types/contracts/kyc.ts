// path: types/contracts/kyc.ts
import type { Uuid } from './common';

export type KycStatus = 'not_submitted' | 'submitted' | 'in_review' | 'approved' | 'rejected';

export interface KycService {
  status(companyId: Uuid): Promise<KycStatus>;
  isVerified(companyId: Uuid): Promise<boolean>;
}
