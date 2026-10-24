// path: services/seo/audit.ts
// SEO audit of the public site: titles, descriptions, headings, images, links and thin content, from the live
// content (stored versions or built-in text). Nothing is fetched from the network.
import 'server-only';
import { PRIVATE_PREFIXES, SEO_LIMITS } from '@/config/seo';
import type { Block } from '@/lib/cms/blocks';
import { getAdminSupabase } from '@/lib/supabase/admin';
import { plainText } from '@/lib/blog/text';
import { loadPage } from '@/services/cms/page-loader';
import { indexablePages } from './pages';

export type Severity = 'error' | 'warning' | 'info';
export interface AuditIssue {
  severity: Severity;
  path: string;
  code: string;
  message: string;
}
export interface AuditReport {
  score: number;
  pagesChecked: number;
  errors: number;
  warnings: number;
  issues: AuditIssue[];
  generatedAt: string;
}

const HEADLESS: ReadonlySet<Block['type']> = new Set(['image']);

function hrefsOf(value: unknown, out: string[]): void {
  if (Array.isArray(value)) for (const v of value) hrefsOf(v, out);
  else if (value && typeof value === 'object')
    for (const [k, v] of Object.entries(value)) {
      if (k === 'href' && typeof v === 'string') out.push(v);
      else hrefsOf(v, out);
    }
}

export async function runAudit(): Promise<AuditReport> {
  const pages = await indexablePages();
  const known = new Set(pages.map((p) => p.path));
  const issues: AuditIssue[] = [];
  const add = (severity: Severity, path: string, code: string, message: string): void => {
    issues.push({ severity, path, code, message });
  };
  const titles = new Map<string, string>();
  const descriptions = new Map<string, string>();
  const metaOf = (path: string, title: string, description: string): void => {
    if (title.length < SEO_LIMITS.titleMin)
      add('warning', path, 'title_short', `Title is short (${title.length} characters).`);
    if (title.length > SEO_LIMITS.titleMax)
      add(
        'warning',
        path,
        'title_long',
        `Title is long (${title.length} characters, ${SEO_LIMITS.titleMax} fit in search results).`,
      );
    if (description.length === 0)
      add('error', path, 'description_missing', 'There is no description.');
    else if (description.length < SEO_LIMITS.descriptionMin)
      add(
        'warning',
        path,
        'description_short',
        `Description is short (${description.length} characters).`,
      );
    else if (description.length > SEO_LIMITS.descriptionMax)
      add(
        'warning',
        path,
        'description_long',
        `Description is long (${description.length} characters, ${SEO_LIMITS.descriptionMax} fit in search results).`,
      );
    const t = title.toLowerCase();
    const d = description.toLowerCase();
    if (titles.has(t)) add('error', path, 'title_duplicate', `Same title as ${titles.get(t)}.`);
    else titles.set(t, path);
    if (d && descriptions.has(d))
      add('error', path, 'description_duplicate', `Same description as ${descriptions.get(d)}.`);
    else if (d) descriptions.set(d, path);
  };
  let checked = 0;
  for (const p of pages) {
    if (p.kind === 'blog' || p.kind === 'blog_index') continue;
    if (p.slug === 'legal') continue;
    const page = await loadPage(p.slug);
    if (!page) {
      add('error', p.path, 'page_missing', 'The page has no content.');
      continue;
    }
    checked += 1;
    metaOf(p.path, page.title, page.description);
    const first = page.blocks[0];
    if (!first || HEADLESS.has(first.type) || ('heading' in first && !first.heading))
      add(
        'error',
        p.path,
        'h1_missing',
        'The first block has no heading, so the page has no main heading.',
      );
    for (const b of page.blocks) {
      if (b.type === 'image' && !b.alt.trim())
        add('error', p.path, 'image_alt', 'An image has no description.');
    }
    const links: string[] = [];
    hrefsOf(page.blocks, links);
    for (const href of links) {
      if (!href.startsWith('/')) continue;
      const path = href.split(/[?#]/)[0] ?? href;
      if (
        known.has(path) ||
        PRIVATE_PREFIXES.some((x) => path === x || path.startsWith(`${x}/`) || path.startsWith(x))
      )
        continue;
      add('error', p.path, 'link_broken', `The link ${href} leads to no known page.`);
    }
  }
  const { data } = await getAdminSupabase()
    .from('blog_posts')
    .select(
      'slug, title, seo_title, seo_description, excerpt, body_text, body_html, cover_file_id, cover_alt',
    )
    .eq('status', 'published')
    .is('deleted_at', null)
    .limit(1000);
  for (const r of data ?? []) {
    const path = `/blog/${String(r.slug)}`;
    checked += 1;
    metaOf(path, String(r.seo_title || r.title), String(r.seo_description || r.excerpt || ''));
    if (r.cover_file_id && !String(r.cover_alt).trim())
      add('warning', path, 'cover_alt', 'The cover image has no description.');
    const words = plainText(String(r.body_html)).split(' ').filter(Boolean).length;
    if (words < 300) add('warning', path, 'thin_content', `The post is short (${words} words).`);
  }
  const errors = issues.filter((i) => i.severity === 'error').length;
  const warnings = issues.filter((i) => i.severity === 'warning').length;
  return {
    score: Math.max(0, 100 - errors * 10 - warnings * 3),
    pagesChecked: checked,
    errors,
    warnings,
    issues: issues.sort((a, b) =>
      a.severity === b.severity ? 0 : a.severity === 'error' ? -1 : 1,
    ),
    generatedAt: new Date().toISOString(),
  };
}
