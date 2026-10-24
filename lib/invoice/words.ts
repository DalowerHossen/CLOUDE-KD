// path: lib/invoice/words.ts
// "Amount in words" for invoices, in English, for example "Five Hundred USD Only" or
// "One Hundred Twenty-Three USD and Forty-Five Cents Only". Works on the decimal text of `Money`, digit by digit.
import type { Money } from '@/lib/utils/currency';

const SMALL: Record<string, string> = {
  '0': 'Zero',
  '1': 'One',
  '2': 'Two',
  '3': 'Three',
  '4': 'Four',
  '5': 'Five',
  '6': 'Six',
  '7': 'Seven',
  '8': 'Eight',
  '9': 'Nine',
  '10': 'Ten',
  '11': 'Eleven',
  '12': 'Twelve',
  '13': 'Thirteen',
  '14': 'Fourteen',
  '15': 'Fifteen',
  '16': 'Sixteen',
  '17': 'Seventeen',
  '18': 'Eighteen',
  '19': 'Nineteen',
};
const TENS: Record<string, string> = {
  '2': 'Twenty',
  '3': 'Thirty',
  '4': 'Forty',
  '5': 'Fifty',
  '6': 'Sixty',
  '7': 'Seventy',
  '8': 'Eighty',
  '9': 'Ninety',
};
const SCALES = ['', 'Thousand', 'Million', 'Billion', 'Trillion'];

/** Words for a group of one to three digits (not zero). */
function group(digits: string): string {
  const g = digits.padStart(3, '0');
  const hundreds = g.charAt(0);
  const tail = g.slice(1);
  const parts: string[] = [];
  if (hundreds !== '0') parts.push(`${SMALL[hundreds] ?? ''} Hundred`);
  if (tail !== '00') {
    const tailNumber = tail.replace(/^0/, '');
    if (SMALL[tailNumber] !== undefined) parts.push(SMALL[tailNumber] ?? '');
    else {
      const unit = tail.charAt(1);
      parts.push(`${TENS[tail.charAt(0)] ?? ''}${unit !== '0' ? `-${SMALL[unit] ?? ''}` : ''}`);
    }
  }
  return parts.join(' ');
}

/** Words for a whole number given as digits (up to 15 digits). */
export function integerWords(digits: string): string {
  const clean = digits.replace(/^0+(?=\d)/, '');
  if (!/^\d{1,15}$/.test(clean)) throw new RangeError('The number is too large for words.');
  if (/^0+$/.test(clean)) return 'Zero';
  const groups: string[] = [];
  for (let end = clean.length; end > 0; end -= 3)
    groups.push(clean.slice(Math.max(0, end - 3), end));
  const parts: string[] = [];
  for (let i = groups.length - 1; i >= 0; i -= 1) {
    const g = groups[i] ?? '0';
    if (/^0+$/.test(g)) continue;
    const scale = SCALES[i];
    parts.push(`${group(g)}${scale ? ` ${scale}` : ''}`);
  }
  return parts.join(' ');
}

/** Amount in words with the currency code. The fraction is read from the first two decimal places (cents). */
export function amountInWords(amount: Money, currency = 'USD'): string {
  const text = amount.toDbString();
  const negative = text.startsWith('-');
  const [integer = '0', fraction = '0000'] = (negative ? text.slice(1) : text).split('.');
  const cents = fraction.slice(0, 2);
  const hasCents = cents !== '00';
  const whole = integerWords(integer);
  const sign = negative && !(whole === 'Zero' && !hasCents) ? 'Minus ' : '';
  const centsPart = hasCents ? ` and ${integerWords(cents)} Cent${cents === '01' ? '' : 's'}` : '';
  return `${sign}${whole} ${currency}${centsPart} Only`;
}
