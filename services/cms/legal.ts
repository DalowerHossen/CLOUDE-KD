// path: services/cms/legal.ts
// Legal documents: the current version of each, and the log of who accepted which version and when.
import 'server-only';
import { cookies } from 'next/headers';
import { z } from 'zod';
import { cookieSecure } from '@/lib/auth/session';
import { VISITOR_COOKIE } from '@/lib/analytics/consent';
import { LEGAL_EFFECTIVE, LEGAL_PAGES } from '@/lib/cms/defaults';
import { getService } from '@/lib/container';
import { InternalError, NotFoundError } from '@/lib/errors';
import { getAdminSupabase } from '@/lib/supabase/admin';
import { randomHex } from '@/lib/utils/hash';
import { readRequestMeta } from '@/services/audit/request-meta';
import { loadPage } from './page-loader';

/** Documents a person can accept. The others are informational. */
export const ACCEPTABLE = ['terms', 'privacy', 'refunds', 'acceptable-use', 'dpa'] as const;
export type AcceptableSlug = (typeof ACCEPTABLE)[number];
export const acceptSchema = z.object({ slug: z.enum(ACCEPTABLE) }).strict();

export const LEGAL_SLUGS: readonly string[] = Object.keys(LEGAL_PAGES).map((s) =>
  s.replace(/^legal\//, ''),
);

export interface LegalVersion {
  slug: string;
  title: string;
  /** Identifier stored with an acceptance: "v<number>" for a stored version, "built-in-<date>" otherwise. */
  version: string;
  effective: string;
}

export async function currentLegalVersion(slug: string): Promise<LegalVersion> {
  const page = await loadPage(`legal/${slug}`);
  if (!page) throw new NotFoundError();
  return {
    slug,
    title: page.title,
    version: page.versionNo === null ? `built-in-${LEGAL_EFFECTIVE}` : `v${page.versionNo}`,
    effective: page.updatedAt ? page.updatedAt.slice(0, 10) : LEGAL_EFFECTIVE,
  };
}

/** Who is accepting: the signed-in person, else the anonymous visitor id of the cookie (created when missing). */
export async function acceptanceSubject(): Promise<{ subject: string; userId: string | null }> {
  const actor = await getService('auth').getActor();
  if (actor) return { subject: `user:${actor.userId}`, userId: actor.userId };
  const jar = await cookies();
  let visitor = jar.get(VISITOR_COOKIE)?.value ?? '';
  if (!/^[0-9a-f]{32}$/.test(visitor)) {
    visitor = randomHex(16);
    jar.set(VISITOR_COOKIE, visitor, {
      httpOnly: true,
      secure: cookieSecure(),
      sameSite: 'lax',
      path: '/',
      maxAge: 400 * 24 * 3600,
    });
  }
  return { subject: `visitor:${visitor}`, userId: null };
}

export async function recordAcceptance(
  subject: { subject: string; userId: string | null },
  slug: AcceptableSlug,
): Promise<LegalVersion> {
  const current = await currentLegalVersion(slug);
  const meta = await readRequestMeta();
  const { data, error } = await getAdminSupabase().rpc('kd_legal_accept', {
    p_subject: subject.subject,
    p_user: subject.userId,
    p_slug: slug,
    p_version: current.version,
    p_ip_hash: meta.ipHash,
  });
  if (error) throw new InternalError(error);
  if (data === true) {
    const purpose = slug === 'terms' ? 'terms' : slug === 'refunds' ? 'refund_policy' : null;
    if (purpose)
      await getService('consent').record({
        subject: subject.subject,
        purpose,
        version: current.version,
        text: `Accepted: ${current.title}`,
      });
    await getService('audit').record({
      action: 'legal.accepted',
      resourceType: 'legal_document',
      resourceId: null,
      companyId: null,
      metadata: { slug, version: current.version },
    });
  }
  return current;
}

/** True when the subject accepted the version that is current now. Others STEPs use this to ask again after a change. */
export async function hasAcceptedCurrent(subject: string, slug: AcceptableSlug): Promise<boolean> {
  const current = await currentLegalVersion(slug);
  const { data, error } = await getAdminSupabase()
    .from('legal_acceptances')
    .select('id')
    .eq('subject', subject)
    .eq('document_slug', slug)
    .eq('document_version', current.version)
    .is('deleted_at', null)
    .limit(1);
  if (error) throw new InternalError(error);
  return (data ?? []).length > 0;
}
