// path: services/security/turnstile.ts
// Cloudflare Turnstile server-side check. Fails closed: a network problem or a bad answer means "not verified".
import 'server-only';
import { z } from 'zod';
import { getServerEnv } from '@/lib/env';
import { createLogger } from '@/lib/logger';

const log = createLogger({ component: 'turnstile' });
const VERIFY_URL = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';
const answer = z.object({ success: z.boolean() }).passthrough();

export async function verifyTurnstile(token: string, ip: string): Promise<boolean> {
  if (token.length === 0 || token.length > 4096) return false;
  const body = new URLSearchParams({
    secret: getServerEnv().TURNSTILE_SECRET_KEY,
    response: token,
  });
  if (ip && ip !== '0.0.0.0') body.set('remoteip', ip);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 5000);
  try {
    const response = await fetch(VERIFY_URL, { method: 'POST', body, signal: controller.signal });
    if (!response.ok) return false;
    return answer.parse(await response.json()).success;
  } catch (error) {
    log.warn('turnstile check failed', { error });
    return false;
  } finally {
    clearTimeout(timer);
  }
}
