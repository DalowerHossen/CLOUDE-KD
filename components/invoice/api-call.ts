// path: components/invoice/api-call.ts
// One small helper for the invoice screens: sends JSON, returns the answer in a fixed shape. Never throws.
import { z } from 'zod';

const errorBody = z.object({ error: z.object({ message: z.string() }) });

export interface CallResult {
  ok: boolean;
  status: number;
  data: unknown;
  /** The server's message when the call failed. */
  message: string | null;
}

export async function callJson(
  url: string,
  method: 'GET' | 'POST' | 'PUT' | 'DELETE',
  body?: unknown,
  headers: Record<string, string> = {},
): Promise<CallResult> {
  try {
    const response = await fetch(url, {
      method,
      headers: body === undefined ? headers : { 'content-type': 'application/json', ...headers },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const json: unknown = await response.json().catch(() => null);
    const data = z.object({ data: z.unknown() }).safeParse(json);
    const err = errorBody.safeParse(json);
    return {
      ok: response.ok,
      status: response.status,
      data: data.success ? data.data.data : null,
      message: err.success ? err.data.error.message : null,
    };
  } catch {
    return { ok: false, status: 0, data: null, message: null };
  }
}
