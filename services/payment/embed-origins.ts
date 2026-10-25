// path: services/payment/embed-origins.ts
// The web sites a merchant allows to show its payment links in a frame (table checkout_embed_origins). The list is used by
// the embed page (frame-ancestors), the embed API (CORS) and the pay route (an embedded payment must come from a listed site).
import 'server-only';
import { getService } from '@/lib/container';
import {
  ConflictError,
  ForbiddenError,
  InternalError,
  NotFoundError,
  ValidationError,
} from '@/lib/errors';
import { EMBED_MAX_ORIGINS } from '@/lib/payment/embed-sdk/rules';
import { getAdminSupabase } from '@/lib/supabase/admin';
import { cached, invalidatePlanCache } from '@/services/entitlement/cache';
import type { Actor } from '@/types/contracts';

export interface EmbedOriginView {
  id: string;
  origin: string;
  createdAt: string;
}

/** The listed origins of a company, for the servers. Answers are kept for a few seconds. */
export async function originsOfCompany(companyId: string): Promise<readonly string[]> {
  return cached('embed-origins', companyId, async () => {
    const { data, error } = await getAdminSupabase()
      .from('checkout_embed_origins')
      .select('origin')
      .eq('company_id', companyId)
      .is('deleted_at', null)
      .limit(EMBED_MAX_ORIGINS);
    if (error) throw new InternalError(error);
    return (data ?? []).map((r) => String(r.origin));
  });
}

export async function listEmbedOrigins(companyId: string): Promise<EmbedOriginView[]> {
  const { data, error } = await getAdminSupabase()
    .from('checkout_embed_origins')
    .select('id, origin, created_at')
    .eq('company_id', companyId)
    .is('deleted_at', null)
    .order('created_at', { ascending: true })
    .limit(EMBED_MAX_ORIGINS);
  if (error) throw new InternalError(error);
  return (data ?? []).map((r) => ({
    id: String(r.id),
    origin: String(r.origin),
    createdAt: String(r.created_at),
  }));
}

export async function addEmbedOrigin(actor: Actor, origin: string): Promise<EmbedOriginView> {
  if (!actor.companyId) throw new ForbiddenError();
  const existing = await listEmbedOrigins(actor.companyId);
  if (existing.length >= EMBED_MAX_ORIGINS)
    throw new ValidationError(`You can list at most ${EMBED_MAX_ORIGINS} web sites.`);
  const { data, error } = await getAdminSupabase()
    .from('checkout_embed_origins')
    .insert({ company_id: actor.companyId, origin, created_by: actor.userId })
    .select('id, origin, created_at')
    .single();
  if (error) {
    if (error.code === '23505') throw new ConflictError('This web site is already listed.');
    throw new InternalError(error);
  }
  invalidatePlanCache();
  await getService('audit').record({
    action: 'payment.embed_origin.added',
    resourceType: 'checkout_embed_origin',
    resourceId: String(data.id),
    companyId: actor.companyId,
    metadata: { origin, by: actor.userId },
  });
  return { id: String(data.id), origin: String(data.origin), createdAt: String(data.created_at) };
}

export async function removeEmbedOrigin(actor: Actor, id: string): Promise<void> {
  if (!actor.companyId) throw new ForbiddenError();
  const { data, error } = await getAdminSupabase()
    .from('checkout_embed_origins')
    .update({ deleted_at: new Date().toISOString() })
    .eq('company_id', actor.companyId)
    .eq('id', id)
    .is('deleted_at', null)
    .select('id, origin')
    .maybeSingle();
  if (error) throw new InternalError(error);
  if (!data) throw new NotFoundError();
  invalidatePlanCache();
  await getService('audit').record({
    action: 'payment.embed_origin.removed',
    resourceType: 'checkout_embed_origin',
    resourceId: id,
    companyId: actor.companyId,
    metadata: { origin: String(data.origin), by: actor.userId },
  });
}
