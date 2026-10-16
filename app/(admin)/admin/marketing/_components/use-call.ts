// path: app/(admin)/admin/marketing/_components/use-call.ts
'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { z } from 'zod';
import { t } from '@/lib/i18n';

const errorBody = z.object({ error: z.object({ message: z.string() }) });

/** Sends one JSON request to an admin endpoint, keeps the answer text and refreshes the page on success. */
export function useCall(): {
  busy: boolean;
  message: string | null;
  call: (method: 'POST' | 'PUT' | 'DELETE', url: string, body?: unknown) => Promise<boolean>;
} {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  async function call(
    method: 'POST' | 'PUT' | 'DELETE',
    url: string,
    body?: unknown,
  ): Promise<boolean> {
    setBusy(true);
    setMessage(null);
    try {
      const response = await fetch(url, {
        method,
        headers: { 'content-type': 'application/json' },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      });
      if (response.ok) {
        setMessage(t('s06Public.marketingAdmin.done'));
        router.refresh();
        return true;
      }
      const parsed = errorBody.safeParse(await response.json().catch(() => null));
      setMessage(parsed.success ? parsed.data.error.message : t('s06Public.marketingAdmin.error'));
    } catch {
      setMessage(t('s06Public.marketingAdmin.error'));
    } finally {
      setBusy(false);
    }
    return false;
  }
  return { busy, message, call };
}
