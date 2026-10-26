// path: services/platform/release-notes.ts
// "What's new" and product tours. The platform team publishes and withdraws notes (each may carry the steps of a short tour);
// a company user sees the live notes meant for their role and records what they have seen. A read that fails never breaks a page.
import 'server-only';
import { getService } from '@/lib/container';
import { ForbiddenError, InternalError, NotFoundError } from '@/lib/errors';
import { createLogger } from '@/lib/logger';
import {
  tourStepSchema,
  unseen,
  type ReleaseAction,
  type SeenInput,
  type TourStep,
} from '@/lib/platform/release-notes';
import { getAdminSupabase } from '@/lib/supabase/admin';
import { cached, invalidatePlanCache } from '@/services/entitlement/cache';
import type { Actor } from '@/types/contracts';

const log = createLogger({ component: 'release-notes' });

export interface ReleaseNote {
  id: string;
  title: string;
  body: string;
  kind: 'feature' | 'improvement' | 'fix';
  audience: 'all' | 'owners';
  publishedAt: string;
  status: 'published' | 'withdrawn';
  tour: TourStep[];
}

export interface ReaderNote extends ReleaseNote {
  seen: boolean;
  tourDone: boolean;
}

const COLUMNS = 'id, title, body, kind, audience, published_at, status, tour';

function toNote(r: Record<string, unknown>): ReleaseNote {
  const steps = Array.isArray(r.tour)
    ? r.tour.flatMap((s) => {
        const parsed = tourStepSchema.safeParse(s);
        return parsed.success ? [parsed.data] : [];
      })
    : [];
  return {
    id: String(r.id),
    title: String(r.title),
    body: String(r.body),
    kind: String(r.kind) as ReleaseNote['kind'],
    audience: String(r.audience) as ReleaseNote['audience'],
    publishedAt: String(r.published_at),
    status: String(r.status) as ReleaseNote['status'],
    tour: steps,
  };
}

/** All notes, newest first, for the platform screen. */
export async function listAllNotes(): Promise<ReleaseNote[]> {
  const { data, error } = await getAdminSupabase()
    .from('release_notes')
    .select(COLUMNS)
    .is('deleted_at', null)
    .order('published_at', { ascending: false })
    .limit(100);
  if (error) throw new InternalError(error);
  return (data ?? []).map(toNote);
}

async function liveNotes(role: string): Promise<ReleaseNote[]> {
  let q = getAdminSupabase()
    .from('release_notes')
    .select(COLUMNS)
    .eq('status', 'published')
    .is('deleted_at', null)
    .lte('published_at', new Date().toISOString())
    .order('published_at', { ascending: false })
    .limit(30);
  if (role !== 'owner') q = q.eq('audience', 'all');
  const { data, error } = await q;
  if (error) throw new InternalError(error);
  return (data ?? []).map(toNote);
}

async function readsOf(userId: string): Promise<Map<string, { tourDone: boolean }>> {
  const { data, error } = await getAdminSupabase()
    .from('release_note_reads')
    .select('note_id, tour_done_at')
    .eq('user_id', userId)
    .is('deleted_at', null)
    .limit(500);
  if (error) throw new InternalError(error);
  return new Map(
    (data ?? []).map((r) => [String(r.note_id), { tourDone: r.tour_done_at !== null }]),
  );
}

/** The live notes for the reader, with what they have seen and which tours they finished. */
export async function notesForReader(actor: Actor): Promise<ReaderNote[]> {
  const [notes, reads] = await Promise.all([liveNotes(actor.role), readsOf(actor.userId)]);
  return notes.map((n) => ({
    ...n,
    seen: reads.has(n.id),
    tourDone: reads.get(n.id)?.tourDone ?? false,
  }));
}

/** How many live notes the reader has not seen. Kept for a few seconds; a failed read answers 0. */
export async function unseenCount(actor: Actor): Promise<number> {
  try {
    return await cached('release-unseen', actor.userId, async () => {
      const [notes, reads] = await Promise.all([liveNotes(actor.role), readsOf(actor.userId)]);
      return unseen(
        notes.map((n) => n.id),
        new Set(reads.keys()),
      ).length;
    });
  } catch (error) {
    log.warn('unseen release notes could not be counted', { error });
    return 0;
  }
}

/** Records, for the reader only, that notes were seen or their tour was finished. */
export async function markReads(actor: Actor, input: SeenInput): Promise<void> {
  if (!actor.companyId) throw new ForbiddenError();
  const admin = getAdminSupabase();
  const live = new Set((await liveNotes(actor.role)).map((n) => n.id));
  const ids = input.ids.filter((id) => live.has(id));
  if (ids.length === 0) throw new NotFoundError();
  const existing = await readsOf(actor.userId);
  const now = new Date().toISOString();
  for (const id of ids) {
    const tourDone = input.action === 'tour_done';
    const r = existing.has(id)
      ? tourDone
        ? await admin
            .from('release_note_reads')
            .update({ tour_done_at: now })
            .eq('user_id', actor.userId)
            .eq('note_id', id)
            .is('deleted_at', null)
        : { error: null }
      : await admin.from('release_note_reads').insert({
          company_id: actor.companyId,
          user_id: actor.userId,
          note_id: id,
          tour_done_at: tourDone ? now : null,
        });
    if (r.error) throw new InternalError(r.error);
  }
  invalidatePlanCache();
}

export async function runReleaseAction(actor: Actor, input: ReleaseAction): Promise<void> {
  if (actor.role !== 'super_admin' && actor.role !== 'ceo') throw new ForbiddenError();
  const admin = getAdminSupabase();
  if (input.action === 'publish') {
    const r = await admin
      .from('release_notes')
      .insert({
        title: input.title,
        body: input.body,
        kind: input.kind,
        audience: input.audience,
        tour: input.tour,
        created_by: actor.userId,
      })
      .select('id')
      .single();
    if (r.error) throw new InternalError(r.error);
    invalidatePlanCache();
    await getService('audit').record({
      action: 'platform.release_published',
      resourceType: 'release_note',
      resourceId: String(r.data.id),
      companyId: null,
      metadata: { title: input.title, steps: input.tour.length, by: actor.userId },
    });
    return;
  }
  const r = await admin
    .from('release_notes')
    .update({ status: 'withdrawn' })
    .eq('id', input.id)
    .eq('status', 'published')
    .is('deleted_at', null)
    .select('id');
  if (r.error) throw new InternalError(r.error);
  if (!r.data || r.data.length === 0) throw new NotFoundError();
  invalidatePlanCache();
  await getService('audit').record({
    action: 'platform.release_withdrawn',
    resourceType: 'release_note',
    resourceId: input.id,
    companyId: null,
    metadata: { by: actor.userId },
  });
}
