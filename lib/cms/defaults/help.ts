// path: lib/cms/defaults/help.ts
// Built-in help center articles. The CMS can store edited versions (kind "help") that win over these, and staff can
// add new articles under help/<category>/<name>. Articles describe what the platform does in general terms.
import type { BlockInput, PageDefinition } from '../blocks';

export const HELP_CATEGORIES = [
  {
    key: 'getting-started',
    name: 'Getting started',
    text: 'Set up your account and send your first invoice.',
  },
  {
    key: 'invoicing',
    name: 'Invoicing',
    text: 'Create, send and follow up invoices and estimates.',
  },
  { key: 'payments', name: 'Payments', text: 'How clients pay and how payments are matched.' },
  {
    key: 'account-security',
    name: 'Account and security',
    text: 'Sign-in, two-factor codes and keeping data safe.',
  },
] as const;

interface Section {
  title: string;
  paragraphs: string[];
  steps?: string[];
}

function article(
  category: string,
  name: string,
  title: string,
  description: string,
  intro: string,
  sections: Section[],
): PageDefinition {
  const html = sections
    .map((s) => {
      const list = s.steps ? `<ol>${s.steps.map((x) => `<li>${x}</li>`).join('')}</ol>` : '';
      return `<h2>${s.title}</h2>${s.paragraphs.map((p) => `<p>${p}</p>`).join('')}${list}`;
    })
    .join('');
  const blocks: BlockInput[] = [
    {
      id: 'hero',
      type: 'hero',
      eyebrow: HELP_CATEGORIES.find((c) => c.key === category)?.name ?? 'Help',
      heading: title,
      subheading: intro,
    },
    { id: 'text', type: 'richtext', heading: '', html },
    {
      id: 'ask',
      type: 'cta',
      heading: 'Still need help?',
      text: 'Write to us and we will answer by e-mail, usually within one working day.',
      button: { label: 'Contact support', href: '/contact' },
    },
  ];
  return { slug: `help/${category}/${name}`, title, description, blocks };
}

const list: PageDefinition[] = [
  article(
    'getting-started',
    'create-your-account',
    'Create your account',
    'How to sign up for KD SOLUTION IT, confirm your e-mail address and turn on two-factor sign-in.',
    'Creating an account takes a few minutes.',
    [
      {
        title: 'Sign up',
        paragraphs: [
          'Choose a plan, enter your e-mail address and a strong password, and complete the security check.',
        ],
        steps: [
          'Open the sign-up page and enter your details.',
          'Open the confirmation e-mail we send and follow the link.',
          'Add your business name and basic details.',
        ],
      },
      {
        title: 'Turn on two-factor sign-in',
        paragraphs: [
          'We recommend an authenticator app. Save the recovery codes in a safe place: they are the way back in if you lose your device.',
        ],
      },
    ],
  ),
  article(
    'getting-started',
    'set-up-your-business',
    'Set up your business details',
    'Add your company name, address, tax details and logo so every invoice shows the right information.',
    'Good details on your documents help clients pay faster.',
    [
      {
        title: 'What to add',
        paragraphs: [
          'Your legal or trading name, address, contact e-mail, tax registration number where you have one, and your logo.',
        ],
      },
      {
        title: 'Why it matters',
        paragraphs: [
          'These details appear on invoices and estimates. Check them before you send your first document.',
        ],
      },
    ],
  ),
  article(
    'invoicing',
    'send-an-invoice',
    'Create and send an invoice',
    'Step by step: add a client, list the work, set the due date and send a secure payment link.',
    'An invoice is sent as a secure link your client can open without an account.',
    [
      {
        title: 'Steps',
        paragraphs: ['Start from the invoices section of your dashboard.'],
        steps: [
          'Choose or add the client.',
          'Add the items with quantity and price. Amounts are in US dollars.',
          'Set the issue date and the due date, and add tax if it applies.',
          'Review the totals and send the invoice.',
        ],
      },
      {
        title: 'After you send',
        paragraphs: [
          'You can see when the client opens the invoice and when it is paid. Reminders can go out before and after the due date.',
        ],
      },
    ],
  ),
  article(
    'invoicing',
    'estimates-and-credit-notes',
    'Estimates and credit notes',
    'When to use an estimate before you start work, and a credit note when you need to reduce or cancel an invoice.',
    'Estimates and credit notes follow the same steps as invoices.',
    [
      {
        title: 'Estimates',
        paragraphs: [
          'Send an estimate to agree on price and scope. When the client accepts, you can turn it into an invoice.',
        ],
      },
      {
        title: 'Credit notes',
        paragraphs: [
          'A credit note records a reduction or a cancellation against an invoice. The original invoice is never deleted, so your records stay complete.',
        ],
      },
    ],
  ),
  article(
    'payments',
    'how-clients-pay',
    'How your clients pay',
    'Clients open a secure link and pay by card or by a local payment method offered through licensed partners.',
    'Your clients do not need an account to pay.',
    [
      {
        title: 'The payment link',
        paragraphs: [
          'Each invoice has a secure link. The client opens it, checks the invoice and chooses a payment method.',
        ],
      },
      {
        title: 'Payment methods',
        paragraphs: [
          'Card and local payment methods are handled by licensed partners. Card details go to the partner and are not stored by us. The methods available depend on your plan and region.',
        ],
      },
      {
        title: 'Matching',
        paragraphs: [
          'A confirmed payment is matched to its invoice, and the invoice status updates by itself.',
        ],
      },
    ],
  ),
  article(
    'payments',
    'refunds-and-disputes',
    'Refunds and disputes',
    'What to do when a client asks for a refund or disputes a payment, and how the record is kept.',
    'Refunds are decided between you and your client; the platform keeps the record.',
    [
      {
        title: 'Refunds',
        paragraphs: [
          'Issue a refund from the payment record. Where the payment partner allows it, the money returns the same way it came.',
        ],
      },
      {
        title: 'Disputes',
        paragraphs: [
          'If a client disputes a payment with their bank, respond quickly with the invoice and proof of delivery. Keep your documents complete.',
        ],
      },
    ],
  ),
  article(
    'account-security',
    'protect-your-account',
    'Protect your account',
    'Use a strong password, two-factor sign-in and recovery codes, and learn what to do if you suspect a problem.',
    'A few habits keep your account and your clients safe.',
    [
      {
        title: 'Good habits',
        paragraphs: [
          'Use a password you use nowhere else, turn on two-factor sign-in, keep recovery codes offline, and sign out on shared devices.',
        ],
      },
      {
        title: 'If something looks wrong',
        paragraphs: [
          'Change your password, review the sign-in history in your settings, and contact support. Repeated wrong attempts lock an account for a while to protect it.',
        ],
      },
    ],
  ),
  article(
    'account-security',
    'your-data-and-privacy',
    'Your data and privacy',
    'Where your data is stored, how files are encrypted, and how to export or delete your data.',
    'You own your data.',
    [
      {
        title: 'Storage',
        paragraphs: [
          'Text data is stored in our database. Files are encrypted and stored in your linked Google Drive, or in our private storage if you have not linked one.',
        ],
      },
      {
        title: 'Export and deletion',
        paragraphs: [
          'You can export your data. Read the privacy policy and the data processing agreement for how requests are handled and how long records are kept.',
        ],
      },
    ],
  ),
];

export const HELP_PAGES: Readonly<Record<string, PageDefinition>> = Object.fromEntries(
  list.map((p) => [p.slug, p]),
);
