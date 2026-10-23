// path: lib/cms/defaults/security.ts
import type { PageDefinition } from '../blocks';

export const security: PageDefinition = {
  slug: 'security',
  title: 'Security and trust',
  description:
    'How KD SOLUTION IT protects your financial data: encryption, two-factor sign-in, access control, audit trails and careful handling of payments.',
  blocks: [
    {
      id: 'hero',
      type: 'hero',
      eyebrow: 'Security and trust',
      heading: 'Your financial data deserves serious protection',
      subheading:
        'Security is part of how every feature is built. Here is what protects your account and your clients.',
    },
    {
      id: 'trust',
      type: 'trust',
      heading: 'How we protect you',
      items: [
        {
          icon: 'lock',
          title: 'Encryption',
          text: 'Sensitive data and every stored file are encrypted with AES-256 before they are saved. Connections use TLS.',
        },
        {
          icon: 'key',
          title: 'Strong sign-in',
          text: 'Two-factor authentication, recovery codes, and automatic locking after repeated wrong attempts.',
        },
        {
          icon: 'shield',
          title: 'Access control',
          text: 'Owners, staff and platform roles each see only what they need. Clients use secure links, not passwords.',
        },
        {
          icon: 'eye',
          title: 'Audit trail',
          text: 'Every change is written to a tamper-evident log with who, what and when.',
        },
        {
          icon: 'server',
          title: 'Network protection',
          text: 'Traffic from anonymizing networks is blocked on sign-up, payments and administration, and attacks are rate limited.',
        },
        {
          icon: 'credit-card',
          title: 'Payment handling',
          text: 'Card details go straight to licensed payment partners. We never store full card numbers.',
        },
      ],
    },
    {
      id: 'details',
      type: 'columns',
      heading: 'More detail',
      items: [
        {
          title: 'Your data',
          text: 'You decide where files live.',
          bullets: [
            'Files go to your own Google Drive when linked',
            'Otherwise to private, encrypted storage',
            'You can export your data at any time',
          ],
        },
        {
          title: 'Operations',
          text: 'We watch the platform around the clock.',
          bullets: [
            'Monitoring and alerting with escalation',
            'Written incident procedures',
            'Regular backups with restore checks',
          ],
        },
        {
          title: 'Reporting a problem',
          text: 'We want to hear about security issues.',
          bullets: [
            'Use the contact page and choose the security topic',
            'Do not include passwords or personal data',
            'We confirm receipt and keep you informed',
          ],
        },
      ],
    },
    {
      id: 'cta',
      type: 'cta',
      heading: 'Questions about security?',
      text: 'Our team can answer questions from your security or compliance team.',
      button: { label: 'Contact us', href: '/contact' },
    },
  ],
};
