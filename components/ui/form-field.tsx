// path: components/ui/form-field.tsx
import * as React from 'react';
import { cn } from '@/lib/utils/cn';
import { Label } from '@/components/ui/label';

interface FormFieldProps {
  id: string;
  label: string;
  /** Shown below the control. */
  description?: string;
  /** Validation message. Announced to screen readers through aria-live. */
  error?: string | undefined;
  required?: boolean;
  className?: string;
  /** Receives the id and the aria attributes to spread on the control. */
  children: (controlProps: {
    id: string;
    'aria-describedby': string | undefined;
    'aria-invalid': boolean | undefined;
    'aria-required': boolean | undefined;
  }) => React.ReactNode;
}

/** Label + control + description + live error message with the correct ARIA wiring. */
function FormField({
  id,
  label,
  description,
  error,
  required,
  className,
  children,
}: FormFieldProps): JSX.Element {
  const descriptionId = description ? `${id}-description` : undefined;
  const errorId = `${id}-error`;
  const describedBy =
    [descriptionId, error ? errorId : undefined].filter(Boolean).join(' ') || undefined;
  return (
    <div className={cn('space-y-2', className)}>
      <Label htmlFor={id}>
        {label}
        {required ? (
          <span className="ml-1 text-destructive" aria-hidden="true">
            *
          </span>
        ) : null}
      </Label>
      {children({
        id,
        'aria-describedby': describedBy,
        'aria-invalid': error ? true : undefined,
        'aria-required': required || undefined,
      })}
      {description ? (
        <p id={descriptionId} className="text-caption text-muted-foreground">
          {description}
        </p>
      ) : null}
      <p
        id={errorId}
        role="alert"
        aria-live="polite"
        className={cn('text-caption text-destructive', error ? '' : 'sr-only')}
      >
        {error ?? ''}
      </p>
    </div>
  );
}

export { FormField };
