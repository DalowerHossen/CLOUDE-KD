// path: lib/alerting/auth.ts
import { stripHeaderInjection } from '@/lib/security/http-safety';

/** Bearer header for webhook and SMS gateway channels. */
export function authHeaderForSecret(secret: string): Record<string, string> {
  return { authorization: `Bearer ${stripHeaderInjection(secret)}` };
}
