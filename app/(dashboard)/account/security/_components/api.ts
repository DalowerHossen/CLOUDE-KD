// path: app/(dashboard)/account/security/_components/api.ts
// Tiny client helper for the security page: JSON POST that returns the parsed error message on failure.
import { z } from 'zod';
import { t } from '@/lib/i18n';

const errorBody = z.object({ error: z.object({ message: z.string() }) });

export async function call(
  url: string,
  body: unknown,
): Promise<{ ok: true; json: unknown } | { ok: false; message: string }> {
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
    const json: unknown = await response.json().catch(() => null);
    if (response.ok) return { ok: true, json };
    const parsed = errorBody.safeParse(json);
    return {
      ok: false,
      message: parsed.success ? parsed.data.error.message : t('s03Auth.common.genericError'),
    };
  } catch {
    return { ok: false, message: t('s03Auth.common.genericError') };
  }
}
