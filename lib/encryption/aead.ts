// path: lib/encryption/aead.ts
// AES-256-GCM with HKDF-derived data keys. Pure: the root keys are passed in, never read here.
import { createCipheriv, createDecipheriv, hkdfSync, randomBytes } from 'node:crypto';
import type { EncryptedPayload, EncryptionPurpose } from '@/types/contracts';

export const PURPOSES: readonly EncryptionPurpose[] = [
  'files',
  'processor-credentials',
  'oauth-tokens',
  'kyc',
  'pii',
];

const IV_BYTES = 12;
const TAG_BYTES = 16;

export type RootKeys = Readonly<Record<number, Uint8Array | undefined>>;

/** HKDF-SHA256 over the root key of a version; purpose and scope select an independent data key. */
export function deriveDataKey(
  roots: RootKeys,
  version: number,
  purpose: EncryptionPurpose,
  scope: string,
): Buffer {
  const root = roots[version];
  if (!root) throw new RangeError(`No key is configured for key version ${version}.`);
  return Buffer.from(
    hkdfSync(
      'sha256',
      root,
      Buffer.from(`kd.v${version}`),
      Buffer.from(`kd|${purpose}|${scope}`),
      32,
    ),
  );
}

/** The version, purpose and scope are bound to the ciphertext, so a payload cannot be moved to another purpose or company. */
function aad(version: number, purpose: EncryptionPurpose, scope: string): Buffer {
  return Buffer.from(`kd1|${version}|${purpose}|${scope}`);
}

export function encryptBytes(
  roots: RootKeys,
  version: number,
  purpose: EncryptionPurpose,
  plaintext: Uint8Array,
  scope = '',
): EncryptedPayload {
  const key = deriveDataKey(roots, version, purpose, scope);
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv('aes-256-gcm', key, iv, { authTagLength: TAG_BYTES });
  cipher.setAAD(aad(version, purpose, scope));
  const body = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  return {
    ciphertext: body.toString('base64'),
    iv: iv.toString('base64'),
    tag: cipher.getAuthTag().toString('base64'),
    keyVersion: version,
  };
}

/** Throws when the payload was changed, moved to another purpose or scope, or the key does not match. */
export function decryptBytes(
  roots: RootKeys,
  purpose: EncryptionPurpose,
  payload: EncryptedPayload,
  scope = '',
): Uint8Array {
  const key = deriveDataKey(roots, payload.keyVersion, purpose, scope);
  const iv = Buffer.from(payload.iv, 'base64');
  const tag = Buffer.from(payload.tag, 'base64');
  if (iv.length !== IV_BYTES || tag.length !== TAG_BYTES)
    throw new Error('Invalid encrypted payload.');
  const decipher = createDecipheriv('aes-256-gcm', key, iv, { authTagLength: TAG_BYTES });
  decipher.setAAD(aad(payload.keyVersion, purpose, scope));
  decipher.setAuthTag(tag);
  const out = Buffer.concat([
    decipher.update(Buffer.from(payload.ciphertext, 'base64')),
    decipher.final(),
  ]);
  return new Uint8Array(out);
}
