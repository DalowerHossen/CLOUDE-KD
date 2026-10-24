// path: lib/encryption/redact.ts
// Display helpers: show just enough of a personal value to recognise it.
export function maskEmail(email: string): string {
  const at = email.indexOf('@');
  if (at < 1) return '***';
  return `${email[0]}***${email.slice(at)}`;
}

export function maskPhone(phone: string): string {
  const digits = phone.replace(/\D/g, '');
  return digits.length < 4 ? '***' : `***${digits.slice(-4)}`;
}

/** Tax ids, bank accounts and similar: last four characters only. */
export function maskIdentifier(value: string): string {
  const clean = value.replace(/\s+/g, '');
  return clean.length <= 4
    ? '****'
    : `${'*'.repeat(Math.min(clean.length - 4, 12))}${clean.slice(-4)}`;
}

export function maskName(name: string): string {
  const parts = name.trim().split(/\s+/);
  return parts.map((p) => (p.length <= 1 ? p : `${p[0]}***`)).join(' ');
}
