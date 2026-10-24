// path: services/security/tor-list.ts
// Refreshes the public Tor exit list. Only keyed hashes of the addresses are stored. A list that is empty or far
// smaller than expected is treated as an outage and the old list stays in place.
import 'server-only';
import { TOR_LIST_TTL_SECONDS, TOR_LIST_URL } from '@/config/security';
import { InternalError } from '@/lib/errors';
import { getAdminSupabase } from '@/lib/supabase/admin';
import { parseTorList } from '@/lib/security/network/tor';
import { hashIp } from '@/services/audit/request-meta';

const MIN_EXPECTED = 100;
const MAX_BYTES = 5 * 1024 * 1024;

export async function refreshTorList(): Promise<{ count: number }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15_000);
  try {
    const response = await fetch(TOR_LIST_URL, { signal: controller.signal });
    if (!response.ok) throw new InternalError(new Error(`Tor list answered ${response.status}`));
    const text = await response.text();
    if (new TextEncoder().encode(text).byteLength > MAX_BYTES)
      throw new InternalError(new Error('Tor list too large'));
    const ips = parseTorList(text);
    if (ips.length < MIN_EXPECTED)
      throw new InternalError(new Error(`Tor list has only ${ips.length} entries`));
    const hashes = await Promise.all(ips.map((ip) => hashIp(ip)));
    const { error } = await getAdminSupabase().rpc('kd_tor_replace', {
      p_hashes: hashes,
      p_ttl_seconds: TOR_LIST_TTL_SECONDS,
    });
    if (error) throw new InternalError(error);
    return { count: hashes.length };
  } finally {
    clearTimeout(timer);
  }
}
