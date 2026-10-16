// path: services/cms/page-loader.ts
// Loads the content of a public page: the live version stored by the CMS, else the built-in content. A problem with
// the database or with stored content never takes a page down: the built-in content is shown and the problem is logged.
import 'server-only';
import { pageContentSchema, type Block } from '@/lib/cms/blocks';
import { defaultPage } from '@/lib/cms/defaults';
import { createLogger } from '@/lib/logger';
import { getAdminSupabase } from '@/lib/supabase/admin';
import { approvedTestimonials, decidedVariant } from '@/services/marketing/admin';

const log = createLogger({ component: 'cms-loader' });

export interface LoadedPage {
  slug: string;
  title: string;
  description: string;
  blocks: Block[];
  source: 'default' | 'cms';
  noindex: boolean;
  updatedAt: string | null;
  /** Number of the stored version; null for built-in content. */
  versionNo: number | null;
}

export async function loadStoredPage(slug: string): Promise<LoadedPage | null> {
  const admin = getAdminSupabase();
  const page = await admin
    .from('cms_pages')
    .select('id, live_version_id, noindex')
    .eq('slug', slug)
    .is('deleted_at', null)
    .maybeSingle();
  if (page.error) throw page.error;
  if (!page.data?.live_version_id) return null;
  const version = await admin
    .from('cms_page_versions')
    .select('title, description, blocks, published_at, version_no')
    .eq('id', String(page.data.live_version_id))
    .eq('status', 'published')
    .is('deleted_at', null)
    .maybeSingle();
  if (version.error) throw version.error;
  if (!version.data) return null;
  const blocks = pageContentSchema.safeParse(version.data.blocks);
  if (!blocks.success) {
    log.error('stored page content is not valid; built-in content is shown', { slug });
    return null;
  }
  return {
    slug,
    title: String(version.data.title),
    description: String(version.data.description),
    blocks: blocks.data,
    source: 'cms',
    noindex: page.data.noindex === true,
    updatedAt: version.data.published_at ? String(version.data.published_at) : null,
    versionNo: Number(version.data.version_no),
  };
}

/**
 * Fills blocks that take their content from other places: a testimonials block without items shows the approved
 * testimonials, and a hero block of a finished experiment shows the winning text. A problem leaves the block as it is.
 */
async function withDynamicBlocks(page: LoadedPage): Promise<LoadedPage> {
  let testimonials: Awaited<ReturnType<typeof approvedTestimonials>> | null = null;
  const blocks: Block[] = [];
  for (const b of page.blocks) {
    try {
      if (b.type === 'testimonials' && b.items.length === 0) {
        testimonials = testimonials ?? (await approvedTestimonials());
        blocks.push({ ...b, items: testimonials });
        continue;
      }
      if (b.type === 'hero' && b.experiment) {
        const winner = await decidedVariant(b.experiment);
        if (winner) {
          const { experiment: _done, ...rest } = b;
          blocks.push({
            ...rest,
            ...(winner.heading ? { heading: winner.heading } : {}),
            ...(winner.subheading ? { subheading: winner.subheading } : {}),
            ...(winner.ctaLabel && b.primaryCta
              ? { primaryCta: { ...b.primaryCta, label: winner.ctaLabel } }
              : {}),
          });
          continue;
        }
      }
    } catch (error) {
      log.warn('dynamic block content could not be read', {
        slug: page.slug,
        error: error instanceof Error ? error.message : 'failed',
      });
    }
    blocks.push(b);
  }
  return { ...page, blocks };
}

export async function loadPage(slug: string): Promise<LoadedPage | null> {
  try {
    const stored = await loadStoredPage(slug);
    if (stored) return withDynamicBlocks(stored);
  } catch (error) {
    log.error('stored page could not be read; built-in content is shown', { slug, error });
  }
  const def = defaultPage(slug);
  if (!def) return null;
  return withDynamicBlocks({
    slug,
    title: def.title,
    description: def.description,
    blocks: pageContentSchema.parse(def.blocks),
    source: 'default',
    noindex: false,
    updatedAt: null,
    versionNo: null,
  });
}
