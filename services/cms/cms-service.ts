// path: services/cms/cms-service.ts
// Page management: drafts, versions, publish now or later, approval for content managers, revert, preview.
// Platform administrators (CEO, super admin) publish directly; a content manager's publish goes through the approval
// chain (action cms.publish, level L2) and is applied when the request is approved.
import 'server-only';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { getService } from '@/lib/container';
import { ForbiddenError, InternalError, NotFoundError, ValidationError } from '@/lib/errors';
import { createLogger } from '@/lib/logger';
import { pageContentSchema, pageMetaSchema, type BlockInput } from '@/lib/cms/blocks';
import { DEFAULT_PAGES, LEGAL_PAGES, defaultPage, pathOf } from '@/lib/cms/defaults';
import { sanitizeBlocks } from '@/lib/cms/sanitize-blocks';
import { getAdminSupabase } from '@/lib/supabase/admin';
import type { Actor } from '@/types/contracts';

const log = createLogger({ component: 'cms' });
const slugSchema = z
  .string()
  .regex(/^[a-z0-9]([a-z0-9-]{0,60}[a-z0-9])?(\/[a-z0-9]([a-z0-9-]{0,60}[a-z0-9])?){0,2}$/);

const saveAction = z
  .object({
    action: z.literal('save'),
    slug: slugSchema,
    title: z.string(),
    description: z.string(),
    blocks: z.array(z.unknown()).min(1).max(40),
    note: z.string().trim().max(300).default(''),
  })
  .strict();
export const cmsSaveSchema = saveAction;
/** Publish, call back, revert and the search-engine switch need a fresh step-up. */
export const cmsPublishSchema = z.discriminatedUnion('action', [
  z
    .object({
      action: z.literal('publish'),
      slug: slugSchema,
      publishAt: z.string().datetime().nullable().default(null),
    })
    .strict(),
  z.object({ action: z.literal('cancel'), slug: slugSchema }).strict(),
  z
    .object({ action: z.literal('revert'), slug: slugSchema, versionNo: z.number().int().min(1) })
    .strict(),
  z.object({ action: z.literal('noindex'), slug: slugSchema, value: z.boolean() }).strict(),
]);
export const cmsActionSchema = z.union([cmsSaveSchema, cmsPublishSchema]);
export type CmsAction = z.infer<typeof cmsActionSchema>;

const canPublishDirect = (actor: Actor): boolean =>
  actor.role === 'ceo' || actor.role === 'super_admin';

export function refresh(slug: string): void {
  try {
    revalidatePath(pathOf(slug));
    revalidatePath('/sitemap.xml');
  } catch (error) {
    // Outside a request (a script) there is nothing to refresh; pages refresh by time as well.
    log.warn('page cache could not be refreshed', {
      slug,
      error: error instanceof Error ? error.message : 'failed',
    });
  }
}

const versionRow = z
  .object({
    id: z.string().uuid(),
    version_no: z.number().int(),
    title: z.string(),
    description: z.string(),
    blocks: z.unknown(),
    status: z.enum(['draft', 'pending_approval', 'scheduled', 'published', 'archived']),
    publish_at: z.string().nullable(),
    published_at: z.string().nullable(),
    approval_request_id: z.string().uuid().nullable(),
    note: z.string().nullable(),
    created_at: z.string(),
  })
  .strip();
export type VersionView = z.infer<typeof versionRow>;

export interface PageListItem {
  slug: string;
  kind: string;
  title: string;
  state: 'built_in' | 'published' | 'draft' | 'pending_approval' | 'scheduled';
  hasDraft: boolean;
  noindex: boolean;
}

