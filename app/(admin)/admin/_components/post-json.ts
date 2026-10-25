// path: app/(admin)/admin/_components/post-json.ts
// One small helper for the platform forms: sends JSON and returns an error text or null.
import { z } from 'zod';
import { t } from '@/lib/i18n';

const errorBody = z.object({
  error: z.object({ message: z.string(), correlation_id: z.string().optional() }),
});

export async function sendJson(
  url: string,
  method: 'POST' | 'PUT',
  body: unknown,
): Promise<string | null> {
  try {
    const response = await fetch(url, {
      method,
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (response.ok) return null;
    const parsed = errorBody.safeParse(await response.json().catch(() => null));
    if (!parsed.success) return t('s07Company.adminOps.error');
    const id = parsed.data.error.correlation_id;
    return id ? `${parsed.data.error.message} (${id})` : parsed.data.error.message;
  } catch {
    return t('s07Company.adminOps.error');
  }
}
