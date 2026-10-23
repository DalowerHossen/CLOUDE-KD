// path: lib/auth/password.ts
// Password policy that runs in the browser and on the server (pure functions, no secrets, no Node-only APIs).
import { PASSWORD_MAX_LENGTH, PASSWORD_MIN_LENGTH } from '@/config/auth-lock';

export interface PasswordCheck {
  ok: boolean;
  /** Keys of the rules that failed, for example "minLength". */
  failed: PasswordRule[];
}

export type PasswordRule =
  'minLength' | 'maxLength' | 'upper' | 'lower' | 'digit' | 'special' | 'containsEmail';

export const PASSWORD_RULES: readonly PasswordRule[] = [
  'minLength',
  'upper',
  'lower',
  'digit',
  'special',
  'containsEmail',
];

const SPECIAL = /[^A-Za-z0-9\s]/;

/** Checks the password rules. `email` (optional) must not appear inside the password. */
export function checkPassword(password: string, email?: string): PasswordCheck {
  const failed: PasswordRule[] = [];
  if (password.length < PASSWORD_MIN_LENGTH) failed.push('minLength');
  if (password.length > PASSWORD_MAX_LENGTH) failed.push('maxLength');
  if (!/[A-Z]/.test(password)) failed.push('upper');
  if (!/[a-z]/.test(password)) failed.push('lower');
  if (!/[0-9]/.test(password)) failed.push('digit');
  if (!SPECIAL.test(password)) failed.push('special');
  if (email) {
    const local = email.split('@')[0]?.toLowerCase() ?? '';
    if (local.length >= 4 && password.toLowerCase().includes(local)) failed.push('containsEmail');
  }
  return { ok: failed.length === 0, failed };
}

/** 0 (empty) to 4 (strong). Counts length and character classes; common patterns lower the score. */
export function passwordStrength(password: string): 0 | 1 | 2 | 3 | 4 {
  if (password.length === 0) return 0;
  let score = 0;
  if (password.length >= PASSWORD_MIN_LENGTH) score += 1;
  if (password.length >= 16) score += 1;
  const classes = [/[a-z]/, /[A-Z]/, /[0-9]/, SPECIAL].filter((re) => re.test(password)).length;
  if (classes >= 3) score += 1;
  if (classes === 4 && new Set(password).size >= 8) score += 1;
  if (/^(.)\1+$/.test(password) || /(0123|1234|abcd|qwer|password)/i.test(password))
    score = Math.max(0, score - 2);
  return Math.min(4, score) as 0 | 1 | 2 | 3 | 4;
}
