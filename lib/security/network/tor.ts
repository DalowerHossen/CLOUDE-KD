// path: lib/security/network/tor.ts
import { isIP } from 'node:net';

/** Parses the public Tor exit list: one address per line, comments and invalid lines are skipped. */
export function parseTorList(text: string): string[] {
  const out = new Set<string>();
  for (const line of text.split('\n')) {
    const ip = line.trim();
    if (ip.length > 0 && !ip.startsWith('#') && isIP(ip) !== 0) out.add(ip);
  }
  return [...out];
}