export async function listPages(kind: 'page' | 'legal' | 'help' = 'page'): Promise<PageListItem[]> {
  const admin = getAdminSupabase();
  const pages = await admin
    .from('cms_pages')
    .select('id, slug, kind, live_version_id, noindex')
    .eq('kind', kind)
    .is('deleted_at', null);
  if (pages.error) throw new InternalError(pages.error);
  const ids = (pages.data ?? []).map((p) => String(p.id));
  const open = ids.length
    ? await admin
        .from('cms_page_versions')
        .select('page_id, status, title')
        .in('page_id', ids)
        .in('status', ['draft', 'pending_approval', 'scheduled', 'published'])
        .is('deleted_at', null)
    : { data: [], error: null };
  if (open.error) throw new InternalError(open.error);
  const out = new Map<string, PageListItem>();
  if (kind === 'page' || kind === 'legal') {
    for (const [slug, def] of Object.entries(kind === 'legal' ? LEGAL_PAGES : DEFAULT_PAGES))
      out.set(slug, {
        slug,
        kind,
        title: def.title,
        state: 'built_in',
        hasDraft: false,
        noindex: false,
      });
  }
  for (const p of pages.data ?? []) {
    const versions = (open.data ?? []).filter((v) => String(v.page_id) === String(p.id));
    const unfinished = versions.find((v) => v.status !== 'published');
    const live = versions.find((v) => v.status === 'published');
    const previous = out.get(String(p.slug));
    out.set(String(p.slug), {
      slug: String(p.slug),
      kind,
      title: String((unfinished ?? live)?.title ?? previous?.title ?? p.slug),
      state: unfinished
        ? (unfinished.status as PageListItem['state'])
        : live
          ? 'published'
          : (previous?.state ?? 'draft'),
      hasDraft: unfinished?.status === 'draft',
      noindex: p.noindex === true,
    });
  }
  return [...out.values()].sort((a, b) => (a.slug < b.slug ? -1 : 1));
}

export interface EditorData {
  slug: string;
  kind: string;
  noindex: boolean;
  title: string;
  description: string;
  blocks: unknown[];
  /** Where the editor content came from. */
  basedOn: 'draft' | 'published' | 'built_in' | 'new';
  open: VersionView | null;
  versions: VersionView[];
  canPublishDirect: boolean;
}

export async function editorData(
  actor: Actor,
  slug: string,
  kind: 'page' | 'legal' | 'help' = 'page',
): Promise<EditorData> {
  const admin = getAdminSupabase();
  const page = await admin
    .from('cms_pages')
    .select('id, kind, noindex')
    .eq('slug', slug)
    .is('deleted_at', null)
    .maybeSingle();
  if (page.error) throw new InternalError(page.error);
  let versions: VersionView[] = [];
  if (page.data) {
    const rows = await admin
      .from('cms_page_versions')
      .select(
        'id, version_no, title, description, blocks, status, publish_at, published_at, approval_request_id, note, created_at',
      )
      .eq('page_id', String(page.data.id))
      .is('deleted_at', null)
      .order('version_no', { ascending: false })
      .limit(50);
    if (rows.error) throw new InternalError(rows.error);
    versions = z.array(versionRow).parse(rows.data ?? []);
  }
  const open =
    versions.find(
      (v) => v.status === 'draft' || v.status === 'pending_approval' || v.status === 'scheduled',
    ) ?? null;
  const live = versions.find((v) => v.status === 'published') ?? null;
  const def = defaultPage(slug);
  const source = open ?? live;
  if (!source && !def && !page.data) {
    // A brand new page: the editor starts empty.
    return {
      slug,
      kind,
      noindex: false,
      title: '',
      description: '',
      blocks: [],
      basedOn: 'new',
      open: null,
      versions,
      canPublishDirect: canPublishDirect(actor),
    };
  }
  return {
    slug,
    kind: page.data ? String(page.data.kind) : kind,
    noindex: page.data?.noindex === true,
    title: source?.title ?? def?.title ?? '',
    description: source?.description ?? def?.description ?? '',
    blocks: (source?.blocks as unknown[] | undefined) ?? def?.blocks ?? [],
    basedOn: open ? 'draft' : live ? 'published' : def ? 'built_in' : 'new',
    open,
    versions,
    canPublishDirect: canPublishDirect(actor),
  };
}

