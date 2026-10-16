// path: services/auth/password-hash.ts
// Server-side password helpers: scrypt hashes for the password history and the breach check (HIBP k-anonymity).
// Not imported by browser code.
import { createHash, randomBytes, scrypt, timingSafeEqual } from 'node:crypto';

const N = 2 ** 15;
const R = 8;
const P = 1;
const KEY_LENGTH = 32;

function derive(password: string, salt: Buffer, n: number, r: number, p: number): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scrypt(
      password.normalize('NFKC'),
      salt,
      KEY_LENGTH,
      { N: n, r, p, maxmem: 128 * n * r * 2 },
      (error, key) => {
        if (error) reject(error);
        else resolve(key);
      },
    );
  });
}

/** Format: scrypt$N$r$p$salt(base64)$hash(base64). */
export async function hashPasswordForHistory(password: string): Promise<string> {
  const salt = randomBytes(16);
  const key = await derive(password, salt, N, R, P);
  return `scrypt$${N}$${R}$${P}$${salt.toString('base64')}$${key.toString('base64')}`;
}

export async function matchesHistoryHash(password: string, stored: string): Promise<boolean> {
  const parts = stored.split('$');
  if (parts.length !== 6 || parts[0] !== 'scrypt') return false;
  const [, n, r, p, salt, hash] = parts as [string, string, string, string, string, string];
  const expected = Buffer.from(hash, 'base64');
  const actual = await derive(
    password,
    Buffer.from(salt, 'base64'),
    Number(n),
    Number(r),
    Number(p),
  );
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

/** True when the password equals one of the stored hashes (the last 5 passwords are blocked). */
export async function isPasswordReused(
  password: string,
  storedHashes: readonly string[],
): Promise<boolean> {
  for (const stored of storedHashes) if (await matchesHistoryHash(password, stored)) return true;
  return false;
}

export type FetchLike = (
  url: string,
  init: { headers: Record<string, string>; signal: AbortSignal },
) => Promise<{
  ok: boolean;
  text(): Promise<string>;
}>;

/**
 * Number of times the password appears in known breaches (Have I Been Pwned range API).
 * Only the first 5 characters of the SHA-1 hash leave the server. Returns null when the service cannot be reached;
 * callers treat null as "not known to be breached" and log a warning (availability over blocking sign-up).
 */
export async function breachCount(
  password: string,
  fetchImpl: FetchLike = fetch as unknown as FetchLike,
): Promise<number | null> {
  const sha1 = createHash('sha1').update(password.normalize('NFKC')).digest('hex').toUpperCase();
  const prefix = sha1.slice(0, 5);
  const suffix = sha1.slice(5);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 2500);
  try {
    const response = await fetchImpl(`https://api.pwnedpasswords.com/range/${prefix}`, {
      headers: { 'Add-Padding': 'true', 'User-Agent': 'kd-solution-it-password-check' },
      signal: controller.signal,
    });
    if (!response.ok) return null;
    for (const line of (await response.text()).split('\n')) {
      const [candidate, count] = line.trim().split(':');
      if (candidate === suffix) return Number(count ?? '0');
    }
    return 0;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}
