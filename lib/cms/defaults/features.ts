// path: lib/cms/defaults/features.ts
import type { PageDefinition } from '../blocks';

export const features: PageDefinition = {
  slug: 'features',
  title: 'Features for invoicing, payments and accounting',
  description:
    'See what KD SOLUTION IT offers: invoices, estimates, online payments, payroll, accounting, reports, client links and strong security.',
  blocks: [
    {
      id: 'hero',
      type: 'hero',
      eyebrow: 'Features',
      heading: 'One workspace for the whole money cycle',
      subheading:
        'From the first estimate to the closed month, every step is connected, so you enter things once.',
      primaryCta: { label: 'Start free', href: '/signup' },
    },
    {
      id: 'columns',
      type: 'columns',
      heading: 'What you can do',
      items: [
        {
          title: 'Bill your clients',
          text: 'Professional documents that get read and paid.',
          bullets: [
            'Invoices, estimates and credit notes',
            'Your logo, colors and wording',
            'Secure client links, no client account needed',
            'Reminders for late invoices',
          ],
        },
        {
          title: 'Get paid',
          text: 'Make paying easy for the people you bill.',
          bullets: [
            'Card and local payment methods through licensed partners',
            'Payments matched to invoices automatically',
            'Partial payments and refunds',
            'A full payment history',
          ],
        },
        {
          title: 'Pay your team',
          text: 'Payroll without spreadsheets.',
          bullets: [
            'Employee records and pay runs',
            'Payslips stored securely',
            'Approval before a pay run is paid',
            'Payroll cost reports',
          ],
        },
        {
          title: 'Keep the books',
          text: 'Accounting that follows your activity.',
          bullets: [
            'A ledger fed by invoices, payments and expenses',
            'Taxes calculated for you',
            'Profit and loss, balance sheet and cash flow',
            'Closed periods that stay closed',
          ],
        },
      ],
    },
    {
      id: 'more',
      type: 'features',
      heading: 'Made for daily work',
      items: [
        {
          icon: 'repeat',
          title: 'Recurring billing',
          text: 'Schedule invoices that send themselves.',
        },
        {
          icon: 'bell',
          title: 'Notifications',
          text: 'Hear about payments, views and late invoices in the app or by e-mail.',
        },
        {
          icon: 'mail',
          title: 'E-mail your way',
          text: 'Send from the platform or from your own mail provider, with your own wording.',
        },
        {
          icon: 'cloud',
          title: 'Your files, your Drive',
          text: 'Link your Google Drive and keep documents in your own space, encrypted.',
        },
        {
          icon: 'plug',
          title: 'Integrations',
          text: 'Connect your tools through an API and webhooks on higher plans.',
        },
        {
          icon: 'life-buoy',
          title: 'Help when you need it',
          text: 'A help center, guides and a support team that answers.',
        },
      ],
    },
    {
      id: 'cta',
      type: 'cta',
      heading: 'See it for yourself',
      text: 'Create a free account and send your first invoice today.',
      button: { label: 'Start free', href: '/signup' },
      secondary: { label: 'View pricing', href: '/pricing' },
    },
  ],
};
