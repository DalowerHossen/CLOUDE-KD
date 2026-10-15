// path: types/contracts/tokens.ts
import type { Uuid } from './common';

export type TokenDocumentType = 'invoice' | 'estimate' | 'receipt' | 'hub' | 'contract' | 'payslip' | 'payment';

export interface IssuedToken {
  id: Uuid;
  /** URL-safe token. Shown once; only its hash is stored. */
  token: string;
  expiresAt: string;
}

export type TokenVerification =
  | { valid: true; id: Uuid; docType: TokenDocumentType; docId: Uuid; companyId: Uuid; otpRequired: boolean }
  | { valid: false; reason: 'invalid' | 'expired' | 'revoked' };

export interface TokenService {
  issue(input: { docType: TokenDocumentType; docId: Uuid; companyId: Uuid; ttlDays: number; otpRequired?: boolean }): Promise<IssuedToken>;
  verify(token: string): Promise<TokenVerification>;
  revoke(id: Uuid): Promise<void>;
  reissue(id: Uuid): Promise<IssuedToken>;
  sendOtp(id: Uuid): Promise<void>;
  verifyOtp(id: Uuid, code: string): Promise<boolean>;
}
