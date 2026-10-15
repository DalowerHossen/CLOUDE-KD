// path: lib/logger/redact.ts
// PII and secret redaction for structured logs. Applied to every field before it is written.

const SENSITIVE_KEY =
  /pass(word|phrase)?|secret|token|authorization|cookie|api[-_]?key|private|credential|card|cvv|cvc|ssn|otp|signature|session|bearer|jwt|mnemonic|seed|pin$/i;
const EMAIL = /\b([A-Za-z0-9._%+-])[A-Za-z0-9._%+-]*(@[A-Za-z0-9.-]+\.[A-Za-z]{2,})\b/g;
const JWT = /\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\b/g;
const CARD_CANDIDATE = /\b(?:\d[ -]?){13,19}\b/g;

export const REDACTED = '[REDACTED]';
const MAX_DEPTH = 6;
const MAX_STRING = 2000;

function luhn(digits: string): boolean {
  let sum = 0;
  let alt = false;
  for (let i = digits.length - 1; i >= 0; i--) {
    let n = digits.charCodeAt(i) - 48;
    if (alt) {
      n *= 2;
      if (n > 9) n -= 9;
    }
    sum += n;
    alt = !alt;
  }
  return sum % 10 === 0;
}

/** Masks e-mail addresses, JWTs and card-number-like digit runs inside free text. */
export function scrubString(value: string): string {
  let out = value.length > MAX_STRING ? `${value.slice(0, MAX_STRING)}...` : value;
  out = out.replace(JWT, REDACTED);
  out = out.replace(EMAIL, '$1***$2');
  out = out.replace(CARD_CANDIDATE, (match) => {
    const digits = match.replace(/[ -]/g, '');
    return digits.length >= 13 && digits.length <= 19 && luhn(digits) ? '[REDACTED_PAN]' : match;
  });
  return out;
}

export function isSensitiveKey(key: string): boolean {
  return SENSITIVE_KEY.test(key);
}

/** Returns a redacted deep copy that is safe to serialize. */
export function redact(value: unknown, key = '', depth = 0, seen: WeakSet<object> = new WeakSet()): unknown {
  if (key !== '' && isSensitiveKey(key)) return REDACTED;
  if (value === null || value === undefined) return value;
  if (typeof value === 'string') return scrubString(value);
  if (typeof value === 'number' || typeof value === 'boolean') return value;
  if (typeof value === 'bigint') return value.toString();
  if (typeof value === 'function' || typeof value === 'symbol') return undefined;
  if (value instanceof Date) return value.toISOString();
  if (value instanceof Error) {
    return {
      name: value.name,
      message: scrubString(value.message),
      stack: value.stack ? scrubString(value.stack) : undefined,
    };
  }
  if (typeof value !== 'object') return undefined;
  if (depth >= MAX_DEPTH) return '[TRUNCATED]';
  if (seen.has(value)) return '[CIRCULAR]';
  seen.add(value);
  if (Array.isArray(value)) return value.slice(0, 100).map((item) => redact(item, '', depth + 1, seen));
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(value)) out[k] = redact(v, k, depth + 1, seen);
  return out;
}
