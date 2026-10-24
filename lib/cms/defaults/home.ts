// path: lib/cms/defaults/home.ts
import type { PageDefinition } from '../blocks';

export const home: PageDefinition = {
  slug: 'home',
  title: 'Invoicing, payments, payroll and accounting',
  description:
    'KD SOLUTION IT helps growing businesses send invoices, get paid, run payroll and keep the books in one secure place. Start free.',
  blocks: [
    {
      id: 'hero',
      type: 'hero',
      eyebrow: 'Invoicing, payments, payroll and accounting',
      heading: 'Get paid faster and keep your books in order',
      subheading:
        'Send professional invoices, accept payments from your clients, pay your team and see your numbers in one secure workspace built for businesses in the Asia-Pacific region and beyond.',
      primaryCta: { label: 'Start free', href: '/signup' },
      secondaryCta: { label: 'See how it works', href: '/features' },
      note: 'No card needed to start. Cancel any time.',
    },
    {
      id: 'features',
      type: 'features',
      heading: 'Everything your business needs to bill and be paid',
      intro: 'One place for the whole money cycle, from the first estimate to the closed month.',
      items: [
        {
          icon: 'file-text',
          title: 'Invoices and estimates',
          text: 'Create clear invoices and estimates in minutes, send them by e-mail and track when your client opens them.',
        },
        {
          icon: 'credit-card',
          title: 'Online payments',
          text: 'Let clients pay by card and local payment methods through licensed partners, with every payment recorded against its invoice.',
        },
        {
          icon: 'users',
          title: 'Payroll',
          text: 'Run payroll for your team, keep payslips and see what each month costs.',
        },
        {
          icon: 'calculator',
          title: 'Accounting',
          text: 'Your invoices, payments and expenses flow into a ledger, so reports are ready when you need them.',
        },
        {
          icon: 'repeat',
          title: 'Recurring billing',
          text: 'Bill retainers and subscriptions on a schedule and stop chasing the same invoice every month.',
        },
        {
          icon: 'bar-chart',
          title: 'Reports',
          text: 'See what is paid, what is late and where your money goes, with figures you can trust.',
        },
      ],
    },
    {
      id: 'steps',
      type: 'steps',
      heading: 'How it works',
      items: [
        {
          title: 'Set up your business',
          text: 'Add your company details, tax settings and your first clients.',
        },
        {
          title: 'Send an invoice',
          text: 'Create it, send it, and give your client a secure link to view and pay.',
        },
        {
          title: 'Get paid and stay in control',
          text: 'Payments match to invoices automatically, and your reports update by themselves.',
        },
      ],
    },
    {
      id: 'trust',
      type: 'trust',
      heading: 'Built to keep your data safe',
      items: [
        {
          icon: 'lock',
          title: 'Encrypted files',
          text: 'Files are encrypted before they are stored, in your own Google Drive or in our private storage.',
        },
        {
          icon: 'key',
          title: 'Two-factor sign-in',
          text: 'Protect every account with an authenticator code and recovery codes.',
        },
        {
          icon: 'eye',
          title: 'Complete audit trail',
          text: 'Every change is recorded, so you always know who did what and when.',
        },
        {
          icon: 'shield',
          title: 'Careful access control',
          text: 'Owners and staff see only what their role allows.',
        },
      ],
    },
    {
      id: 'pricing',
      type: 'pricing_teaser',
      heading: 'Simple plans that grow with you',
      intro: 'Start free and move up when your business needs more.',
    },
    {
      id: 'faq',
      type: 'faq',
      heading: 'Common questions',
      items: [
        {
          question: 'Do my clients need an account?',
          answer:
            'No. Clients open a secure link from your e-mail to view an invoice, pay it and download a receipt. They never need to sign in.',
        },
        {
          question: 'Which currency does the platform use?',
          answer:
            'All amounts are kept in US dollars so that your books stay consistent. Higher plans can show amounts in other currencies for reference.',
        },
        {
          question: 'How do payments work?',
          answer:
            'Payments go through licensed payment partners. The platform records each payment, matches it to the invoice and keeps a full history.',
        },
        {
          question: 'Where are my files stored?',
          answer:
            'In your own Google Drive when you link it, otherwise in our private storage. Files are encrypted either way.',
        },
        {
          question: 'Can I leave at any time?',
          answer: 'Yes. You can export your data and close your account whenever you like.',
        },
      ],
    },
    {
      id: 'cta',
      type: 'cta',
      heading: 'Ready to simplify how you bill and get paid?',
      text: 'Create your free account in a few minutes.',
      button: { label: 'Start free', href: '/signup' },
      secondary: { label: 'Talk to us', href: '/contact' },
    },
  ],
};
