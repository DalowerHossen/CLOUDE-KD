// path: lib/storage/adapters/base.ts
// What every storage provider must do. Adapters only ever see encrypted bytes.
import type { FileCategory, StorageProvider } from '@/types/contracts';

export interface AdapterPutInput {
  companyId: string | null;
  category: FileCategory;
  fileId: string;
  /** Encrypted bytes (AES-256-GCM ciphertext). Never plaintext. */
  bytes: Uint8Array;
}

export interface AdapterHealth {
  ok: boolean;
  message?: string;
}

export interface StorageAdapter {
  readonly provider: StorageProvider;
  /** Returns the provider reference (object path or Drive file id) to be stored in the file record. */
  put(input: AdapterPutInput): Promise<{ ref: string }>;
  get(ref: string, companyId: string | null): Promise<Uint8Array>;
  remove(ref: string, companyId: string | null): Promise<void>;
  health(companyId: string | null): Promise<AdapterHealth>;
}

export class ProviderUnavailableError extends Error {
  readonly provider: StorageProvider;
  constructor(provider: StorageProvider, message: string) {
    super(message);
    this.name = 'ProviderUnavailableError';
    this.provider = provider;
  }
}

/** Object path inside a provider: one folder per company, then per category. */
export function objectPath(companyId: string | null, category: string, fileId: string): string {
  return `tenants/${companyId ?? 'platform'}/${category}/${fileId}.kdenc`;
}

/** Retry with exponential backoff and jitter for rate limits and transient provider errors. */
export async function withBackoff<T>(
  fn: () => Promise<T>,
  isRetryable: (error: unknown) => boolean,
  attempts = 4,
  baseMs = 400,
): Promise<T> {
  let last: unknown;
  for (let i = 0; i < attempts; i++) {
    try {
      return await fn();
    } catch (error) {
      last = error;
      if (!isRetryable(error) || i === attempts - 1) break;
      const wait = baseMs * 2 ** i + Math.floor(Math.random() * baseMs);
      await new Promise((resolve) => setTimeout(resolve, wait));
    }
  }
  throw last;
}
