// path: services/blog/public.ts
// Reads of the public blog: lists, one post, related posts, archive months and the feed. Only published posts
// whose publish time has passed are ever returned.
import 'server-only';
import { InternalError } from '@/lib/errors';
import { getAdminSupabase } from '@/lib/supabase/admin';
import type { PublicListQuery } from './schemas';

export const PAGE_SIZE = 9;

export interface PostCard {
  slug: string;
  title: string;
  excerpt: string;
  coverFileId: string | null;
  coverAlt: string;
  publishedAt: string;
  readMinutes: number;
  authorName: string;
  categoryName: string | null;
  categorySlug: string | null;
  featured: boolean;
}

export interface PublicPost extends PostCard {
  id: string;
  bodyHtml: string;
  authorSlug: string;
  authorBio: string;
  authorAvatarFileId: string | null;
  seoTitle: string;
  seoDescription: string;
  updatedAt: string;
  tags: { slug: string; name: string }[];
  viewCount: number;
}

const CARD_COLUMNS =
  'id, slug, title, excerpt, cover_file_id, cover_alt, published_at, read_minutes, featured, category_id, author_id';

type Row = Record<string, unknown>;

async function lookups(): Promise<{
  authors: Map<string, Row>;
  categories: Map<string, Row>;
}> {
  const admin = getAdminSupabase();
  const [a, c] = await Promise.all([
    admin.from('blog_authors').select('id, slug, name, bio, avatar_file_id').is('deleted_at', null),
    admin.from('blog_categories').select('id, slug, name').is('deleted_at', null),
  ]);
  if (a.error) throw new InternalError(a.error);
  if (c.error) throw new InternalError(c.error);
  return {
    authors: new Map((a.data ?? []).map((r) => [String(r.id), r as Row])),
    categories: new Map((c.data ?? []).map((r) => [String(r.id), r as Row])),
  };
}

function toCard(r: Row, authors: Map<string, Row>, categories: Map<string, Row>): PostCard {
  const category = r.category_id ? categories.get(String(r.category_id)) : undefined;
  return {
    slug: String(r.slug),
    title: String(r.title),
    excerpt: String(r.excerpt ?? ''),
    coverFileId: r.cover_file_id ? String(r.cover_file_id) : null,
    coverAlt: String(r.cover_alt ?? ''),
    publishedAt: String(r.published_at),
    readMinutes: Number(r.read_minutes),
    authorName: String(authors.get(String(r.author_id))?.name ?? ''),
    categoryName: category ? String(category.name) : null,
    categorySlug: category ? String(category.slug) : null,
    featured: r.featured === true,
  };
}

export async function listPublished(
  query: PublicListQuery,
): Promise<{ posts: PostCard[]; total: number; pages: number; featured: PostCard | null }> {
  const { authors, categories } = await lookups();
  let q = getAdminSupabase()
    .from('blog_posts')
    .select(CARD_COLUMNS, { count: 'exact' })
    .eq('status', 'published')
    .lte('published_at', new Date().toISOString())
    .is('deleted_at', null);
  if (query.category) {
    const id = [...categories.values()].find((c) => c.slug === query.category)?.id;
    if (!id) return { posts: [], total: 0, pages: 0, featured: null };
    q = q.eq('category_id', String(id));
  }
  if (query.tag) {
    const tag = await getAdminSupabase()
      .from('blog_tags')
      .select('id')
      .eq('slug', query.tag)
      .is('deleted_at', null)
      .maybeSingle();
    if (tag.error) throw new InternalError(tag.error);
    if (!tag.data) return { posts: [], total: 0, pages: 0, featured: null };
    const links = await getAdminSupabase()
      .from('blog_post_tags')
      .select('post_id')
      .eq('tag_id', String(tag.data.id))
      .is('deleted_at', null);
    if (links.error) throw new InternalError(links.error);
    const ids = (links.data ?? []).map((l) => String(l.post_id));
    if (ids.length === 0) return { posts: [], total: 0, pages: 0, featured: null };
    q = q.in('id', ids);
  }
  if (query.month) {
    const [y, m] = query.month.split('-').map(Number) as [number, number];
    q = q
      .gte('published_at', new Date(Date.UTC(y, m - 1, 1)).toISOString())
      .lt('published_at', new Date(Date.UTC(y, m, 1)).toISOString());
  }
  if (query.q) q = q.textSearch('search', query.q, { type: 'websearch', config: 'english' });
  const from = (query.page - 1) * PAGE_SIZE;
  const { data, count, error } = await q
    .order('published_at', { ascending: false })
    .range(from, from + PAGE_SIZE - 1);
  if (error) throw new InternalError(error);
  const total = count ?? 0;
  const posts = (data ?? []).map((r) => toCard(r as Row, authors, categories));
  const plain = !query.category && !query.tag && !query.q && !query.month && query.page === 1;
  const featured = plain ? (posts.find((p) => p.featured) ?? null) : null;
  return {
    posts: featured ? posts.filter((p) => p !== featured) : posts,
    total,
    pages: Math.ceil(total / PAGE_SIZE),
    featured,
  };
}

