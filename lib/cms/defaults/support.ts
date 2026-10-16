// path: lib/cms/defaults/support.ts
// Built-in FAQ, roadmap and changelog pages. All three are normal CMS pages that staff edit.
import type { PageDefinition } from '../blocks';

export const faq: PageDefinition = {
  slug: 'faq',
  title: 'Frequently asked questions',
  description:
    'Answers to common questions about KD SOLUTION IT: plans, payments, security, data and support.',
  blocks: [
    {
      id: 'hero',
      type: 'hero',
      eyebrow: 'Help',
      heading: 'Frequently asked questions',
      subheading: 'Quick answers. For step-by-step guides, visit the help center.',
      primaryCta: { label: 'Open the help center', href: '/help' },
    },
    {
      id: 'general',
      type: 'faq',
      heading: 'Plans and billing',
      items: [
        {
          question: 'Is there a free plan?',
          answer:
            'Yes. The Free plan lets you start with core invoicing. The pricing page compares what each plan includes.',
        },
        {
          question: 'In which currency are amounts shown?',
          answer: 'All amounts are in US dollars.',
        },
        {
          question: 'Can I cancel at any time?',
          answer:
            'Yes. You keep access until the end of the period you paid for. See the refund policy for details.',
        },
      ],
    },
    {
      id: 'payments',
      type: 'faq',
      heading: 'Payments',
      items: [
        {
          question: 'Do my clients need an account?',
          answer: 'No. Clients use a secure link to view an invoice and pay it.',
        },
        {
          question: 'How do my clients pay?',
          answer:
            'By card or by a local payment method offered through licensed partners. Which methods you see depends on your plan and region.',
        },
        {
          question: 'Do you store card details?',
          answer: 'No. Card details go straight to the payment partner.',
        },
      ],
    },
    {
      id: 'security',
      type: 'faq',
      heading: 'Security and data',
      items: [
        {
          question: 'How is my data protected?',
          answer:
            'Data and files are encrypted, sign-in supports two-factor codes, and every change is written to an audit log. The security page has details.',
        },
        {
          question: 'Where are my files stored?',
          answer:
            'In your own Google Drive if you link one, otherwise in our private encrypted storage.',
        },
        {
          question: 'How do I report a security problem?',
          answer: 'Follow the responsible disclosure page.',
        },
      ],
    },
    {
      id: 'cta',
      type: 'cta',
      heading: 'Did not find your answer?',
      text: 'Write to us and we will help.',
      button: { label: 'Contact support', href: '/contact' },
    },
  ],
};

export const roadmap: PageDefinition = {
  slug: 'roadmap',
  title: 'Product roadmap',
  description:
    'What KD SOLUTION IT is working on now, what is planned next and what comes later. Plans can change.',
  blocks: [
    {
      id: 'hero',
      type: 'hero',
      eyebrow: 'Roadmap',
      heading: 'What we are building',
      subheading: 'This is our plan, not a promise. Items move as we learn from customers.',
    },
    {
      id: 'lanes',
      type: 'columns',
      heading: 'Now, next and later',
      items: [
        {
          title: 'Now',
          text: 'In progress.',
          bullets: [
            'Public website, help center and blog',
            'Invoicing and client payment links',
            'Secure sign-in and audit trail',
          ],
        },
        {
          title: 'Next',
          text: 'Planned after the current work.',
          bullets: [
            'Payroll and payslips',
            'Accounting reports',
            'More payment methods through licensed partners',
          ],
        },
        {
          title: 'Later',
          text: 'Under consideration.',
          bullets: ['More languages', 'Deeper integrations', 'Mobile app'],
        },
      ],
    },
    {
      id: 'cta',
      type: 'cta',
      heading: 'Tell us what you need',
      text: 'Your requests help us decide what comes first.',
      button: { label: 'Share an idea', href: '/contact' },
    },
  ],
};

export const changelog: PageDefinition = {
  slug: 'changelog',
  title: 'What is new',
  description:
    'Release notes for KD SOLUTION IT: new features, improvements and fixes, newest first.',
  blocks: [
    {
      id: 'hero',
      type: 'hero',
      eyebrow: 'Changelog',
      heading: 'What is new',
      subheading: 'New features, improvements and fixes, newest first.',
    },
    {
      id: 'notes',
      type: 'richtext',
      heading: '',
      html: '<h2>Public website</h2><p>The public website is live with product pages, a help center, a blog, free tools, a status page and the legal pages.</p><ul><li>Cookie choices that you control</li><li>Free invoice generator and calculators</li><li>Status page with incident history</li></ul>',
    },
  ],
};
