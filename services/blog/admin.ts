// path: services/blog/admin.ts
// Blog management: posts with history, publish now or later, approval for content managers, authors, categories, tags.
import 'server-only';
import { revalidatePath } from 'next/cache';
import { sanitizeHtml } from '@/lib/security/rich-text';
import { getService } from '@/lib/container';
import {
  ConflictError,
  DuplicateError,
  ForbiddenError,
  InternalError,
  NotFoundError,
  ValidationError,
} from '@/lib/errors';
import { createLogger } from '@/lib/logger';
import { getAdminSupabase } from '@/lib/supabase/admin';
import { plainText, readMinutes } from '@/lib/blog/text';
import type { Actor } from '@/types/contracts';
import type { PostAction, PostSave, TaxonomySave } from './schemas';

const log = createLogger({ component: 'blog' });
const canPublishDirect = (actor: Actor): boolean =>
  actor.role === 'ceo' || actor.role === 'super_admin';

export function refreshBlog(slug?: string): void {
  try {
    revalidatePath('/blog');
    revalidatePath('/blog/rss.xml');
    revalidatePath('/sitemap.xml');
    if (slug) revalidatePath(`/blog/${slug}`);
  } catch (error) {
    log.warn('blog cache could not be refreshed', {
      error: error instanceof Error ? error.message : 'failed',
    });
  }
}

async function audit(
  action: string,
  id: string | null,
  metadata: Record<string, unknown>,
): Promise<void> {
  await getService('audit').record({
    action,
    resourceType: 'blog',
    resourceId: id,
    companyId: null,
    metadata,
  });
}

export interface PostRow {
  id: string;
  slug: string;
  title: string;
  excerpt: string;
  bodyHtml: string;
  coverFileId: string | null;
  coverAlt: string;
  authorId: string;
  categoryId: string | null;
  status: 'draft' | 'pending_approval' | 'scheduled' | 'published';
  publishAt: string | null;
  publishedAt: string | null;
  featured: boolean;
  seoTitle: string;
  seoDescription: string;
  viewCount: number;
  version: number;
  updatedAt: string;
}

const COLUMNS =
  'id, slug, title, excerpt, body_html, cover_file_id, cover_alt, author_id, category_id, status, publish_at, published_at, featured, seo_title, seo_description, view_count, version, updated_at';

function toRow(r: Record<string, unknown>): PostRow {
  return {
    id: String(r.id),
    slug: String(r.slug),
    title: String(r.title),
    excerpt: String(r.excerpt),
    bodyHtml: String(r.body_html),
    coverFileId: r.cover_file_id ? String(r.cover_file_id) : null,
    coverAlt: String(r.cover_alt),
    authorId: String(r.author_id),
    categoryId: r.category_id ? String(r.category_id) : null,
    status: String(r.status) as PostRow['status'],
    publishAt: r.publish_at ? String(r.publish_at) : null,
    publishedAt: r.published_at ? String(r.published_at) : null,
    featured: r.featured === true,
    seoTitle: String(r.seo_title),
    seoDescription: String(r.seo_description),
    viewCount: Number(r.view_count),
    version: Number(r.version),
    updatedAt: String(r.updated_at),
  };
}

export async function listPosts(): Promise<PostRow[]> {
  const { data, error } = await getAdminSupabase()
    .from('blog_posts')
    .select(COLUMNS)
    .is('deleted_at', null)
    .order('updated_at', { ascending: false })
    .limit(300);
  if (error) throw new InternalError(error);
  return (data ?? []).map((r) => toRow(r as Record<string, unknown>));
}

export interface Taxonomy {
  authors: {
    id: string;
    slug: string;
    name: string;
    bio: string;
    avatarFileId: string | null;
    version: number;
  }[];
  categories: { id: string; slug: string; name: string; description: string; version: number }[];
  tags: { id: string; slug: string; name: string; version: number }[];
}

