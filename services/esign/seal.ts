// path: services/esign/seal.ts
// The seal of a signed contract: a keyed checksum over the wording checksum, the checksum of the signed file and the
// checksums of every signature. Anyone who changes the file or a signature record breaks it. The key is a platform secret,
// passed in by the caller so the maths can be checked without an environment.
import { hmacSha256Hex, timingSafeEqualStrings } from '@/lib/utils/hash';

export interface SealParts {
  contractId: string;
  docHash: string;
  archiveHash: string;
  /** Checksum of each signature record (signer id, name, method, time), in signing order. */
  signatures: readonly string[];
}

function message(parts: SealParts): string {
  return [
    'kd-contract-seal-v1',
    parts.contractId,
    parts.docHash,
    parts.archiveHash,
    ...parts.signatures,
  ].join('|');
}

export async function computeSeal(secret: string, parts: SealParts): Promise<string> {
  return hmacSha256Hex(secret, message(parts));
}

export async function verifySeal(secret: string, parts: SealParts, seal: string): Promise<boolean> {
  return timingSafeEqualStrings(await computeSeal(secret, parts), seal);
}
