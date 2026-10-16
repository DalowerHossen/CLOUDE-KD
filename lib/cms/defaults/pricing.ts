// path: lib/cms/defaults/pricing.ts
import type { PageDefinition } from '../blocks';

export const pricing: PageDefinition = {
  slug: 'pricing',
  title: 'Pricing and plans',
  description:
    'Compare the Free, Pro, Business and Enterprise plans of KD SOLUTION IT and see exactly what each one includes before you start.',
  blocks: [
    {
      id: 'hero',
      type: 'hero',
      eyebrow: 'Pricing',
      heading: 'Plans for every stage of your business',
      subheading: 'Start free. Move up when you need more clients, more people or more tools.',
      primaryCta: { label: 'Start free', href: '/signup' },
      secondaryCta: { label: 'Talk to sales', href: '/contact' },
    },
    {
      id: 'table',
      type: 'pricing_table',
      heading: 'Compare plans',
      intro:
        'The table below is read from the plans themselves, so it always matches what your account gets.',
      prices: {},
      footnote:
        'All amounts are in US dollars. Prices are shown here as soon as they are published for your region.',
    },
    {
      id: 'faq',
      type: 'faq',
      heading: 'Questions about plans',
      items: [
        {
          question: 'Can I change my plan later?',
          answer: 'Yes. You can move up or down at any time from your billing settings.',
        },
        {
          question: 'What happens if I reach a limit?',
          answer:
            'You are told before you reach it and can upgrade with one click. Nothing is deleted.',
        },
        {
          question: 'Do I need a card to start?',
          answer: 'No. The Free plan needs no payment details.',
        },
        {
          question: 'Is there a plan for large organizations?',
          answer:
            'Yes. Enterprise includes single sign-on readiness, priority support and custom arrangements. Contact us to talk it through.',
        },
      ],
    },
    {
      id: 'cta',
      type: 'cta',
      heading: 'Start with the Free plan',
      text: 'Upgrade only when it makes sense for you.',
      button: { label: 'Create your account', href: '/signup' },
    },
  ],
};