export async function taxonomy(): Promise<Taxonomy> {
  const admin = getAdminSupabase();
  const [a, c, t] = await Promise.all([
    admin
      .from('blog_authors')
      .select('id, slug, name, bio, avatar_file_id, version')
      .is('deleted_at', null)
      .order('name'),
    admin
      .from('blog_categories')
      .select('id, slug, name, description, version')
      .is('deleted_at', null)
      .order('name'),
    admin.from('blog_tags').select('id, slug, name, version').is('deleted_at', null).order('name'),
  ]);
  for (const r of [a, c, t]) if (r.error) throw new InternalError(r.error);
  return {
    authors: (a.data ?? []).map((r) => ({
      id: String(r.id),
      slug: String(r.slug),
      name: String(r.name),
      bio: String(r.bio),
      avatarFileId: r.avatar_file_id ? String(r.avatar_file_id) : null,
      version: Number(r.version),
    })),
    categories: (c.data ?? []).map((r) => ({
      id: String(r.id),
      slug: String(r.slug),
      name: String(r.name),
      description: String(r.description),
      version: Number(r.version),
    })),
    tags: (t.data ?? []).map((r) => ({
      id: String(r.id),
      slug: String(r.slug),
      name: String(r.name),
      version: Number(r.version),
    })),
  };
}

export interface PostDetail {
  post: PostRow | null;
  tagIds: string[];
  history: { versionNo: number; title: string; createdAt: string }[];
  canPublishDirect: boolean;
}

export async function getPost(actor: Actor, id: string | null): Promise<PostDetail> {
  if (!id)
    return { post: null, tagIds: [], history: [], canPublishDirect: canPublishDirect(actor) };
  const admin = getAdminSupabase();
  const { data, error } = await admin
    .from('blog_posts')
    .select(COLUMNS)
    .eq('id', id)
    .is('deleted_at', null)
    .maybeSingle();
  if (error) throw new InternalError(error);
  if (!data) throw new NotFoundError();
  const [links, history] = await Promise.all([
    admin.from('blog_post_tags').select('tag_id').eq('post_id', id).is('deleted_at', null),
    admin
      .from('blog_post_versions')
      .select('version_no, title, created_at')
      .eq('post_id', id)
      .is('deleted_at', null)
      .order('version_no', { ascending: false })
      .limit(30),
  ]);
  if (links.error) throw new InternalError(links.error);
  if (history.error) throw new InternalError(history.error);
  return {
    post: toRow(data as Record<string, unknown>),
    tagIds: (links.data ?? []).map((l) => String(l.tag_id)),
    history: (history.data ?? []).map((h) => ({
      versionNo: Number(h.version_no),
      title: String(h.title),
      createdAt: String(h.created_at),
    })),
    canPublishDirect: canPublishDirect(actor),
  };
}

async function setTags(postId: string, tagIds: string[]): Promise<void> {
  const admin = getAdminSupabase();
  const current = await admin
    .from('blog_post_tags')
    .select('id, tag_id')
    .eq('post_id', postId)
    .is('deleted_at', null);
  if (current.error) throw new InternalError(current.error);
  const have = new Set((current.data ?? []).map((r) => String(r.tag_id)));
  const want = new Set(tagIds);
  const remove = (current.data ?? [])
    .filter((r) => !want.has(String(r.tag_id)))
    .map((r) => String(r.id));
  if (remove.length) {
    const r = await admin
      .from('blog_post_tags')
      .update({ deleted_at: new Date().toISOString() })
      .in('id', remove);
    if (r.error) throw new InternalError(r.error);
  }
  const add = tagIds.filter((t) => !have.has(t)).map((tag_id) => ({ post_id: postId, tag_id }));
  if (add.length) {
    const r = await admin.from('blog_post_tags').insert(add);
    if (r.error) throw new InternalError(r.error);
  }
}

function dbError(error: { code?: string; message: string }): never {
  if (error.code === '23505')
    throw new DuplicateError('This address is already used. Choose another.');
  if (error.code === '23503')
    throw new ValidationError('A chosen author, category or tag does not exist.');
  throw new InternalError(error);
}

