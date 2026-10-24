// path: lib/security/csrf-init.tsx
'use client';
import { useEffect } from 'react';
import { CSRF_COOKIE, CSRF_HEADER } from '@/config/security';

const MUTATING = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);
const PATCHED = Symbol.for('kd.csrf.fetch');

function readCookie(name: string): string | null {
  const match = document.cookie.split('; ').find((c) => c.startsWith(`${name}=`));
  return match ? decodeURIComponent(match.slice(name.length + 1)) : null;
}

/**
 * Adds the CSRF header to every same-origin state-changing fetch call, so no form or component has to remember it.
 * The server compares the header with the signed cookie (lib/middleware/csrf.ts).
 */
export function CsrfInit(): null {
  useEffect(() => {
    const holder = window as unknown as Record<symbol, boolean>;
    if (holder[PATCHED]) return;
    holder[PATCHED] = true;
    const original = window.fetch.bind(window);
    window.fetch = (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
      const method = (
        init?.method ?? (input instanceof Request ? input.method : 'GET')
      ).toUpperCase();
      const url = new URL(
        input instanceof Request ? input.url : String(input),
        window.location.href,
      );
      if (MUTATING.has(method) && url.origin === window.location.origin) {
        const token = readCookie(CSRF_COOKIE);
        if (token) {
          const headers = new Headers(
            init?.headers ?? (input instanceof Request ? input.headers : undefined),
          );
          headers.set(CSRF_HEADER, token);
          return original(input, { ...init, headers });
        }
      }
      return original(input, init);
    };
  }, []);
  return null;
}
