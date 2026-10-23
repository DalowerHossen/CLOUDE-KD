// path: lib/domain/hostnames.ts
// Hostname rules and DNS record text for custom domains. Pure functions; safe to import in the browser.
import { z } from 'zod';

/** Name that must not be used: system names, the platform's own domain and its subdomains. */
const BLOCKED_SUFFIXES = [
  '.local',
  '.localhost',
  '.internal',
  '.lan',
  '.home',
  '.corp',
  '.invalid',
  '.example',
  '.test',
  '.onion',
];

export function normalizeHostname(input: string): string {
  return input.trim().toLowerCase().replace(/\.$/, '');
}

export function validateHostname(input: string, platformHost: string): string | null {
  const host = normalizeHostname(input);
  if (host.length < 4 || host.length > 253)
    return 'Enter a full domain name such as billing.example.com.';
  if (!/^([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,24}$/.test(host))
    return 'Use letters, digits and dashes, with a valid ending such as .com.';
  if (BLOCKED_SUFFIXES.some((s) => host.endsWith(s))) return 'This kind of name cannot be used.';
  const platform = platformHost.toLowerCase();
  if (host === platform || host.endsWith(`.${platform}`))
    return 'You cannot use a name that belongs to the platform.';
  return null;
}

export const hostnameSchema = z.string().trim().min(4).max(253);

export interface DnsRecord {
  purpose: 'ownership' | 'routing';
  type: 'TXT' | 'CNAME';
  name: string;
  value: string;
  required: boolean;
}

/** The two records to create: a TXT record that proves ownership, and a CNAME that sends visitors to the platform. */
export function dnsRecords(hostname: string, token: string, platformHost: string): DnsRecord[] {
  return [
    {
      purpose: 'ownership',
      type: 'TXT',
      name: `_kd-verify.${hostname}`,
      value: `kd-verify=${token}`,
      required: true,
    },
    { purpose: 'routing', type: 'CNAME', name: hostname, value: platformHost, required: false },
  ];
}

export interface DnsAnswers {
  txt: readonly string[][];
  cname: readonly string[];
}

export interface DnsEvaluation {
  ownership: boolean;
  routing: boolean;
}

/** Compares what the DNS answered with what we asked for. Case and a trailing dot do not matter. */
export function evaluateDns(
  answers: DnsAnswers,
  token: string,
  platformHost: string,
): DnsEvaluation {
  const want = `kd-verify=${token}`;
  const ownership = answers.txt.some((chunks) => chunks.join('') === want);
  const target = platformHost.toLowerCase().replace(/\.$/, '');
  const routing = answers.cname.some((c) => c.toLowerCase().replace(/\.$/, '') === target);
  return { ownership, routing };
}

/** True for an address a visitor from the internet could really reach (not private, loopback, link-local or reserved). */
export function isPublicAddress(address: string): boolean {
  if (address.includes(':')) {
    const a = address.toLowerCase();
    if (
      a === '::1' ||
      a === '::' ||
      a.startsWith('fe8') ||
      a.startsWith('fe9') ||
      a.startsWith('fea') ||
      a.startsWith('feb') ||
      a.startsWith('fc') ||
      a.startsWith('fd') ||
      a.startsWith('ff')
    )
      return false;
    if (a.startsWith('::ffff:')) return isPublicAddress(a.slice(7));
    return true;
  }
  const parts = address.split('.').map(Number);
  if (parts.length !== 4 || parts.some((n) => !Number.isInteger(n) || n < 0 || n > 255))
    return false;
  const [a, b] = parts as [number, number, number, number];
  if (a === 10 || a === 127 || a === 0 || a >= 224) return false;
  if (a === 169 && b === 254) return false;
  if (a === 172 && b >= 16 && b <= 31) return false;
  if (a === 192 && b === 168) return false;
  if (a === 100 && b >= 64 && b <= 127) return false;
  if (a === 192 && b === 0) return false;
  if (a === 198 && (b === 18 || b === 19)) return false;
  return true;
}
