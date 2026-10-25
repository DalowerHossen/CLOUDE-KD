// path: components/layout/nav-utils.ts
import type { NavGroup, NavItem } from '@/config/nav-types';
import type { Role } from '@/types/contracts/common';
import { t, type StringKey } from '@/lib/i18n';

/** Items of a group that the role may see, ordered. Hidden items are not rendered at all. */
export function visibleNavItems(
  items: readonly NavItem[],
  group: NavGroup,
  role: Role | null,
): NavItem[] {
  return items
    .filter(
      (item) =>
        item.group === group &&
        (item.roles === 'any' || (role !== null && item.roles.includes(role))),
    )
    .sort((a, b) => a.order - b.order || a.id.localeCompare(b.id));
}

/** Keeps the short menu: only the items whose id is listed. Roles of the platform team always see everything. */
export function essentialNavItems(
  items: readonly NavItem[],
  ids: readonly string[],
  role: Role | null,
): NavItem[] {
  if (role !== 'owner' && role !== 'staff') return [...items];
  return items.filter((item) => ids.includes(item.id));
}

export function isActivePath(pathname: string, href: string): boolean {
  if (href === '/') return pathname === '/';
  return pathname === href || pathname.startsWith(`${href}/`);
}

export interface Crumb {
  label: string;
  href: string | null;
}

const ID_SEGMENT =
  /^([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}|\d+|[A-Za-z0-9_-]{20,})$/i;

function humanize(segment: string): string {
  const text = segment.replace(/[-_]+/g, ' ').trim();
  return text.length === 0 ? text : `${text.charAt(0).toUpperCase()}${text.slice(1)}`;
}

/** Breadcrumbs from the navigation map. Unknown segments are humanized; identifiers become "Details". */
export function buildBreadcrumbs(pathname: string, items: readonly NavItem[]): Crumb[] {
  const segments = pathname.split('/').filter(Boolean);
  const crumbs: Crumb[] = [{ label: t('s01Core.nav.home'), href: '/' }];
  let current = '';
  segments.forEach((segment, index) => {
    current += `/${segment}`;
    const match = items.find((item) => item.href === current);
    const last = index === segments.length - 1;
    const label = match
      ? t(match.labelKey as StringKey)
      : ID_SEGMENT.test(segment)
        ? t('s01Core.nav.details')
        : humanize(segment);
    // Only segments that are known pages become links; other segments are plain text.
    crumbs.push({ label, href: !last && match ? current : null });
  });
  return crumbs;
}
