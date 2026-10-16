// path: services/encryption/keys.ts
// Reads the root keys from the environment. Nothing here is stored or logged.
import 'server-only';
import { getServerEnv } from '@/lib/env';
import type { RootKeys } from '@/lib/encryption/aead';

export function rootKeys(): RootKeys {
  const env = getServerEnv();
  const roots: Record<number, Uint8Array | undefined> = {
    1: Buffer.from(env.ENCRYPTION_KEY, 'base64'),
  };
  if (env.ENCRYPTION_KEY_V2) roots[2] = Buffer.from(env.ENCRYPTION_KEY_V2, 'base64');
  if (env.ENCRYPTION_KEY_V3) roots[3] = Buffer.from(env.ENCRYPTION_KEY_V3, 'base64');
  return roots;
}

/** Version used for new data. Refuses to run when the chosen version has no key. */
export function activeKeyVersion(): number {
  const version = getServerEnv().ENCRYPTION_ACTIVE_KEY_VERSION;
  if (!rootKeys()[version]) {
    throw new Error(`ENCRYPTION_ACTIVE_KEY_VERSION is ${version} but that key is not set.`);
  }
  return version;
}
