// path: services/auth/device.ts
// Device identity: a random id in an HttpOnly cookie (1 year). Only a keyed hash of it is stored.
import 'server-only';
import { cookies } from 'next/headers';
import { cookieSecure } from '@/lib/auth/session';
import { hmacSha256Hex, randomHex } from '@/lib/utils/hash';
import { pepper } from './credentials';

const COOKIE = 'kd_device';

/** Returns the keyed hash of the device id, creating the cookie on first sight. */
export async function currentDeviceHash(): Promise<{ hash: string; isNewCookie: boolean }> {
  const store = await cookies();
  let id = store.get(COOKIE)?.value;
  let isNewCookie = false;
  if (!id || !/^[0-9a-f]{32}$/.test(id)) {
    id = randomHex(16);
    isNewCookie = true;
    store.set(COOKIE, id, {
      httpOnly: true,
      secure: cookieSecure(),
      sameSite: 'lax',
      path: '/',
      maxAge: 365 * 86_400,
    });
  }
  return { hash: await hmacSha256Hex(pepper(), `device:${id}`), isNewCookie };
}
