// path: services/esign/statement.ts
// The sentence a signer accepts when signing. The exact text and its checksum are stored with every signature, so a later
// change of the wording cannot change what a past signer accepted.
import { sha256Hex } from '@/lib/utils/hash';

export const SIGNATURE_STATEMENT_VERSION = '2026-10-18';

export const SIGNATURE_STATEMENT =
  'I have read this contract and I agree to sign it electronically. I understand that my typed name, drawing or image, together with the time, my network address and my device, is my legal signature and is kept as proof.';

export async function statementHash(): Promise<string> {
  return sha256Hex(`${SIGNATURE_STATEMENT_VERSION}|${SIGNATURE_STATEMENT}`);
}
