// path: lib/cms/defaults/industries.ts
import type { PageDefinition } from '../blocks';

export const industries: PageDefinition = {
  slug: 'industries',
  title: 'Solutions for freelancers, agencies and shops',
  description:
    'Whether you work alone, run an agency or sell products, KD SOLUTION IT gives you the invoicing and accounting tools that fit your way of working.',
  blocks: [
    {
      id: 'hero',
      type: 'hero',
      eyebrow: 'Industries',
      heading: 'Built around how you work',
      subheading:
        'The same secure platform, set up for the way different businesses bill and get paid.',
      primaryCta: { label: 'Start free', href: '/signup' },
    },
    {
      id: 'columns',
      type: 'columns',
      heading: 'Who uses it',
      items: [
        {
          title: 'Freelancers and consultants',
          text: 'Look professional from the first invoice.',
          bullets: [
            'Quick invoices and estimates',
            'Hourly and fixed-price billing',
            'Payment links your clients can use at once',
            'Simple yearly summaries for tax time',
          ],
        },
        {
          title: 'Agencies and studios',
          text: 'Keep projects, people and money together.',
          bullets: [
            'Several team members with clear roles',
            'Retainers and recurring billing',
            'Project-based invoicing',
            'Approval before invoices go out',
          ],
        },
        {
          title: 'Retail and trade',
          text: 'Track what you sell and what you are owed.',
          bullets: [
            'Products and inventory',
            'Suppliers and purchase orders',
            'Sales tax handled for you',
            'Stock and sales reports',
          ],
        },
        {
          title: 'Service businesses',
          text: 'Run the office without piles of paper.',
          bullets: [
            'Customer records and history',
            'Quotes that turn into invoices',
            'Payroll for your staff',
            'Expense tracking with receipts',
          ],
        },
      ],
    },
    {
      id: 'cta',
      type: 'cta',
      heading: 'Not sure it fits?',
      text: 'Tell us how you work and we will show you how to set it up.',
      button: { label: 'Talk to us', href: '/contact' },
      secondary: { label: 'See features', href: '/features' },
    },
  ],
};
