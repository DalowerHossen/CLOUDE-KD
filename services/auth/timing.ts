// path: services/auth/timing.ts
// Equalized response time: a sign-in attempt always takes at least `minMs`, so the duration does not tell whether
// the account exists, is locked, or had the right password.
import { LOGIN_MIN_RESPONSE_MS } from '@/config/auth-lock';

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

export async function withMinDuration<T>(
  fn: () => Promise<T>,
  minMs: number = LOGIN_MIN_RESPONSE_MS,
): Promise<T> {
  const started = Date.now();
  const jitter = Math.floor(Math.random() * 40);
  try {
    return await fn();
  } finally {
    const remaining = minMs + jitter - (Date.now() - started);
    if (remaining > 0) await sleep(remaining);
  }
}
