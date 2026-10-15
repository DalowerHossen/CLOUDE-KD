// path: config/nav-types.ts
import type { EntitlementKey } from '@/config/plans';
import type { Role } from '@/types/contracts/common';

export type NavGroup = 'dashboard' | 'admin' | 'account' | 'public-header' | 'public-footer' | 'portal';

/** Icon names resolved by components/layout/icon-map.tsx (Lucide icons only). */
export type NavIcon =
  | 'home'
  | 'file-text'
  | 'users'
  | 'credit-card'
  | 'package'
  | 'truck'
  | 'receipt'
  | 'calculator'
  | 'briefcase'
  | 'bar-chart'
  | 'repeat'
  | 'wallet'
  | 'settings'
  | 'bell'
  | 'life-buoy'
  | 'shield'
  | 'key'
  | 'globe'
  | 'book-open'
  | 'mail'
  | 'check-square'
  | 'alert-triangle'
  | 'activity'
  | 'layers'
  | 'link'
  | 'user'
  | 'building'
  | 'tag'
  | 'plug'
  | 'message-circle'
  | 'share'
  | 'clipboard'
  | 'server'
  | 'search';

export interface NavItem {
  /** Unique id, for example "invoices". */
  id: string;
  /** Path of the i18n string, for example "s01Core.nav.dashboard". */
  labelKey: string;
  /** Internal path starting with "/". */
  href: string;
  icon: NavIcon;
  group: NavGroup;
  /** Roles that see the item, or "any". */
  roles: readonly Role[] | 'any';
  order: number;
  /** Id of the parent item for nested menus. */
  parent?: string;
  /** Item is hidden unless the plan has this entitlement. */
  requiresEntitlement?: EntitlementKey;
  /** Item appears in the mobile bottom navigation (at most five per group). */
  bottomNav?: boolean;
}
