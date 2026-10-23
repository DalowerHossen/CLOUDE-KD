// path: lib/integrations/ssrf.ts
// The guard for addresses that the platform calls on behalf of a company (webhook targets, and later other callbacks). It
// refuses anything that could reach the platform's own network: plain http, credentials in the address, IP addresses instead of
// host names, local and internal host names, odd ports, and (for the addresses a host name resolves to) private, loopback,
// link-local, shared, multicast, reserved and documentation ranges of IPv4 and IPv6, including IPv4 hidden inside IPv6.
import { WEBHOOK_MAX_URL_LENGTH } from '@/config/s16-api';

export type UrlCheck = { ok: true; url: URL } | { ok: false; reason: string };

/* ---------- IPv4 ---------- */

function parseIpv4(text: string): number[] | null {
  const parts = text.split('.');
  if (parts.length !== 4) return null;
  const out: number[] = [];
  for (const p of parts) {
    if (!/^\d{1,3}$/.test(p)) return null;
    const n = Number.parseInt(p, 10);
    if (n > 255) return null;
    out.push(n);
  }
  return out;
}

/** [first, second, bits] ranges that are not public: the prefix is compared on the first `bits` bits of the address. */
const V4_BLOCKS: readonly (readonly [number, number, number, number])[] = [
  // [a, b, c, prefixBits] with b and c ignored when the prefix is shorter
  [0, 0, 0, 8],
  [10, 0, 0, 8],
  [100, 64, 0, 10],
  [127, 0, 0, 8],
  [169, 254, 0, 16],
  [172, 16, 0, 12],
  [192, 0, 0, 24],
  [192, 0, 2, 24],
  [192, 88, 99, 24],
  [192, 168, 0, 16],
  [198, 18, 0, 15],
  [198, 51, 100, 24],
  [203, 0, 113, 24],
  [224, 0, 0, 4],
  [240, 0, 0, 4],
];

function v4InBlock(
  addr: readonly number[],
  block: readonly [number, number, number, number],
): boolean {
  const bits = block[3];
  const a =
    ((addr[0] ?? 0) << 24) | ((addr[1] ?? 0) << 16) | ((addr[2] ?? 0) << 8) | (addr[3] ?? 0);
  const b = (block[0] << 24) | (block[1] << 16) | (block[2] << 8);
  const mask = bits === 0 ? 0 : (~0 << (32 - bits)) >>> 0;
  return ((a >>> 0) & mask) === ((b >>> 0) & mask);
}

export function isPublicIpv4(text: string): boolean {
  const addr = parseIpv4(text);
  if (addr === null) return false;
  return !V4_BLOCKS.some((b) => v4InBlock(addr, b));
}

/* ---------- IPv6 ---------- */

/** Eight 16 bit groups of an IPv6 address, or null when the text is not one. Handles "::" and a trailing dotted IPv4. */
export function parseIpv6(raw: string): number[] | null {
  let text = raw.trim().toLowerCase();
  if (text.startsWith('[') && text.endsWith(']')) text = text.slice(1, -1);
  const zone = text.indexOf('%');
  if (zone >= 0) text = text.slice(0, zone);
  if (text.length === 0 || !/^[0-9a-f:.]+$/.test(text)) return null;
  const dotted = text.lastIndexOf('.');
  if (dotted >= 0) {
    const split = text.lastIndexOf(':');
    const v4 = parseIpv4(text.slice(split + 1));
    if (v4 === null) return null;
    text =
      text.slice(0, split + 1) +
      (((v4[0] ?? 0) << 8) | (v4[1] ?? 0)).toString(16) +
      ':' +
      (((v4[2] ?? 0) << 8) | (v4[3] ?? 0)).toString(16);
  }
  const halves = text.split('::');
  if (halves.length > 2) return null;
  const head = halves[0] === '' ? [] : (halves[0] ?? '').split(':');
  const tail = halves.length === 2 ? (halves[1] === '' ? [] : (halves[1] ?? '').split(':')) : [];
  const fill = 8 - head.length - tail.length;
  if (halves.length === 1 ? head.length !== 8 : fill < 1) return null;
  const groups = [
    ...head,
    ...Array.from({ length: halves.length === 2 ? fill : 0 }, () => '0'),
    ...tail,
  ];
  if (groups.length !== 8) return null;
  const out: number[] = [];
  for (const g of groups) {
    if (!/^[0-9a-f]{1,4}$/.test(g)) return null;
    out.push(Number.parseInt(g, 16));
  }
  return out;
}

