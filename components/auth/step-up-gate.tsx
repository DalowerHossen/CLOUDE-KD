// path: components/auth/step-up-gate.tsx
'use client';
import { useEffect, useRef, useState } from 'react';
import { z } from 'zod';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { t } from '@/lib/i18n';

const errorBody = z.object({
  error: z.object({ code: z.string().optional(), message: z.string() }),
});

const isApiCall = (input: RequestInfo | URL): boolean => {
  if (typeof input === 'string') return input.startsWith('/api/');
  if (input instanceof URL)
    return input.origin === window.location.origin && input.pathname.startsWith('/api/');
  return false;
};

/** A body that can be sent a second time. */
const canRepeat = (init: RequestInit | undefined): boolean =>
  init?.body === undefined ||
  init.body === null ||
  typeof init.body === 'string' ||
  init.body instanceof FormData ||
  init.body instanceof URLSearchParams;

/**
 * Sensitive actions ask for a fresh password and two-step code. When an API call answers "step up required", this asks
 * for them in a window and then sends the same call again, so the person does not have to find another page first.
 */
export function StepUpGate(): JSX.Element {
  const [open, setOpen] = useState(false);
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const waiting = useRef<Promise<boolean> | null>(null);
  const settle = useRef<((confirmed: boolean) => void) | null>(null);
  const plainFetch = useRef<typeof window.fetch | null>(null);

  useEffect(() => {
    const original = window.fetch.bind(window);
    plainFetch.current = original;
    const ask = (): Promise<boolean> => {
      if (!waiting.current) {
        waiting.current = new Promise<boolean>((resolve) => {
          settle.current = (confirmed) => {
            waiting.current = null;
            settle.current = null;
            setOpen(false);
            resolve(confirmed);
          };
          setError(null);
          setOpen(true);
        });
      }
      return waiting.current;
    };
    window.fetch = async (input, init) => {
      const response = await original(input, init);
      if (response.status !== 401 || !isApiCall(input) || !canRepeat(init)) return response;
      const parsed = errorBody.safeParse(
        await response
          .clone()
          .json()
          .catch(() => null),
      );
      if (!parsed.success || parsed.data.error.code !== 'step_up_required') return response;
      return (await ask()) ? original(input, init) : response;
    };
    return () => {
      window.fetch = original;
    };
  }, []);

  async function confirm(): Promise<void> {
    const send = plainFetch.current;
    if (!send) return;
    setBusy(true);
    setError(null);
    try {
      const response = await send('/api/auth/step-up', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ password, code }),
      });
      if (response.ok) {
        setPassword('');
        setCode('');
        settle.current?.(true);
        return;
      }
      const parsed = errorBody.safeParse(await response.json().catch(() => null));
      setError(parsed.success ? parsed.data.error.message : t('s03Auth.common.genericError'));
    } catch {
      setError(t('s03Auth.common.genericError'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) settle.current?.(false);
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('s03Auth.locks.stepUpTitle')}</DialogTitle>
          <DialogDescription>{t('s03Auth.locks.stepUpBody')}</DialogDescription>
        </DialogHeader>
        <form
          className="space-y-sp-12"
          onSubmit={(e) => {
            e.preventDefault();
            void confirm();
          }}
        >
          <div className="space-y-1">
            <Label htmlFor="gate-password">{t('s03Auth.locks.stepUpPassword')}</Label>
            <Input
              id="gate-password"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              maxLength={256}
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="gate-code">{t('s03Auth.locks.stepUpCode')}</Label>
            <Input
              id="gate-code"
              inputMode="numeric"
              autoComplete="one-time-code"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              maxLength={12}
            />
          </div>
          <div aria-live="polite">
            {error ? (
              <Alert variant="destructive">
                <div>{error}</div>
              </Alert>
            ) : null}
          </div>
          <Button type="submit" disabled={busy || password.length === 0 || code.trim().length < 6}>
            {t('s03Auth.locks.stepUpSubmit')}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
