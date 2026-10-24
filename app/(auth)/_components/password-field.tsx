// path: app/(auth)/_components/password-field.tsx
'use client';
import { useId, useState } from 'react';
import { Eye, EyeOff } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { checkPassword, passwordStrength, type PasswordRule } from '@/lib/auth/password';
import { t, type StringKey } from '@/lib/i18n';
import { cn } from '@/lib/utils/cn';

interface Props {
  name: string;
  label: string;
  autoComplete: 'current-password' | 'new-password';
  /** Shows the rule list and the strength meter (sign-up, reset, change). */
  showRules?: boolean;
  email?: string;
  required?: boolean;
  error?: string | undefined;
}

const RULE_KEYS: Record<Exclude<PasswordRule, 'maxLength' | 'containsEmail'>, StringKey> = {
  minLength: 's03Auth.passwordRules.minLength',
  upper: 's03Auth.passwordRules.upper',
  lower: 's03Auth.passwordRules.lower',
  digit: 's03Auth.passwordRules.digit',
  special: 's03Auth.passwordRules.special',
};
const STRENGTH_KEYS: readonly StringKey[] = [
  's03Auth.passwordRules.strength0',
  's03Auth.passwordRules.strength1',
  's03Auth.passwordRules.strength2',
  's03Auth.passwordRules.strength3',
  's03Auth.passwordRules.strength4',
];
const BAR_COLOR = ['bg-muted', 'bg-destructive', 'bg-warning', 'bg-info', 'bg-success'] as const;

export function PasswordField({
  name,
  label,
  autoComplete,
  showRules = false,
  email,
  required = true,
  error,
}: Props): JSX.Element {
  const id = useId();
  const [value, setValue] = useState('');
  const [visible, setVisible] = useState(false);
  const failed = new Set(checkPassword(value, email).failed);
  const strength = passwordStrength(value);
  return (
    <div className="space-y-2">
      <Label htmlFor={id}>{label}</Label>
      <div className="relative">
        <Input
          id={id}
          name={name}
          type={visible ? 'text' : 'password'}
          autoComplete={autoComplete}
          required={required}
          maxLength={256}
          value={value}
          onChange={(event) => setValue(event.target.value)}
          aria-invalid={error ? true : undefined}
          aria-describedby={showRules ? `${id}-rules` : error ? `${id}-error` : undefined}
          className="pr-12"
        />
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="absolute right-0 top-0 h-full min-h-[44px] min-w-[44px]"
          aria-label={visible ? t('s03Auth.common.hidePassword') : t('s03Auth.common.showPassword')}
          aria-pressed={visible}
          onClick={() => setVisible(!visible)}
        >
          {visible ? (
            <EyeOff className="h-4 w-4" aria-hidden="true" />
          ) : (
            <Eye className="h-4 w-4" aria-hidden="true" />
          )}
        </Button>
      </div>
      {error ? (
        <p id={`${id}-error`} role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}
      {showRules ? (
        <div id={`${id}-rules`} className="space-y-2">
          <div aria-live="polite" className="text-caption text-muted-foreground">
            {t('s03Auth.passwordRules.strength')}:{' '}
            {t(STRENGTH_KEYS[strength] ?? STRENGTH_KEYS[0] ?? 's03Auth.passwordRules.strength0')}
          </div>
          <div className="flex gap-1" aria-hidden="true">
            {[1, 2, 3, 4].map((step) => (
              <span
                key={step}
                className={cn(
                  'h-1.5 flex-1 rounded-full',
                  strength >= step ? BAR_COLOR[strength] : 'bg-muted',
                )}
              />
            ))}
          </div>
          <ul
            className="space-y-1 text-caption text-muted-foreground"
            aria-label={t('s03Auth.passwordRules.title')}
          >
            {(Object.keys(RULE_KEYS) as (keyof typeof RULE_KEYS)[]).map((rule) => (
              <li
                key={rule}
                className={cn(value.length > 0 && !failed.has(rule) && 'text-success')}
              >
                {value.length > 0 && !failed.has(rule) ? '[ok] ' : '[ ] '}
                {t(RULE_KEYS[rule])}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
