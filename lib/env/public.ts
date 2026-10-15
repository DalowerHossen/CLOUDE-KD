// path: lib/env/public.ts
// Browser-safe environment access. Contains no secret variable names.
import type { z } from 'zod';
import { publicRuntime, publicSchema } from './public.generated';

export type PublicEnv = z.infer<typeof publicSchema>;

let cached: PublicEnv | null = null;

export function getPublicEnv(): PublicEnv {
  if (cached) return cached;
  const result = publicSchema.safeParse(publicRuntime);
  if (!result.success) {
    const names = result.error.issues.map((issue) => String(issue.path[0] ?? 'unknown')).join(', ');
    throw new Error(`Invalid public environment configuration: ${names}`);
  }
  cached = result.data;
  return cached;
}
