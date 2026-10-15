// path: types/contracts/encryption.ts

export type EncryptionPurpose = 'files' | 'processor-credentials' | 'oauth-tokens' | 'kyc' | 'pii';

export interface EncryptedPayload {
  /** Base64 text. */
  ciphertext: string;
  iv: string;
  tag: string;
  keyVersion: number;
}

export interface EncryptionService {
  /** AES-256-GCM. Keys are derived from the environment master key; scope is usually the company id. */
  encrypt(
    purpose: EncryptionPurpose,
    plaintext: Uint8Array | string,
    scope?: string,
  ): Promise<EncryptedPayload>;
  decrypt(
    purpose: EncryptionPurpose,
    payload: EncryptedPayload,
    scope?: string,
  ): Promise<Uint8Array>;
}
