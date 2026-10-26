// path: lib/cms/pricing.ts
// The plan table on the public pricing page, built from the plan catalogue (config/plans.ts), which is also what the
// entitlement service enforces. What a plan includes on the page is therefore what a customer actually gets.
import {
  PLANS,
  PLAN_KEYS,
  type EntitlementKey,
  type EntitlementValue,
  type PlanKey,
} from '@/config/plans';

interface Row {
  key: EntitlementKey;
  label: string;
  format?: (value: number) => string;
}

export const PRICING_ROWS: readonly Row[] = [
  { key: 'invoices.monthly', label: 'Invoices per month' },
  { key: 'clients.max', label: 'Clients' },
  { key: 'staff.seats', label: 'Team members' },
  { key: 'storage.gigabytes', label: 'File storage', format: (n) => `${n} GB` },
  { key: 'emails.monthly', label: 'E-mails per month' },
  { key: 'api.requests_monthly', label: 'API calls per month' },
  { key: 'token.expiry_days', label: 'Client link validity', format: (n) => `up to ${n} days` },
  { key: 'recurring.enabled', label: 'Recurring invoices' },
  { key: 'projects.enabled', label: 'Projects and time tracking' },
  { key: 'inventory.enabled', label: 'Inventory' },
  { key: 'payroll.enabled', label: 'Payroll' },
  { key: 'accounting.enabled', label: 'Accounting' },
  { key: 'reports.advanced', label: 'Advanced reports' },
  { key: 'api.access', label: 'API access' },
  { key: 'webhooks.outgoing', label: 'Outgoing webhooks' },
  { key: 'whatsapp.automation', label: 'WhatsApp messages' },
  { key: 'social.automation', label: 'Social posting' },
  { key: 'branding.white_label', label: 'White-label branding' },
  { key: 'domain.custom', label: 'Custom domain' },
  { key: 'display.multi_currency', label: 'Display in other currencies' },
  { key: 'support.priority', label: 'Priority support' },
  { key: 'sso.ready', label: 'Single sign-on ready' },
];

export function formatEntitlement(row: Row, value: EntitlementValue | undefined): string {
  if (value === undefined || value === false) return 'Not included';
  if (value === true) return 'Included';
  if (value === null) return 'Unlimited';
  return row.format ? row.format(value) : String(value);
}

export interface PricingColumn {
  key: PlanKey;
  label: string;
  cells: { label: string; value: string; included: boolean }[];
}

export function pricingColumns(): PricingColumn[] {
  return PLAN_KEYS.map((key) => {
    const plan = PLANS[key];
    return {
      key,
      label: plan.label,
      cells: PRICING_ROWS.map((row) => {
        const value = plan.entitlements[row.key];
        return {
          label: row.label,
          value: formatEntitlement(row, value),
          included: value !== false && value !== undefined,
        };
      }),
    };
  });
}
