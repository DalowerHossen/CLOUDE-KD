// path: app/(auth)/_components/auth-client.ts
// Small fetch helper for the auth forms: JSON in, parsed result out, never throws on HTTP errors.
import { z } from 'zod';

const errorShape = z.object({
  error: z.object({
    code: z.string(),
    message: z.string(),
    details: z.array(z.object({ path: z.string(), message: z.string() })).optional(),
  }),
});

export type PostResult<T> =
  | { ok: true; status: number; data: T }
  | {
      ok: false;
      status: number;
      code: string;
      message: string;
      issues: { path: string; message: string }[];
    };

export async function postJson<S extends z.ZodTypeAny>(
  url: string,
  body: unknown,
  schema: S,
): Promise<PostResult<z.output<S>>> {
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
      credentials: 'same-origin',
    });
    const json: unknown = await response.json().catch(() => null);
    if (response.ok) {
      const envelope = z.object({ data: z.unknown() }).safeParse(json);
      const parsed = envelope.success ? schema.safeParse(envelope.data.data) : null;
      if (parsed?.success) return { ok: true, status: response.status, data: parsed.data };
      return { ok: false, status: response.status, code: 'bad_response', message: '', issues: [] };
    }
    const err = errorShape.safeParse(json);
    return err.success
      ? {
          ok: false,
          status: response.status,
          code: err.data.error.code,
          message: err.data.error.message,
          issues: err.data.error.details ?? [],
        }
      : { ok: false, status: response.status, code: 'unknown', message: '', issues: [] };
  } catch {
    return { ok: false, status: 0, code: 'network', message: '', issues: [] };
  }
}
