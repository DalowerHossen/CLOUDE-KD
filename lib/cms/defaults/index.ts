// path: lib/cms/defaults/index.ts
// Built-in content of the core pages. The CMS (services/cms) can store edited versions that win over these.
import type { PageDefinition } from '../blocks';
import { about } from './about';
import { careers } from './careers';
import { contact } from './contact';
import { features } from './features';
import { home } from './home';
import { HELP_PAGES } from './help';
import { industries } from './industries';
import { LEGAL_PAGES } from './legal';
import { pricing } from './pricing';
import { security } from './security';
import { changelog, faq, roadmap } from './support';

export const DEFAULT_PAGES: Readonly<Record<string, PageDefinition>> = {
  home,
  features,
  industries,
  pricing,
  about,
  contact,
  careers,
  security,
  faq,
  roadmap,
  changelog,
};

/** URL path of a page slug ("home" is the front page). */
export const pathOf = (slug: string): string => (slug === 'home' ? '/' : `/${slug}`);

export { LEGAL_PAGES, LEGAL_EFFECTIVE } from './legal';
export { HELP_PAGES, HELP_CATEGORIES } from './help';

/** Built-in content of any page, core or legal. */
export const defaultPage = (slug: string): PageDefinition | undefined =>
  DEFAULT_PAGES[slug] ?? LEGAL_PAGES[slug] ?? HELP_PAGES[slug];
