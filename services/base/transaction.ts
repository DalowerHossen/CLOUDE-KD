// path: services/base/transaction.ts
// PostgREST cannot hold a transaction open across calls. Multi-statement atomic work is written as one SQL function
// (called with rpc), which PostgreSQL runs as a single transaction. This helper retries such a call when the database
// reports a serialization failure (40001) or a deadlock (40P01) and maps the final failure to ConflictError.
import { ConflictError } from '@/lib/errors';

const RETRYABLE = new Set(['40001', '40P01']);

export interface RpcFailure {
  code?: string;
}

export interface RetryOptions {
  attempts?: number;
  baseDelayMs?: number;
}

function codeOf(error: unknown): string | undefined {
  if (typeof error === 'object' && error !== null && 'code' in error) {
    const code = (error as RpcFailure).code;
    return typeof code === 'string' ? code : undefined;
  }
  return undefined;
}

export async function withTransaction<T>(fn: () => Promise<T>, options: RetryOptions = {}): Promise<T> {
  const attempts = options.attempts ?? 3;
  const base = options.baseDelayMs ?? 40;
  for (let attempt = 1; ; attempt++) {
    try {
      return await fn();
    } catch (error) {
      const code = codeOf(error);
      if (code === undefined || !RETRYABLE.has(code)) throw error;
      if (attempt >= attempts) throw new ConflictError();
      await new Promise((resolve) => setTimeout(resolve, base * 2 ** (attempt - 1)));
    }
  }
}

/** Alias for call sites that need serializable semantics: the SQL function itself must run at SERIALIZABLE. */
export const withSerializableRetry = withTransaction;
