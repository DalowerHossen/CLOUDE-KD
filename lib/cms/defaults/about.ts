// path: lib/cms/defaults/about.ts
import type { PageDefinition } from '../blocks';

export const about: PageDefinition = {
  slug: 'about',
  title: 'About our company and values',
  description:
    'KD SOLUTION IT builds secure invoicing, payment, payroll and accounting software for growing businesses. Learn what we stand for.',
  blocks: [
    {
      id: 'hero',
      type: 'hero',
      eyebrow: 'About us',
      heading: 'Money software that respects your time and your data',
      subheading:
        'We build the tools a small business needs to bill, get paid, pay its people and keep clean books, without the complexity.',
    },
    {
      id: 'values',
      type: 'features',
      heading: 'What we stand for',
      items: [
        {
          icon: 'shield',
          title: 'Security first',
          text: 'Your financial data is sensitive. We protect it by design, not as an afterthought.',
        },
        {
          icon: 'zap',
          title: 'Simple by default',
          text: 'Everyday tasks take a few clicks. Advanced tools stay out of the way until you need them.',
        },
        {
          icon: 'eye',
          title: 'Honest and clear',
          text: 'Clear plans, clear limits and clear records of what happened in your account.',
        },
        {
          icon: 'globe',
          title: 'Made for many markets',
          text: 'Built with the needs of businesses across the Asia-Pacific region in mind.',
        },
      ],
    },
    {
      id: 'cta',
      type: 'cta',
      heading: 'Want to know more?',
      text: 'We are happy to answer questions about the product, security or pricing.',
      button: { label: 'Contact us', href: '/contact' },
      secondary: { label: 'Join us', href: '/careers' },
    },
  ],
};
