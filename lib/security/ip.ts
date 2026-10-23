// path: lib/security/ip.ts
// IP address classification. Used by the SSRF guard and by network intelligence.
import { isIP } from 'node:net';

function ipv4ToInt(ip: string): number {
  return ip.split('.').reduce((acc, part) => (acc << 8) + Number(part), 0) >>> 0;
}

const V4_RANGES: readonly (readonly [string, number])[] = [
  ['0.0.0.0', 8],
  ['10.0.0.0', 8],
  ['100.64.0.0', 10],
  ['127.0.0.0', 8],
  ['169.254.0.0', 16],
  ['172.16.0.0', 12],
  ['192.0.0.0', 24],
  ['192.0.2.0', 24],
  ['192.88.99.0', 24],
  ['192.168.0.0', 16],
  ['198.18.0.0', 15],
  ['198.51.100.0', 24],
  ['203.0.113.0', 24],
  ['224.0.0.0', 4],
  ['240.0.0.0', 4],
];

function inV4Range(ip: string, base: string, bits: number): boolean {
  const mask = bits === 0 ? 0 : (0xffffffff << (32 - bits)) >>> 0;
  return (ipv4ToInt(ip) & mask) === (ipv4ToInt(base) & mask);
}

/** Expands an IPv6 text address into 8 groups of 16 bits. Returns null when it is not valid. */
export function expandIpv6(ip: string): number[] | null {
  if (isIP(ip) !== 6) return null;
  let text = ip.split('%')[0] ?? ip;
  const dotted = text.match(/(\d+\.\d+\.\d+\.\d+)$/);
  if (dotted?.[1]) {
    const n = ipv4ToInt(dotted[1]);
    text = text.replace(
      dotted[1],
      `${((n >>> 16) & 0xffff).toString(16)}:${(n & 0xffff).toString(16)}`,
    );
  }
  const [head = '', tail] = text.split('::');
  const headParts = head === '' ? [] : head.split(':');
  const tailParts = tail === undefined || tail === '' ? [] : tail.split(':');
  const fill = text.includes('::') ? 8 - headParts.length - tailParts.length : 0;
  const groups = [...headParts, ...Array<string>(Math.max(fill, 0)).fill('0'), ...tailParts].map(
    (g) => Number.parseInt(g, 16),
  );
  return groups.length === 8 && groups.every((g) => Number.isInteger(g) && g >= 0 && g <= 0xffff)
    ? groups
    : null;
}

/** True for addresses that must never be reached from the server: private, loopback, link-local, reserved, multicast. */
export function isNonPublicIp(ip: string): boolean {
  const version = isIP(ip);
  if (version === 4) return V4_RANGES.some(([base, bits]) => inV4Range(ip, base, bits));
  if (version !== 6) return true;
  const g = expandIpv6(ip);
  if (!g) return true;
  const [a = 0, b = 0, c = 0, d = 0, e = 0, f = 0, g6 = 0, h = 0] = g;
  if (g.every((x) => x === 0)) return true; // ::
  if (g.slice(0, 7).every((x) => x === 0) && h === 1) return true; // ::1
  if (a === 0 && b === 0 && c === 0 && d === 0 && e === 0 && f === 0xffff) {
    return isNonPublicIp(`${g6 >> 8}.${g6 & 0xff}.${h >> 8}.${h & 0xff}`); // IPv4-mapped
  }
  if (a === 0x64 && b === 0xff9b)
    return isNonPublicIp(`${g6 >> 8}.${g6 & 0xff}.${h >> 8}.${h & 0xff}`); // NAT64
  if ((a & 0xfe00) === 0xfc00) return true; // fc00::/7 unique local
  if ((a & 0xffc0) === 0xfe80) return true; // fe80::/10 link local
  if ((a & 0xff00) === 0xff00) return true; // multicast
  if (a === 0x2001 && b === 0x0db8) return true; // documentation
  if (a === 0x2002) return true; // 6to4
  return false;
}

export function ipVersion(ip: string): 0 | 4 | 6 {
  const v = isIP(ip);
  return v === 4 || v === 6 ? v : 0;
}
