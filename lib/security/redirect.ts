// path: lib/security/redirect.ts
// Open-redirect protection: a redirect target is accepted only when it is a local path from the allow list.
import { REDIRECT_ALLOWED_PREFIXES } from '@/config/security';

/** Returns a safe local path, or null when the target must be refused. */
export function safeRedirectPath(
  target: string | null | undefined,
  allowedPrefixes: readonly string[] = REDIRECT_ALLOWED_PREFIXES,
): string | null {
  if (!target || target.length > 2000) return null;
  if (/[\u0000-\u001f\u007f\\]/.test(target)) return null;
  if (!target.startsWith('/') || target.startsWith('//')) return null;
  let decoded: string;
  try {
    decoded = decodeURIComponent(target);
  } catch {
    return null;
  }
  if (
    decoded.startsWith('//') ||
    /[\u0000-\u001f\u007f\\]/.test(decoded) ||
    decoded.includes('/../')
  )
    return null;
  const path = target.split(/[?#]/)[0] ?? target;
  const ok = allowedPrefixes.some((p) =>
    p.endsWith('/') ? path.startsWith(p) : path === p || path.startsWith(`${p}/`),
  );
  return ok ? target : null;
}

/** True when `url` is https and its host is exactly one of the allowed hosts. */
export function isAllowedExternalRedirect(url: string, allowedHosts: readonly string[]): boolean {
  try {
    const parsed = new URL(url);
    return (
      parsed.protocol === 'https:' &&
      parsed.username === '' &&
      parsed.password === '' &&
      allowedHosts.includes(parsed.hostname.toLowerCase())
    );
  } catch {
    return false;
  }
}
