// path: services/payment/embed.ts
// The server side of the embedded checkout: which web sites may frame a payment link, and the check that a link may be
// embedded at all (active, not expired, not used up, invoice still payable). A refusal is 404 (link) or 403 (web site).
import 'server-only';
import { ForbiddenError } from '@/lib/errors';
import type { EmbedConfig } from '@/lib/payment/embed-sdk/rules';
import { cached } from '@/services/entitlement/cache';
import { originsOfCompany } from './embed-origins';
import { payableInvoice, resolveLink } from './links';

/** The origins that may frame the link behind a token. Throws NotFound for a link that cannot be paid. */
async function embeddableOrigins(
  token: string,
): Promise<{ origins: readonly string[]; expiresAt: string }> {
  const link = await resolveLink(token);
  await payableInvoice(link);
  return { origins: await originsOfCompany(link.company_id), expiresAt: link.expires_at };
}

/** For the proxy: the allowed frame ancestors of an embed page. Empty when the link is unusable (nobody may frame it). */
export async function ancestorsFor(token: string): Promise<readonly string[]> {
  return cached('embed-ancestors', token, async () => {
    try {
      return (await embeddableOrigins(token)).origins;
    } catch {
      return [];
    }
  });
}

/**
 * For the SDK: may this web site show this link? `origin` is the Origin header of the browser request (null for a caller
 * that is not a browser page). A link that cannot be paid is 404 whatever the origin; a listed-origin mismatch is 403.
 */
export async function embedConfigFor(token: string, origin: string | null): Promise<EmbedConfig> {
  const { origins, expiresAt } = await embeddableOrigins(token);
  if (origin !== null && !origins.includes(origin)) throw new ForbiddenError();
  return { available: true, linkExpiresAt: expiresAt };
}
