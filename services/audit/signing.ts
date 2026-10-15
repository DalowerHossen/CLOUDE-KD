// path: services/audit/signing.ts
// Ed25519 signatures for audit checkpoints. The seed comes only from AUDIT_SIGNING_KEY (base64, 32 bytes).
import 'server-only';
import * as ed from '@noble/ed25519';
import { getServerEnv } from '@/lib/env';
import { bytesToHex, sha256Hex } from '@/lib/utils/hash';

function seed(): Uint8Array {
  return Uint8Array.from(Buffer.from(getServerEnv().AUDIT_SIGNING_KEY, 'base64'));
}

export async function auditPublicKey(): Promise<Uint8Array> {
  return ed.getPublicKeyAsync(seed());
}

/** Short identifier of the signing key, stored on each checkpoint so a key rotation stays traceable. */
export async function auditKeyId(): Promise<string> {
  return (await sha256Hex(await auditPublicKey())).slice(0, 16);
}

export async function signCheckpoint(message: string): Promise<string> {
  const signature = await ed.signAsync(new TextEncoder().encode(message), seed());
  return bytesToHex(signature);
}

export async function verifyCheckpointSignature(message: string, signatureHex: string): Promise<boolean> {
  try {
    const signature = Uint8Array.from(Buffer.from(signatureHex, 'hex'));
    return await ed.verifyAsync(signature, new TextEncoder().encode(message), await auditPublicKey());
  } catch {
    return false;
  }
}

export function checkpointMessage(parts: {
  chainKey: string;
  fromSequence: string;
  toSequence: string;
  merkleRoot: string;
  lastEntryHash: string;
}): string {
  return ['kd-audit-checkpoint-v1', parts.chainKey, parts.fromSequence, parts.toSequence, parts.merkleRoot, parts.lastEntryHash].join('|');
}
