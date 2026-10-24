// path: lib/security/sanitizer.ts
// Input sanitizer used by withApi for every body, query and parameter object (security contract: sanitize).
// Returns a deep copy: Unicode NFC, zero-width and bidirectional override characters removed, null bytes removed,
// dangerous object keys dropped. Nesting depth and size are limited so a crafted payload cannot exhaust the server.

const MAX_DEPTH = 20;
const MAX_KEYS = 5000;
const MAX_STRING = 1_000_000;

// Zero-width characters, byte order mark, bidirectional embeddings, overrides and isolates, soft hyphen.
const INVISIBLE = /[\u200B-\u200F\u202A-\u202E\u2060-\u2064\u2066-\u2069\uFEFF\u00AD\u180E]/g;
// Control characters except tab, line feed and carriage return.
const CONTROL = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g;
const DANGEROUS_KEYS: ReadonlySet<string> = new Set(['__proto__', 'constructor', 'prototype']);

export class SanitizerError extends Error {
  constructor(public readonly reason: 'too_deep' | 'too_large') {
    super(`Input refused: ${reason}`);
    this.name = 'SanitizerError';
  }
}

export function cleanString(value: string): string {
  if (value.length > MAX_STRING) throw new SanitizerError('too_large');
  return value.normalize('NFC').replace(INVISIBLE, '').replace(CONTROL, '');
}

/** Deep copy with every string cleaned. Arrays and plain objects only; other values pass through. */
export function sanitize<T>(input: T): T {
  const counter = { keys: 0 };
  return walk(input, 0, counter) as T;
}

function walk(value: unknown, depth: number, counter: { keys: number }): unknown {
  if (depth > MAX_DEPTH) throw new SanitizerError('too_deep');
  if (typeof value === 'string') return cleanString(value);
  if (Array.isArray(value)) {
    counter.keys += value.length;
    if (counter.keys > MAX_KEYS) throw new SanitizerError('too_large');
    return value.map((item) => walk(item, depth + 1, counter));
  }
  if (value !== null && typeof value === 'object') {
    const proto = Object.getPrototypeOf(value) as unknown;
    if (proto !== Object.prototype && proto !== null) return value;
    const out: Record<string, unknown> = Object.create(null) as Record<string, unknown>;
    for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
      counter.keys += 1;
      if (counter.keys > MAX_KEYS) throw new SanitizerError('too_large');
      if (DANGEROUS_KEYS.has(key)) continue;
      out[cleanString(key)] = walk(item, depth + 1, counter);
    }
    return { ...out };
  }
  return value;
}

export function containsNullByte(value: string): boolean {
  return value.includes('\u0000');
}

/** True for path traversal spellings: "..", encoded dots and slashes, backslashes, absolute paths and drive letters. */
export function hasPathTraversal(value: string): boolean {
  let decoded = value;
  for (let i = 0; i < 3; i++) {
    try {
      const next = decodeURIComponent(decoded);
      if (next === decoded) break;
      decoded = next;
    } catch {
      return true;
    }
  }
  const normalized = decoded.replace(/\\/g, '/');
  return (
    /(^|\/)\.{2,}(\/|$)/.test(normalized) ||
    normalized.startsWith('/') ||
    /^[a-zA-Z]:\//.test(normalized) ||
    containsNullByte(normalized) ||
    /%2e|%2f|%5c/i.test(normalized)
  );
}

export type InjectionKind = 'sql_injection_attempt' | 'xss_attempt';

const SQL_PATTERNS: readonly RegExp[] = [
  /\bunion\b[\s\S]{0,40}\bselect\b/i,
  /\b(or|and)\s*\(?\s*\d+\s*\)?\s*=\s*\(?\s*\d+\b/i,
  /\bselect\b[\s\S]{0,60}\bfrom\b[\s\S]{0,60}\b(information_schema|pg_catalog|pg_user|auth\.users)\b/i,
  /(['"`)])\s*(or|and)\s+['"`]?\d+['"`]?\s*=\s*['"`]?\d+/i,
  /(['"`)])\s*;\s*(drop|delete|insert|update|alter|truncate|create)\b/i,
  /\b(pg_sleep|sleep|benchmark|waitfor\s+delay)\s*\(/i,
  /--\s*$|\/\*[\s\S]*\*\//,
  /\b(drop|truncate)\s+table\b/i,
];

const XSS_PATTERNS: readonly RegExp[] = [
  /<\s*script\b/i,
  /<\s*\/\s*script\b/i,
  /\bon[a-z]{3,20}\s*=\s*["'`]?[^\s>]/i,
  /javascript\s*:/i,
  /data\s*:\s*text\/html/i,
  /<\s*(iframe|object|embed|svg|math|link|meta|base|form)\b/i,
  /expression\s*\(/i,
  /&#x?0*(6a|106)/i,
];

/** Heuristic detection used to raise zero-tolerance security events. It never decides to accept data. */
export function detectInjection(value: string): InjectionKind | null {
  if (value.length > 20_000) return null;
  const text = value.normalize('NFKC');
  if (XSS_PATTERNS.some((re) => re.test(text))) return 'xss_attempt';
  if (SQL_PATTERNS.some((re) => re.test(text))) return 'sql_injection_attempt';
  return null;
}

/** Walks an object and returns the first injection kind found in any string value or key. */
export function detectInjectionDeep(input: unknown, depth = 0): InjectionKind | null {
  if (depth > MAX_DEPTH) return null;
  if (typeof input === 'string') return detectInjection(input);
  if (Array.isArray(input)) {
    for (const item of input) {
      const hit = detectInjectionDeep(item, depth + 1);
      if (hit) return hit;
    }
    return null;
  }
  if (input !== null && typeof input === 'object') {
    for (const [key, item] of Object.entries(input)) {
      const hit = detectInjection(key) ?? detectInjectionDeep(item, depth + 1);
      if (hit) return hit;
    }
  }
  return null;
}