const v4Of = (hi: number, lo: number): string => `${hi >> 8}.${hi & 255}.${lo >> 8}.${lo & 255}`;

export function isPublicIpv6(text: string): boolean {
  const g = parseIpv6(text);
  if (g === null) return false;
  const [g0 = 0, g1 = 0, g2 = 0, g3 = 0, g4 = 0, g5 = 0, g6 = 0, g7 = 0] = g;
  if (g.every((x) => x === 0)) return false; // ::
  if (g0 === 0 && g1 === 0 && g2 === 0 && g3 === 0 && g4 === 0 && g5 === 0 && g6 === 0 && g7 === 1)
    return false; // ::1
  // IPv4 mapped (::ffff:a.b.c.d) and IPv4 compatible (::a.b.c.d): judge the IPv4 address inside.
  if (g0 === 0 && g1 === 0 && g2 === 0 && g3 === 0 && g4 === 0 && (g5 === 0xffff || g5 === 0))
    return isPublicIpv4(v4Of(g6, g7));
  if (g0 === 0x64 && g1 === 0xff9b && g2 === 0 && g3 === 0 && g4 === 0 && g5 === 0)
    return isPublicIpv4(v4Of(g6, g7)); // NAT64
  if (g0 === 0x2002) return isPublicIpv4(v4Of(g1, g2)); // 6to4
  if ((g0 & 0xfe00) === 0xfc00) return false; // unique local
  if ((g0 & 0xffc0) === 0xfe80) return false; // link local
  if ((g0 & 0xffc0) === 0xfec0) return false; // site local (old)
  if ((g0 & 0xff00) === 0xff00) return false; // multicast
  if (g0 === 0x2001 && g1 === 0x0db8) return false; // documentation
  if (g0 === 0x2001 && g1 === 0) return false; // Teredo
  if (g0 === 0x0100 && g1 === 0 && g2 === 0 && g3 === 0) return false; // discard
  return true;
}

/** True when the text is a public IPv4 or IPv6 address (used on the addresses a host name resolves to). */
export function isPublicIp(text: string): boolean {
  return text.includes(':') ? isPublicIpv6(text) : isPublicIpv4(text);
}

/* ---------- host names and addresses ---------- */

const BLOCKED_SUFFIXES = [
  '.localhost',
  '.local',
  '.internal',
  '.localdomain',
  '.lan',
  '.home.arpa',
  '.corp',
  '.intranet',
  '.private',
];

export function isBlockedHostname(host: string): boolean {
  const h = host.toLowerCase().replace(/\.$/, '');
  if (h === 'localhost' || h === 'metadata') return true;
  if (!h.includes('.')) return true;
  return BLOCKED_SUFFIXES.some((s) => h.endsWith(s));
}

/** Checks an address a company wants the platform to call. Name resolution is checked again at connect time. */
export function checkWebhookUrl(raw: string): UrlCheck {
  if (raw.length === 0 || raw.length > WEBHOOK_MAX_URL_LENGTH)
    return { ok: false, reason: 'The address is empty or too long.' };
  if (/[\u0000- \u007f]/.test(raw)) return { ok: false, reason: 'The address is not valid.' };
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return { ok: false, reason: 'The address is not valid.' };
  }
  if (url.protocol !== 'https:') return { ok: false, reason: 'Use an https address.' };
  if (url.username !== '' || url.password !== '')
    return { ok: false, reason: 'The address must not contain a user name or password.' };
  if (url.hash !== '') return { ok: false, reason: 'The address must not contain a fragment.' };
  const host = url.hostname.toLowerCase().replace(/\.$/, '');
  if (host === '') return { ok: false, reason: 'The address has no host name.' };
  if (host.startsWith('[') || parseIpv4(host) !== null || /^[0-9.]+$/.test(host))
    return { ok: false, reason: 'Use a host name, not an IP address.' };
  if (isBlockedHostname(host)) return { ok: false, reason: 'This host name is not allowed.' };
  if (url.port !== '') {
    const port = Number.parseInt(url.port, 10);
    if (port !== 443 && (port < 1024 || port > 65535))
      return { ok: false, reason: 'Use port 443 or a port from 1024 to 65535.' };
  }
  return { ok: true, url };
}