export async function savePost(actor: Actor, input: PostSave): Promise<PostRow> {
  const admin = getAdminSupabase();
  const bodyHtml = sanitizeHtml(input.bodyHtml);
  const text = plainText(bodyHtml);
  const fields = {
    slug: input.slug,
    title: input.title,
    excerpt: input.excerpt || text.slice(0, 160),
    body_html: bodyHtml,
    body_text: text,
    cover_file_id: input.coverFileId,
    cover_alt: input.coverAlt,
    author_id: input.authorId,
    category_id: input.categoryId,
    featured: input.featured,
    seo_title: input.seoTitle,
    seo_description: input.seoDescription,
    read_minutes: readMinutes(text),
  };
  let row: PostRow;
  if (!input.id) {
    const { data, error } = await admin.from('blog_posts').insert(fields).select(COLUMNS).single();
    if (error) dbError(error);
    row = toRow(data as Record<string, unknown>);
  } else {
    const existing = await admin
      .from('blog_posts')
      .select('status, version')
      .eq('id', input.id)
      .is('deleted_at', null)
      .maybeSingle();
    if (existing.error) throw new InternalError(existing.error);
    if (!existing.data) throw new NotFoundError();
    const status = String(existing.data.status);
    if (status === 'pending_approval' || status === 'scheduled')
      throw new ValidationError('Call this post back to draft before you edit it.');
    if (status === 'published' && !canPublishDirect(actor)) throw new ForbiddenError();
    if (input.expectedVersion !== null && input.expectedVersion !== Number(existing.data.version))
      throw new ConflictError('Somebody else changed this post. Reload to see their changes.');
    const { data, error } = await admin
      .from('blog_posts')
      .update(fields)
      .eq('id', input.id)
      .eq('version', Number(existing.data.version))
      .select(COLUMNS)
      .maybeSingle();
    if (error) dbError(error);
    if (!data)
      throw new ConflictError('Somebody else changed this post. Reload to see their changes.');
    row = toRow(data as Record<string, unknown>);
  }
  await setTags(row.id, input.tagIds);
  await audit(input.id ? 'blog.post_saved' : 'blog.post_created', row.id, {
    slug: row.slug,
    by: actor.userId,
  });
  if (row.status === 'published') refreshBlog(row.slug);
  return row;
}

async function loadStatus(id: string): Promise<{ slug: string; status: string }> {
  const { data, error } = await getAdminSupabase()
    .from('blog_posts')
    .select('slug, status')
    .eq('id', id)
    .is('deleted_at', null)
    .maybeSingle();
  if (error) throw new InternalError(error);
  if (!data) throw new NotFoundError();
  return { slug: String(data.slug), status: String(data.status) };
}

export async function runPostAction(actor: Actor, input: PostAction): Promise<unknown> {
  const admin = getAdminSupabase();
  const post = await loadStatus(input.id);
  switch (input.action) {
    case 'publish': {
      if (post.status !== 'draft') throw new ValidationError('Only a draft can be published.');
      const at =
        input.publishAt && Date.parse(input.publishAt) > Date.now() + 60_000
          ? input.publishAt
          : null;
      if (canPublishDirect(actor)) {
        const update = at
          ? { status: 'scheduled', publish_at: at }
          : { status: 'published', published_at: new Date().toISOString(), publish_at: null };
        const r = await admin.from('blog_posts').update(update).eq('id', input.id);
        if (r.error) throw new InternalError(r.error);
        await audit(at ? 'blog.scheduled' : 'blog.published', input.id, { slug: post.slug, at });
        if (!at) refreshBlog(post.slug);
        return { result: at ? 'scheduled' : 'published' };
      }
      const state = await getService('approval').request({
        action: 'blog.publish',
        payload: { id: input.id, slug: post.slug, publishAt: at },
        requesterId: actor.userId,
        companyId: null,
      });
      const r = await admin
        .from('blog_posts')
        .update({
          status: 'pending_approval',
          approval_request_id: state.requestId,
          publish_at: at,
        })
        .eq('id', input.id);
      if (r.error) throw new InternalError(r.error);
      await audit('blog.publish_requested', input.id, {
        slug: post.slug,
        request: state.requestId,
      });
      return { result: 'pending_approval', requestId: state.requestId };
    }
    case 'cancel':
    case 'unpublish': {
      const allowed = input.action === 'cancel' ? ['pending_approval', 'scheduled'] : ['published'];
      if (!allowed.includes(post.status)) throw new ValidationError('Nothing to call back.');
      const r = await admin
        .from('blog_posts')
        .update({
          status: 'draft',
          publish_at: null,
          published_at: null,
          approval_request_id: null,
        })
        .eq('id', input.id);
      if (r.error) throw new InternalError(r.error);
      await audit(`blog.${input.action === 'cancel' ? 'called_back' : 'unpublished'}`, input.id, {
        slug: post.slug,
      });
      refreshBlog(post.slug);
      return { done: true };
    }
    case 'delete': {
      if (post.status === 'published' && !canPublishDirect(actor)) throw new ForbiddenError();
      const r = await admin
        .from('blog_posts')
        .update({ deleted_at: new Date().toISOString() })
        .eq('id', input.id);
      if (r.error) throw new InternalError(r.error);
      await audit('blog.deleted', input.id, { slug: post.slug });
      refreshBlog(post.slug);
      return { done: true };
    }
    case 'restore': {
      if (post.status !== 'draft') throw new ValidationError('Call the post back to draft first.');
      const v = await admin
        .from('blog_post_versions')
        .select('title, excerpt, body_html')
        .eq('post_id', input.id)
        .eq('version_no', input.versionNo)
        .maybeSingle();
      if (v.error) throw new InternalError(v.error);
      if (!v.data) throw new NotFoundError();
      const text = plainText(String(v.data.body_html));
      const r = await admin
        .from('blog_posts')
        .update({
          title: v.data.title,
          excerpt: v.data.excerpt,
          body_html: v.data.body_html,
          body_text: text,
          read_minutes: readMinutes(text),
        })
        .eq('id', input.id);
      if (r.error) throw new InternalError(r.error);
      await audit('blog.restored', input.id, { slug: post.slug, to: input.versionNo });
      return { done: true };
    }
  }
}

