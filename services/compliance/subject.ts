// path: services/compliance/subject.ts
// Keyed hash of a data subject. The raw e-mail address or id is never stored in compliance tables.
import 'server-only';
import { getServerEnv } from '@/lib/env';
import { hmacSha256Hex } from '@/lib/utils/hash';

export async function subjectHash(subject: string): Promise<string> {
  return hmacSha256Hex(getServerEnv().HMAC_TOKEN_SECRET, `subject:${subject.trim().toLowerCase()}`);
}
