// path: lib/utils/formatting.ts
import type { Money } from './currency';

function group(integer: string): string {
  return integer.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

/** Formats USD for display, for example "$1,234.50" (two places) or "$1,234.5000" (four places). */
export function formatMoney(money: Money, places: 2 | 4 = 2): string {
  const { negative, integer, fraction } = money.toParts(places);
  return `${negative ? '-' : ''}$${group(integer)}.${fraction}`;
}

/** Formats a percentage given as decimal text, for example "7.5" becomes "7.5%". */
export function formatPercent(rate: string): string {
  const trimmed = rate.includes('.') ? rate.replace(/0+$/, '').replace(/\.$/, '') : rate;
  return `${trimmed}%`;
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** "15 Oct 2026" in UTC. */
export function formatDateUtc(date: Date): string {
  return `${date.getUTCDate()} ${MONTHS[date.getUTCMonth()] ?? ''} ${date.getUTCFullYear()}`;
}

export function truncate(text: string, maxLength: number): string {
  return text.length <= maxLength ? text : `${text.slice(0, Math.max(0, maxLength - 3))}...`;
}

/** "jane.doe@example.com" becomes "j***@example.com". */
export function maskEmail(email: string): string {
  const at = email.lastIndexOf('@');
  if (at <= 0) return '***';
  return `${email.slice(0, 1)}***${email.slice(at)}`;
}

/** Shows only the last characters of a secret, for example "****abcd". */
export function maskTail(value: string, visible = 4): string {
  if (value.length <= visible) return '*'.repeat(value.length);
  return `${'*'.repeat(4)}${value.slice(-visible)}`;
}