function parseContent(input: { title: string; description: string; blocks: unknown[] }): {
  title: string;
  description: string;
  blocks: BlockInput[];
} {
  const meta = pageMetaSchema.safeParse({ title: input.title, description: input.description });
  if (!meta.success)
    throw new ValidationError(
      meta.error.issues[0]?.message ?? 'The title or description is not valid.',
    );
  const blocks = pageContentSchema.safeParse(input.blocks);
  if (!blocks.success) {
    const issue = blocks.error.issues[0];
    throw new ValidationError(
      `${issue?.message ?? 'A block is not valid.'}${issue?.path.length ? ` (at ${issue.path.join('.')})` : ''}`,
    );
  }
  return { ...meta.data, blocks: sanitizeBlocks(blocks.data) as BlockInput[] };
}

async function openVersion(slug: string): Promise<VersionView & { pageId: string }> {
  const admin = getAdminSupabase();
  const page = await admin
    .from('cms_pages')
    .select('id')
    .eq('slug', slug)
    .is('deleted_at', null)
    .maybeSingle();
  if (page.error) throw new InternalError(page.error);
  if (!page.data) throw new NotFoundError();
  const rows = await admin
    .from('cms_page_versions')
    .select(
      'id, version_no, title, description, blocks, status, publish_at, published_at, approval_request_id, note, created_at',
    )
    .eq('page_id', String(page.data.id))
    .in('status', ['draft', 'pending_approval', 'scheduled'])
    .is('deleted_at', null)
    .maybeSingle();
  if (rows.error) throw new InternalError(rows.error);
  if (!rows.data) throw new NotFoundError();
  return { ...versionRow.parse(rows.data), pageId: String(page.data.id) };
}

export async function runCmsAction(
  actor: Actor,
  kind: 'page' | 'legal' | 'help',
  input: CmsAction,
): Promise<unknown> {
  const admin = getAdminSupabase();
  const audit = getService('audit');
  switch (input.action) {
    case 'save': {
      const content = parseContent(input);
      const { data, error } = await admin.rpc('kd_cms_save_draft', {
        p_slug: input.slug,
        p_kind: kind,
        p_title: content.title,
        p_description: content.description,
        p_blocks: content.blocks,
        p_author: actor.userId,
        p_note: input.note || null,
      });
      if (error) {
        if (error.code === '22023')
          throw new ValidationError(
            'This page has a version waiting for approval or scheduled. Call it back before you edit.',
          );
        throw new InternalError(error);
      }
      await audit.record({
        action: 'cms.draft_saved',
        resourceType: 'cms_page',
        resourceId: null,
        companyId: null,
        metadata: { slug: input.slug, by: actor.userId },
      });
      return data;
    }
    case 'publish': {
      const version = await openVersion(input.slug);
      if (version.status !== 'draft') throw new ValidationError('Only a draft can be published.');
      const at =
        input.publishAt && Date.parse(input.publishAt) > Date.now() + 60_000
          ? input.publishAt
          : null;
      if (canPublishDirect(actor)) {
        const { data, error } = await admin.rpc('kd_cms_publish', {
          p_version: version.id,
          p_publish_at: at,
        });
        if (error) throw new InternalError(error);
        await audit.record({
          action: at ? 'cms.scheduled' : 'cms.published',
          resourceType: 'cms_page',
          resourceId: null,
          companyId: null,
          metadata: { slug: input.slug, version: version.version_no, at },
        });
        if (data === 'published') refresh(input.slug);
        return { result: data, versionNo: version.version_no };
      }
      const state = await getService('approval').request({
        action: 'cms.publish',
        payload: {
          slug: input.slug,
          versionId: version.id,
          versionNo: version.version_no,
          publishAt: at,
        },
        requesterId: actor.userId,
        companyId: null,
      });
      const marked = await admin.rpc('kd_cms_mark_pending', {
        p_version: version.id,
        p_request: state.requestId,
        p_publish_at: at,
      });
      if (marked.error) throw new InternalError(marked.error);
      await audit.record({
        action: 'cms.publish_requested',
        resourceType: 'cms_page',
        resourceId: null,
        companyId: null,
        metadata: { slug: input.slug, version: version.version_no, request: state.requestId },
      });
      return {
        result: 'pending_approval',
        requestId: state.requestId,
        versionNo: version.version_no,
      };
    }
    case 'cancel': {
      const version = await openVersion(input.slug);
      const { data, error } = await admin.rpc('kd_cms_to_draft', { p_version: version.id });
      if (error) throw new InternalError(error);
      if (data !== true) throw new ValidationError('Nothing to call back.');
      await audit.record({
        action: 'cms.called_back',
        resourceType: 'cms_page',
        resourceId: null,
        companyId: null,
        metadata: { slug: input.slug },
      });
      return { done: true };
    }
    case 'revert': {
      const { data, error } = await admin.rpc('kd_cms_revert', {
        p_slug: input.slug,
        p_version_no: input.versionNo,
        p_author: actor.userId,
      });
      if (error) {
        if (error.code === 'P0002') throw new NotFoundError();
        if (error.code === '22023')
          throw new ValidationError('Call back or finish the unfinished version first.');
        throw new InternalError(error);
      }
      await audit.record({
        action: 'cms.reverted',
        resourceType: 'cms_page',
        resourceId: null,
        companyId: null,
        metadata: { slug: input.slug, to: input.versionNo },
      });
      return data;
    }
    case 'noindex': {
      const { data, error } = await admin
        .from('cms_pages')
        .update({ noindex: input.value })
        .eq('slug', input.slug)
        .is('deleted_at', null)
        .select('id');
      if (error) throw new InternalError(error);
      if (!data || data.length === 0) throw new NotFoundError();
      await audit.record({
        action: 'cms.noindex',
        resourceType: 'cms_page',
        resourceId: null,
        companyId: null,
        metadata: { slug: input.slug, value: input.value },
      });
      refresh(input.slug);
      return { done: true };
    }
  }
}

