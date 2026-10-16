// path: config/nav/s06.ts
// Public site navigation. Top-level items with `parent` children open a mega-menu panel in the header and a column in
// the footer. Items are added with the pages they point to.
import type { NavItem } from '@/config/nav-types';

const pub = (
  id: string,
  labelKey: string,
  href: string,
  order: number,
  group: 'public-header' | 'public-footer',
  parent?: string,
): NavItem => ({
  id,
  labelKey,
  href,
  icon: 'globe',
  group,
  roles: 'any',
  order,
  ...(parent ? { parent } : {}),
});

export const nav: NavItem[] = [
  // Header
  pub('pub-product', 's06Public.nav.product', '/features', 10, 'public-header'),
  pub('pub-features', 's06Public.nav.features', '/features', 11, 'public-header', 'pub-product'),
  pub(
    'pub-industries',
    's06Public.nav.industries',
    '/industries',
    12,
    'public-header',
    'pub-product',
  ),
  pub('pub-security', 's06Public.nav.security', '/security', 13, 'public-header', 'pub-product'),
  pub('pub-pricing', 's06Public.nav.pricing', '/pricing', 20, 'public-header'),
  pub('pub-company', 's06Public.nav.company', '/about', 30, 'public-header'),
  pub('pub-about', 's06Public.nav.about', '/about', 31, 'public-header', 'pub-company'),
  pub('pub-careers', 's06Public.nav.careers', '/careers', 32, 'public-header', 'pub-company'),
  pub('pub-contact', 's06Public.nav.contact', '/contact', 33, 'public-header', 'pub-company'),
  // Footer
  pub('foot-product', 's06Public.footer.product', '/features', 10, 'public-footer'),
  pub('foot-features', 's06Public.nav.features', '/features', 11, 'public-footer', 'foot-product'),
  pub(
    'foot-industries',
    's06Public.nav.industries',
    '/industries',
    12,
    'public-footer',
    'foot-product',
  ),
  pub('foot-pricing', 's06Public.nav.pricing', '/pricing', 13, 'public-footer', 'foot-product'),
  pub('foot-security', 's06Public.nav.security', '/security', 14, 'public-footer', 'foot-product'),
  pub('foot-company', 's06Public.footer.company', '/about', 30, 'public-footer'),
  pub('foot-about', 's06Public.nav.about', '/about', 31, 'public-footer', 'foot-company'),
  pub('foot-careers', 's06Public.nav.careers', '/careers', 32, 'public-footer', 'foot-company'),
  pub('foot-contact', 's06Public.nav.contact', '/contact', 33, 'public-footer', 'foot-company'),
  {
    id: 'admin-cms',
    labelKey: 's06Public.cms.nav',
    href: '/admin/cms',
    icon: 'globe',
    group: 'admin',
    roles: ['super_admin', 'ceo', 'admin_staff'],
    order: 60,
  },
];
