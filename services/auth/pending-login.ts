// path: services/auth/pending-login.ts
// Short-lived signed cookie that carries a half-finished login (password accepted, second factor still open).
// It holds no session. The lock counter is checked again when the second factor arrives.
import 'server-only';
import { jwtVerify, SignJWT } from 'jose';
import { cookies } from 'next/headers';
import { z } from 'zod';
import { cookieSecure } from '@/lib/auth/session';
import { randomHex } from '@/lib/utils/hash';
import { pepper } from './credentials';

const COOKIE = 'kd_pending';
const TTL_SECONDS = 300;

const payloadSchema = z
  .object({
    sub: z.string().uuid(),
    idh: z.string().regex(/^[0-9a-f]{64}$/),
    email: z.string().email(),
    purpose: z.enum(['login-2fa', 'setup-2fa']),
    rm: z.boolean(),
  })
  .strip();

export type PendingLogin = {
  userId: string;
  identifier: string;
  email: string;
  purpose: 'login-2fa' | 'setup-2fa';
  rememberMe: boolean;
};

const key = (): Uint8Array => new TextEncoder().encode(`pending-login:${pepper()}`);

export async function setPendingLogin(pending: PendingLogin): Promise<void> {
  const token = await new SignJWT({
    idh: pending.identifier,
    email: pending.email,
    purpose: pending.purpose,
    rm: pending.rememberMe,
  })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(pending.userId)
    .setJti(randomHex(12))
    .setIssuedAt()
    .setExpirationTime(`${TTL_SECONDS}s`)
    .sign(key());
  (await cookies()).set(COOKIE, token, {
    httpOnly: true,
    secure: cookieSecure(),
    sameSite: 'lax',
    path: '/api/auth',
    maxAge: TTL_SECONDS,
  });
}

export async function readPendingLogin(): Promise<PendingLogin | null> {
  const token = (await cookies()).get(COOKIE)?.value;
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, key(), { algorithms: ['HS256'] });
    const parsed = payloadSchema.parse(payload);
    return {
      userId: parsed.sub,
      identifier: parsed.idh,
      email: parsed.email,
      purpose: parsed.purpose,
      rememberMe: parsed.rm,
    };
  } catch {
    return null;
  }
}

export async function clearPendingLogin(): Promise<void> {
  (await cookies()).delete({ name: COOKIE, path: '/api/auth' });
}
