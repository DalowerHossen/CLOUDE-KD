// path: lib/team/presets.ts
// Permission presets for staff and the permission matrix. Pure functions; safe to import in the browser.
// A preset names whole areas ("invoice.*"); it is expanded into the exact actions that exist today and may be given to
// staff, so a preset never contains an action the owner is not allowed to hand out.
import type { PermissionDefinition } from '@/types/contracts';

export interface StaffPreset {
  key: string;
  label: string;
  summary: string;
  /** Areas (first part of an action) or exact actions. A trailing ".read" entry means read actions only. */
  areas: readonly string[];
}

export const STAFF_PRESETS: readonly StaffPreset[] = [
  {
    key: 'sales',
    label: 'Sales',
    summary: 'Invoices, estimates and clients',
    areas: ['invoice', 'estimate', 'client'],
  },
  {
    key: 'accounts',
    label: 'Accounts',
    summary: 'Payments, reports and accounting',
    areas: ['payment', 'report', 'accounting'],
  },
  {
    key: 'support',
    label: 'Support',
    summary: 'Tickets and client communication',
    areas: ['ticket', 'client.read'],
  },
  {
    key: 'manager',
    label: 'Manager',
    summary: 'Everything except settings, billing and team',
    areas: ['*'],
  },
  { key: 'viewer', label: 'Viewer', summary: 'Read-only access', areas: ['*.read'] },
];

/** Areas a manager never gets, even with the "everything" preset. */
const MANAGER_EXCLUDED = new Set([
  'company',
  'team',
  'billing',
  'subscription',
  'roles',
  'flags',
  'storage',
  'email',
  'kyc',
  'domain',
]);

/** Definitions an owner may hand to staff (the action lists staff among its default roles). */
export function grantable(definitions: readonly PermissionDefinition[]): PermissionDefinition[] {
  return definitions.filter((d) => d.defaultRoles.includes('staff'));
}

export function domainOf(action: string): string {
  return action.split('.')[0] ?? '';
}

/** The exact actions a preset stands for, given the registered permissions. */
export function expandPreset(key: string, definitions: readonly PermissionDefinition[]): string[] {
  const preset = STAFF_PRESETS.find((p) => p.key === key);
  if (!preset) return [];
  const pool = grantable(definitions);
  const out = new Set<string>();
  for (const area of preset.areas) {
    for (const d of pool) {
      const domain = domainOf(d.action);
      if (area === '*') {
        if (!MANAGER_EXCLUDED.has(domain)) out.add(d.action);
      } else if (area === '*.read') {
        if (d.action.endsWith('.read')) out.add(d.action);
      } else if (area.includes('.') ? d.action === area : domain === area) {
        out.add(d.action);
      }
    }
  }
  return [...out].sort();
}

export interface MatrixRow {
  domain: string;
  actions: { action: string; description: string }[];
}

/** Grantable actions grouped by area, for the permission editor. */
export function matrix(definitions: readonly PermissionDefinition[]): MatrixRow[] {
  const rows = new Map<string, MatrixRow>();
  for (const d of grantable(definitions)) {
    const domain = domainOf(d.action);
    const row = rows.get(domain) ?? { domain, actions: [] };
    row.actions.push({ action: d.action, description: d.description });
    rows.set(domain, row);
  }
  return [...rows.values()].sort((a, b) => (a.domain < b.domain ? -1 : 1));
}
