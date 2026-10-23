// path: lib/security/use-admin-action.ts
'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { z } from 'zod';
import { t } from '@/lib/i18n';

const errorBody = z.object({ error: z.object({ message: z.string() }) });

/** Posts an action to an admin endpoint, shows the answer and refreshes the page on success. */
export function useAdminAction(endpoint: string): {
  message: string | null;
  busy: boolean;
  run: (body: unknown) => Promise<boolean>;
} {
  const router = useRouter();
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  async function run(body: unknown): Promise<boolean> {
    setBusy(true);
    setMessage(null);
    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (response.ok) {
        setMessage(t('s04Security.common.done'));
        router.refresh();
        return true;
      }
      const parsed = errorBody.safeParse(await response.json().catch(() => null));
      setMessage(parsed.success ? parsed.data.error.message : t('s03Auth.common.genericError'));
    } catch {
      setMessage(t('s03Auth.common.genericError'));
    } finally {
      setBusy(false);
    }
    return false;
  }
  return { message, busy, run };
}
