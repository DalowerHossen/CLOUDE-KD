// path: lib/env/index.ts
import 'server-only';
import type { z } from 'zod';
import { EnvValidationError } from '@/lib/errors';
import { serverSchema } from './schema.generated';

export type ServerEnv = z.infer<typeof serverSchema>;

let cached: ServerEnv | null = null;

/** Parses the given source (default: process.env). The error lists variable names only, never values. */
export function parseServerEnv(
  source: Record<string, string | undefined> = process.env,
): ServerEnv {
  const result = serverSchema.safeParse(source);
  if (result.success) return result.data;
  throw new EnvValidationError(
    result.error.issues.map((issue) => ({
      name: String(issue.path[0] ?? 'unknown'),
      problem:
        issue.code === 'invalid_type' && issue.received === 'undefined'
          ? 'missing'
          : issue.code === 'custom'
            ? `invalid (${issue.message})`
            : 'invalid',
    })),
  );
}

export function getServerEnv(): ServerEnv {
  cached ??= parseServerEnv();
  return cached;
}

/** Fail-fast check used at application start. CI builds may set SKIP_ENV_VALIDATION=1. */
export function validateEnvAtBoot(): void {
  const skip = process.env.SKIP_ENV_VALIDATION;
  if (skip === '1' || skip === 'true') return;
  assertProductionNetworkIntel(getServerEnv());
}

/** Shell preview pages are available only in development and only when explicitly enabled. */
export function isShellPreviewEnabled(): boolean {
  return (
    process.env.APP_ENV === 'development' && ['1', 'true'].includes(process.env.SHELL_PREVIEW ?? '')
  );
}

/** Production must have a network intelligence provider and its key, or the VPN, proxy and country rules cannot work. */
export function assertProductionNetworkIntel(
  env: Pick<ServerEnv, 'APP_ENV' | 'NETWORK_INTEL_PROVIDER' | 'NETWORK_INTEL_API_KEY'>,
): void {
  if (env.APP_ENV !== 'production') return;
  if (env.NETWORK_INTEL_PROVIDER === 'none')
    throw new EnvValidationError([
      { name: 'NETWORK_INTEL_PROVIDER', problem: 'invalid (a provider is required in production)' },
    ]);
  if (!env.NETWORK_INTEL_API_KEY)
    throw new EnvValidationError([{ name: 'NETWORK_INTEL_API_KEY', problem: 'missing' }]);
}