/** Applies decisions of the approval chain: approved versions go live (or are scheduled); the others return to draft. */
export async function syncApprovals(): Promise<number> {
  const admin = getAdminSupabase();
  const pending = await admin
    .from('cms_page_versions')
    .select('id, page_id, approval_request_id, publish_at')
    .eq('status', 'pending_approval')
    .is('deleted_at', null)
    .limit(100);
  if (pending.error) throw new InternalError(pending.error);
  let changed = 0;
  for (const v of pending.data ?? []) {
    if (!v.approval_request_id) continue;
    const state = await getService('approval')
      .status(String(v.approval_request_id))
      .catch(() => null);
    if (!state) continue;
    if (state.status === 'approved') {
      const at =
        v.publish_at && Date.parse(String(v.publish_at)) > Date.now() + 60_000
          ? String(v.publish_at)
          : null;
      const { data, error } = await admin.rpc('kd_cms_publish', {
        p_version: String(v.id),
        p_publish_at: at,
      });
      if (error) {
        log.error('approved version could not be published', { error });
        continue;
      }
      const page = await admin
        .from('cms_pages')
        .select('slug')
        .eq('id', String(v.page_id))
        .maybeSingle();
      if (page.data && data === 'published') refresh(String(page.data.slug));
      changed += 1;
    } else if (['rejected', 'expired', 'cancelled'].includes(state.status)) {
      await admin.rpc('kd_cms_to_draft', { p_version: String(v.id) });
      changed += 1;
    }
  }
  return changed;
}

/** Publishes scheduled versions that are due. */
export async function releaseDue(): Promise<number> {
  const { data, error } = await getAdminSupabase().rpc('kd_cms_release_due');
  if (error) throw new InternalError(error);
  const slugs = z.array(z.string()).parse(data ?? []);
  for (const slug of slugs) refresh(slug);
  return slugs.length;
}

export function assertPlatformEditor(actor: Actor): void {
  if (!['super_admin', 'ceo', 'admin_staff'].includes(actor.role)) throw new ForbiddenError();
}
