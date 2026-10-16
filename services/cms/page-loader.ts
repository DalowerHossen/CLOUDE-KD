// path: services/cms/page-loader.ts
// Loads the content of a public page. 06.2: the built-in content; 06.3 puts the published version from the CMS first.
import 'server-only';
import { pageContentSchema, type Block } from '@/lib/cms/blocks';
import { DEFAULT_PAGES } from '@/lib/cms/defaults';

export interface LoadedPage {
  slug: string;
  title: string;
  description: string;
  blocks: Block[];
  source: 'default' | 'cms';
}

export async function loadPage(slug: string): Promise<LoadedPage | null> {
  const def = DEFAULT_PAGES[slug];
  if (!def) return null;
  return {
    slug,
    title: def.title,
    description: def.description,
    blocks: pageContentSchema.parse(def.blocks),
    source: 'default',
  };
}