export async function getPublishedPost(slug: string): Promise<PublicPost | null> {
  const admin = getAdminSupabase();
  const { data, error } = await admin
    .from('blog_posts')
    .select(`${CARD_COLUMNS}, body_html, seo_title, seo_description, updated_at, view_count`)
    .eq('slug', slug)
    .eq('status', 'published')
    .lte('published_at', new Date().toISOString())
    .is('deleted_at', null)
    .maybeSingle();
  if (error) throw new InternalError(error);
  if (!data) return null;
  const { authors, categories } = await lookups();
  const row = data as Row;
  const links = await admin
    .from('blog_post_tags')
    .select('tag_id')
    .eq('post_id', String(row.id))
    .is('deleted_at', null);
  if (links.error) throw new InternalError(links.error);
  const tagIds = (links.data ?? []).map((l) => String(l.tag_id));
  const tags = tagIds.length
    ? await admin.from('blog_tags').select('slug, name').in('id', tagIds).is('deleted_at', null)
    : { data: [], error: null };
  if (tags.error) throw new InternalError(tags.error);
  const author = authors.get(String(row.author_id));
  return {
    ...toCard(row, authors, categories),
    id: String(row.id),
    bodyHtml: String(row.body_html),
    authorSlug: String(author?.slug ?? ''),
    authorBio: String(author?.bio ?? ''),
    authorAvatarFileId: author?.avatar_file_id ? String(author.avatar_file_id) : null,
    seoTitle: String(row.seo_title ?? ''),
    seoDescription: String(row.seo_description ?? ''),
    updatedAt: String(row.updated_at),
    tags: (tags.data ?? []).map((t) => ({ slug: String(t.slug), name: String(t.name) })),
    viewCount: Number(row.view_count),
  };
}

/** Up to three posts that share the category or the most tags with the given post. */
export async function relatedPosts(post: PublicPost): Promise<PostCard[]> {
  const admin = getAdminSupabase();
  const { authors, categories } = await lookups();
  const score = new Map<string, number>();
  if (post.tags.length > 0) {
    const tagRows = await admin
      .from('blog_tags')
      .select('id')
      .in(
        'slug',
        post.tags.map((t) => t.slug),
      )
      .is('deleted_at', null);
    if (tagRows.error) throw new InternalError(tagRows.error);
    const links = await admin
      .from('blog_post_tags')
      .select('post_id')
      .in(
        'tag_id',
        (tagRows.data ?? []).map((t) => String(t.id)),
      )
      .is('deleted_at', null);
    if (links.error) throw new InternalError(links.error);
    for (const l of links.data ?? []) {
      const id = String(l.post_id);
      score.set(id, (score.get(id) ?? 0) + 2);
    }
  }
  const { data, error } = await getAdminSupabase()
    .from('blog_posts')
    .select(CARD_COLUMNS)
    .eq('status', 'published')
    .lte('published_at', new Date().toISOString())
    .is('deleted_at', null)
    .order('published_at', { ascending: false })
    .limit(60);
  if (error) throw new InternalError(error);
  return (data ?? [])
    .map((r) => r as Row)
    .filter((r) => String(r.id) !== post.id)
    .map((r) => ({
      r,
      points:
        (score.get(String(r.id)) ?? 0) +
        (post.categorySlug && categories.get(String(r.category_id))?.slug === post.categorySlug
          ? 1
          : 0),
    }))
    .filter((x) => x.points > 0)
    .sort((a, b) => b.points - a.points)
    .slice(0, 3)
    .map((x) => toCard(x.r, authors, categories));
}

export async function archiveMonths(): Promise<{ month: string; count: number }[]> {
  const { data, error } = await getAdminSupabase()
    .from('blog_posts')
    .select('published_at')
    .eq('status', 'published')
    .lte('published_at', new Date().toISOString())
    .is('deleted_at', null)
    .order('published_at', { ascending: false })
    .limit(1000);
  if (error) throw new InternalError(error);
  const counts = new Map<string, number>();
  for (const r of data ?? []) {
    const month = String(r.published_at).slice(0, 7);
    counts.set(month, (counts.get(month) ?? 0) + 1);
  }
  return [...counts.entries()].map(([month, count]) => ({ month, count }));
}

export async function categoryList(): Promise<
  { slug: string; name: string; description: string }[]
> {
  const { data, error } = await getAdminSupabase()
    .from('blog_categories')
    .select('slug, name, description')
    .is('deleted_at', null)
    .order('name');
  if (error) throw new InternalError(error);
  return (data ?? []).map((c) => ({
    slug: String(c.slug),
    name: String(c.name),
    description: String(c.description ?? ''),
  }));
}

export async function feedPosts(): Promise<PostCard[]> {
  const { authors, categories } = await lookups();
  const { data, error } = await getAdminSupabase()
    .from('blog_posts')
    .select(CARD_COLUMNS)
    .eq('status', 'published')
    .lte('published_at', new Date().toISOString())
    .is('deleted_at', null)
    .order('published_at', { ascending: false })
    .limit(30);
  if (error) throw new InternalError(error);
  return (data ?? []).map((r) => toCard(r as Row, authors, categories));
}

/** All published slugs with their last change, for the sitemap. */
export async function publishedSlugs(): Promise<{ slug: string; updatedAt: string }[]> {
  const { data, error } = await getAdminSupabase()
    .from('blog_posts')
    .select('slug, updated_at')
    .eq('status', 'published')
    .lte('published_at', new Date().toISOString())
    .is('deleted_at', null)
    .limit(5000);
  if (error) throw new InternalError(error);
  return (data ?? []).map((r) => ({ slug: String(r.slug), updatedAt: String(r.updated_at) }));
}

export async function countView(slug: string): Promise<void> {
  const { error } = await getAdminSupabase().rpc('kd_blog_view', { p_slug: slug });
  if (error) throw new InternalError(error);
}
