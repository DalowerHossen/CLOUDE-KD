// path: lib/company/presets.ts
// Industry presets: starting values for the invoice section and a short list of what the industry usually needs.
// The chosen industry is stored in the profile section; other STEPs read it to pick tax rates, chart of accounts,
// templates and dashboard widgets (they own those lists). Safe to import in the browser.
import type { Industry, SectionValue } from './sections';

export interface IndustryPreset {
  key: Industry;
  label: string;
  summary: string;
  /** Short hints shown in the wizard. */
  focus: readonly string[];
  invoice: Pick<SectionValue<'invoice'>, 'dueDays' | 'terms' | 'notes'>;
}

export const PRESETS: Readonly<Record<Industry, IndustryPreset>> = {
  service: {
    key: 'service',
    label: 'Service business',
    summary: 'Bill by the hour or by the project.',
    focus: ['Hourly billing', 'Projects', 'Recurring invoices'],
    invoice: {
      dueDays: 30,
      terms: 'Payment is due within 30 days of the invoice date.',
      notes: 'Thank you for your business.',
    },
  },
  retail: {
    key: 'retail',
    label: 'Retail',
    summary: 'Sell products and keep stock in view.',
    focus: ['Product catalog', 'Inventory', 'Suppliers'],
    invoice: {
      dueDays: 15,
      terms: 'Payment is due within 15 days of the invoice date.',
      notes: 'Goods remain our property until paid in full.',
    },
  },
  medical: {
    key: 'medical',
    label: 'Medical practice',
    summary: 'Bill patients with extra care for private data.',
    focus: ['Patient billing', 'Privacy-first settings', 'Statements'],
    invoice: {
      dueDays: 30,
      terms: 'Payment is due within 30 days of the statement date.',
      notes: 'Questions about this bill? Contact our billing desk.',
    },
  },
  freelance: {
    key: 'freelance',
    label: 'Freelancer',
    summary: 'Minimal setup and a quick first invoice.',
    focus: ['Quick invoices', 'Simple client list', 'Payment links'],
    invoice: {
      dueDays: 14,
      terms: 'Payment is due within 14 days of the invoice date.',
      notes: 'Thank you for working with me.',
    },
  },
  agency: {
    key: 'agency',
    label: 'Agency',
    summary: 'Teams, clients, projects and retainers.',
    focus: ['Team seats', 'Projects', 'Retainers'],
    invoice: {
      dueDays: 30,
      terms: 'Payment is due within 30 days of the invoice date. Retainers are billed in advance.',
      notes: 'Thank you for choosing us.',
    },
  },
  ecommerce: {
    key: 'ecommerce',
    label: 'E-commerce',
    summary: 'Online orders, products and fast payments.',
    focus: ['Product catalog', 'Payment links', 'Order imports'],
    invoice: {
      dueDays: 7,
      terms: 'Payment is due within 7 days of the invoice date.',
      notes: 'Thank you for your order.',
    },
  },
};

export const INDUSTRY_LIST: readonly IndustryPreset[] = Object.values(PRESETS);
