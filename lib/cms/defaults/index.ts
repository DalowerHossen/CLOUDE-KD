// path: lib/cms/defaults/index.ts
// Built-in content of the core pages. The CMS (services/cms) can store edited versions that win over these.
import type { PageDefinition } from '../blocks';
import { about } from './about';
import { careers } from './careers';
import { contact } from './contact';
import { features } from './features';
import { home } from './home';
import { industries } from './industries';
import { pricing } from './pricing';
import { security } from './security';

export const DEFAULT_PAGES: Readonly<Record<string, PageDefinition>> = {
  home,
  features,
  industries,
  pricing,
  about,
  contact,
  careers,
  security,
};

/** URL path of a page slug ("home" is the front page). */
export const pathOf = (slug: string): string => (slug === 'home' ? '/' : `/${slug}`);