const TABLES = { author: 'blog_authors', category: 'blog_categories', tag: 'blog_tags' } as const;

export async function saveTaxonomy(input: TaxonomySave): Promise<void> {
  const admin = getAdminSupabase();
  const table = TABLES[input.kind];
  const { kind: _kind, id, ...rest } = input;
  const fields: Record<string, unknown> = { ...rest };
  if (input.kind === 'author') {
    delete fields.avatarFileId;
    fields.avatar_file_id = input.avatarFileId;
  }
  const r = id
    ? await admin.from(table).update(fields).eq('id', id).is('deleted_at', null)
    : await admin.from(table).insert(fields);
  if (r.error) dbError(r.error);
  await audit('blog.taxonomy_saved', id, { kind: input.kind, slug: input.slug });
  refreshBlog();
}

export async function deleteTaxonomy(kind: keyof typeof TABLES, id: string): Promise<void> {
  const admin = getAdminSupabase();
  if (kind !== 'tag') {
    const column = kind === 'author' ? 'author_id' : 'category_id';
    const used = await admin
      .from('blog_posts')
      .select('id')
      .eq(column, id)
      .is('deleted_at', null)
      .limit(1);
    if (used.error) throw new InternalError(used.error);
    if ((used.data ?? []).length > 0)
      throw new ValidationError('Posts still use this entry. Move them first.');
  } else {
    await admin
      .from('blog_post_tags')
      .update({ deleted_at: new Date().toISOString() })
      .eq('tag_id', id)
      .is('deleted_at', null);
  }
  const r = await admin
    .from(TABLES[kind])
    .update({ deleted_at: new Date().toISOString() })
    .eq('id', id)
    .is('deleted_at', null);
  if (r.error) throw new InternalError(r.error);
  await audit('blog.taxonomy_deleted', id, { kind });
  refreshBlog();
}

export async function syncBlogApprovals(): Promise<number> {
  const admin = getAdminSupabase();
  const pending = await admin
    .from('blog_posts')
    .select('id, slug, approval_request_id, publish_at')
    .eq('status', 'pending_approval')
    .is('deleted_at', null)
    .limit(100);
  if (pending.error) throw new InternalError(pending.error);
  let changed = 0;
  for (const p of pending.data ?? []) {
    if (!p.approval_request_id) continue;
    const state = await getService('approval')
      .status(String(p.approval_request_id))
      .catch(() => null);
    if (!state) continue;
    if (state.status === 'approved') {
      const later = p.publish_at && Date.parse(String(p.publish_at)) > Date.now() + 60_000;
      const r = await admin
        .from('blog_posts')
        .update(
          later
            ? { status: 'scheduled' }
            : { status: 'published', published_at: new Date().toISOString(), publish_at: null },
        )
        .eq('id', String(p.id));
      if (r.error) {
        log.error('approved post could not be published', { error: r.error });
        continue;
      }
      if (!later) refreshBlog(String(p.slug));
      changed += 1;
    } else if (['rejected', 'expired', 'cancelled'].includes(state.status)) {
      await admin
        .from('blog_posts')
        .update({ status: 'draft', publish_at: null, approval_request_id: null })
        .eq('id', String(p.id));
      changed += 1;
    }
  }
  return changed;
}

export async function releaseDueBlog(): Promise<number> {
  const { data, error } = await getAdminSupabase().rpc('kd_blog_release_due');
  if (error) throw new InternalError(error);
  const slugs = (data ?? []) as string[];
  for (const slug of slugs) refreshBlog(slug);
  return slugs.length;
}
