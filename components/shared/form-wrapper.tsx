// path: components/shared/form-wrapper.tsx
'use client';

import { createContext, useContext, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { Button, type ButtonProps } from '@/components/ui/button';
import { t } from '@/lib/i18n';

const SubmitContext = createContext<boolean>(false);

interface FormWrapperProps {
  onSubmit: (data: FormData) => Promise<void>;
  /** Called instead of onSubmit when the hidden honeypot field was filled (bots). */
  onBlocked?: () => void;
  /** One-time token issued by the server for this form (double-submit protection). */
  csrfToken?: string;
  children: ReactNode;
  className?: string;
}

const HONEYPOT = 'website_url';

/**
 * Form with duplicate-submit protection: a second submit while one runs is ignored and the submit
 * button is disabled. Includes an invisible honeypot field that humans never fill in.
 */
export function FormWrapper({
  onSubmit,
  onBlocked,
  csrfToken,
  children,
  className,
}: FormWrapperProps): JSX.Element {
  const [submitting, setSubmitting] = useState(false);
  const locked = useRef(false);

  const handle = async (event: FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault();
    if (locked.current) return;
    const data = new FormData(event.currentTarget);
    if ((data.get(HONEYPOT) ?? '') !== '') {
      onBlocked?.();
      return;
    }
    data.delete(HONEYPOT);
    locked.current = true;
    setSubmitting(true);
    try {
      await onSubmit(data);
    } finally {
      locked.current = false;
      setSubmitting(false);
    }
  };

  return (
    <SubmitContext.Provider value={submitting}>
      <form onSubmit={handle} noValidate className={className} aria-busy={submitting || undefined}>
        {csrfToken ? <input type="hidden" name="csrf_token" value={csrfToken} /> : null}
        <div aria-hidden="true" className="absolute -left-[9999px] h-0 w-0 overflow-hidden">
          <label htmlFor={HONEYPOT}>Leave this field empty</label>
          <input
            id={HONEYPOT}
            name={HONEYPOT}
            type="text"
            tabIndex={-1}
            autoComplete="off"
            defaultValue=""
          />
        </div>
        {children}
      </form>
    </SubmitContext.Provider>
  );
}

/** Submit button that shows progress and is disabled while the surrounding FormWrapper submits. */
export function SubmitButton({
  children,
  ...props
}: Omit<ButtonProps, 'type' | 'loading'>): JSX.Element {
  const submitting = useContext(SubmitContext);
  return (
    <Button type="submit" loading={submitting} {...props}>
      {submitting ? t('s01Core.common.saving') : children}
    </Button>
  );
}
