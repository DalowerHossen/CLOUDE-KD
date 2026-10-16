// path: lib/cms/defaults/legal.ts
// Built-in text of the legal pages. The CMS can store edited versions that win over these. Each page is a short
// introduction and a list of sections; the text states what the platform does and leaves out promises it cannot keep.
import type { BlockInput, PageDefinition } from '../blocks';

/** The date the built-in texts take effect. A stored CMS version shows its own publish date instead. */
export const LEGAL_EFFECTIVE = '2026-10-01';

interface Section {
  title: string;
  paragraphs: string[];
  bullets?: string[];
}

const CONTACT = 'Questions about this page can be sent through the contact page.';

function doc(
  slug: string,
  title: string,
  description: string,
  intro: string,
  sections: Section[],
): PageDefinition {
  const html = sections
    .map((s) => {
      const list = s.bullets ? `<ul>${s.bullets.map((b) => `<li>${b}</li>`).join('')}</ul>` : '';
      return `<h2>${s.title}</h2>${s.paragraphs.map((p) => `<p>${p}</p>`).join('')}${list}`;
    })
    .join('');
  const blocks: BlockInput[] = [
    { id: 'hero', type: 'hero', eyebrow: 'Legal', heading: title, subheading: intro },
    { id: 'text', type: 'richtext', heading: '', html: `${html}<p>${CONTACT}</p>` },
  ];
  return { slug: `legal/${slug}`, title, description, blocks };
}

const terms = doc(
  'terms',
  'Terms of Service',
  'The rules for using KD SOLUTION IT: accounts, plans, payments, acceptable use, data ownership and how either side can end the agreement.',
  'These terms are the agreement between you and KD SOLUTION IT for use of the platform.',
  [
    {
      title: 'The service',
      paragraphs: [
        'KD SOLUTION IT provides software for invoicing, payments, payroll and accounting. We may improve or change features over time. If a change removes a feature you rely on in a material way, we tell you in advance.',
      ],
    },
    {
      title: 'Your account',
      paragraphs: [
        'You must give correct information, keep your sign-in details and two-factor devices safe, and tell us quickly if you think someone else used your account. You are responsible for the people you invite and for what they do in your workspace.',
      ],
    },
    {
      title: 'Plans, fees and taxes',
      paragraphs: [
        'Paid plans are charged in US dollars for the period shown when you subscribe. Plans renew until you cancel. Prices exclude taxes unless stated. Changes to a price apply from the next renewal after we have told you.',
      ],
    },
    {
      title: 'Your data',
      paragraphs: [
        'You own the data you put into the platform. You give us the right to process it only to provide the service, keep it safe and meet legal duties. The privacy policy and the data processing agreement describe how we do this.',
      ],
    },
    {
      title: 'Acceptable use',
      paragraphs: ['You agree to follow the acceptable use policy at all times.'],
    },
    {
      title: 'Payments made by your clients',
      paragraphs: [
        'Client payments run through licensed payment partners. You are responsible for the accuracy of the invoices you send and for the goods and services behind them. We are not a party to the agreement between you and your client.',
      ],
    },
    {
      title: 'Availability and support',
      paragraphs: [
        'We work to keep the service available and describe our targets in the service level page. Planned maintenance is announced in advance where possible.',
      ],
    },
    {
      title: 'Ending the agreement',
      paragraphs: [
        'You can cancel at any time from your settings. We can suspend or end an account that breaks these terms, puts others at risk, or is required by law to be closed. After the account ends you can export your data for a limited period before it is deleted according to the retention rules.',
      ],
    },
    {
      title: 'Liability',
      paragraphs: [
        'To the extent the law allows, our total liability for any claim is limited to the fees you paid for the service in the twelve months before the event. Nothing here limits liability that cannot be limited by law.',
      ],
    },
    {
      title: 'Changes to these terms',
      paragraphs: [
        'When we change these terms we publish a new version, keep the earlier versions, and ask you to accept the new version at your next sign-in. The version you accepted and the time are kept as a record.',
      ],
    },
  ],
);

const privacy = doc(
  'privacy',
  'Privacy Policy',
  'What personal data KD SOLUTION IT collects, why, how long it is kept, who it is shared with and how you can use your rights under GDPR and CCPA.',
  'This policy explains how we handle personal data on our website and in the platform.',
  [
    {
      title: 'Who is responsible',
      paragraphs: [
        'For visitors of this website and for account holders, KD SOLUTION IT decides why and how data is processed. For the data of your own clients and staff that you enter into the platform, you decide and we process it for you under the data processing agreement.',
      ],
    },
    {
      title: 'What we collect',
      paragraphs: ['We collect only what we need:'],
      bullets: [
        'Account data: name, e-mail address, company details and sign-in security data.',
        'Content you enter: invoices, clients, payments, payroll and accounting records.',
        'Technical data: device and browser type, security signals and a hashed form of the network address.',
        'Website data: pages visited and cookie choices, and analytics only if you agree.',
        'Messages you send us through the contact form.',
      ],
    },
    {
      title: 'Why we use it',
      paragraphs: [
        'To provide and secure the service, to meet legal duties such as tax records and fraud prevention, to answer your requests, and, with your permission, to measure and improve the website.',
      ],
    },
    {
      title: 'Sharing',
      paragraphs: [
        'We share data only with providers that help us run the service (hosting, database, e-mail, error monitoring, payment partners), listed on the sub-processors page, and with authorities when the law requires it. We do not sell personal data.',
      ],
    },
    {
      title: 'How long we keep it',
      paragraphs: [
        'Account data is kept while the account is active. Financial records are kept for the period the law requires and then removed. Contact messages are removed from view after 24 months.',
      ],
    },
    {
      title: 'Your rights',
      paragraphs: [
        'You can ask to see, correct, export or delete your data, to object to certain uses, and to withdraw consent at any time. Residents of the EU, the UK and California have the rights described on the GDPR and CCPA pages. You can also complain to your data protection authority.',
      ],
    },
    {
      title: 'Security',
      paragraphs: [
        'Data is encrypted in transit and at rest, access is limited by role, and changes are written to an audit log. No system is perfectly safe; we tell affected people and authorities about a breach as the law requires.',
      ],
    },
  ],
);

const refunds = doc(
  'refunds',
  'Refund Policy',
  'When subscription fees can be refunded, how to ask for a refund and how refunds of client payments are handled.',
  'This page explains refunds of subscription fees. Refunds of payments your clients made to you are handled by you.',
  [
    {
      title: 'Subscription fees',
      paragraphs: [
        'You can cancel a paid plan at any time and keep access until the end of the period you paid for. Fees for a period that has already started are not refunded, except where the law requires it or where we made an error.',
      ],
    },
    {
      title: 'First payment',
      paragraphs: [
        'If you are not satisfied, ask for a refund of your first payment within 14 days of it. We answer within five working days.',
      ],
    },
    {
      title: 'Billing errors',
      paragraphs: [
        'If you were charged twice or for a plan you did not choose, tell us and we correct it and refund the difference.',
      ],
    },
    {
      title: 'Payments from your clients',
      paragraphs: [
        'A refund of a payment your client made for your invoice is a decision between you and your client. The platform records the refund and returns the money through the same payment partner where that partner allows it.',
      ],
    },
    {
      title: 'How to ask',
      paragraphs: [
        'Use the contact page and name the account e-mail address and the payment date.',
      ],
    },
  ],
);

const cookies = doc(
  'cookies',
  'Cookie Policy',
  'Which cookies KD SOLUTION IT uses, what each category does, and how to change your choice at any time.',
  'This page lists the cookies of our website and how to control them.',
  [
    {
      title: 'Necessary cookies',
      paragraphs: [
        'These keep you signed in, protect forms and remember your cookie choice. They are always on because the site cannot work safely without them.',
      ],
    },
    {
      title: 'Analytics cookies',
      paragraphs: [
        'These show us which pages are used so we can improve them. They are off until you agree.',
      ],
    },
    {
      title: 'Marketing cookies',
      paragraphs: [
        'These measure the result of our campaigns. They are off until you agree. Marketing scripts never run on sign-in, payment, client portal or administration pages.',
      ],
    },
    {
      title: 'Your choice',
      paragraphs: [
        'When you first visit, a banner lets you accept all, reject everything that is not necessary, or choose by category. Rejecting is as easy as accepting. Use the cookie settings link in the footer to change your choice. We keep a record of your choice as evidence, linked to a random visitor number and not to your name.',
      ],
    },
    {
      title: 'Changes',
      paragraphs: ['When this policy changes in a way that needs your consent, we ask you again.'],
    },
  ],
);

const dpa = doc(
  'dpa',
  'Data Processing Agreement',
  'The terms under which KD SOLUTION IT processes personal data on behalf of its customers: scope, security, sub-processors, assistance and deletion.',
  'This agreement applies when we process personal data for you as a processor.',
  [
    {
      title: 'Roles and scope',
      paragraphs: [
        'You are the controller of the personal data of your clients, staff and contacts that you enter in the platform. We are the processor and handle it only on your documented instructions: using the platform is such an instruction.',
      ],
    },
    {
      title: 'Security measures',
      paragraphs: [
        'We encrypt data in transit and at rest, separate each customer workspace with row level access rules, require two-factor sign-in for staff, keep an audit log of changes, and limit access to people who need it.',
      ],
    },
    {
      title: 'Sub-processors',
      paragraphs: [
        'You allow us to use the sub-processors listed on our sub-processors page. We tell you before we add or replace one, and you can object within a reasonable time.',
      ],
    },
    {
      title: 'Assistance',
      paragraphs: [
        'We help you answer requests from the people whose data you hold, and we help with security and impact assessments, as far as the nature of the processing allows.',
      ],
    },
    {
      title: 'Personal data breaches',
      paragraphs: [
        'We tell you without undue delay after we become aware of a breach that affects your data, with the information we have to help you meet your own duties.',
      ],
    },
    {
      title: 'International transfers',
      paragraphs: [
        'Where data moves across borders, we use the transfer tools the law accepts, such as standard contractual clauses.',
      ],
    },
    {
      title: 'Return and deletion',
      paragraphs: [
        'When the agreement ends you can export your data. We then delete it, except where the law requires us to keep a copy, within the period set in the retention rules.',
      ],
    },
    {
      title: 'Audits',
      paragraphs: [
        'You may ask for the information needed to show our compliance, and, where that is not enough, for an audit with reasonable notice and limits that protect other customers.',
      ],
    },
  ],
);

const subProcessors = doc(
  'sub-processors',
  'Sub-processors',
  'The companies that help KD SOLUTION IT process customer data, what each does and the kind of data involved.',
  'We use these providers to run the platform. We update this list before a change takes effect.',
  [
    {
      title: 'Database and sign-in',
      paragraphs: [
        'A managed database provider stores the text data of the platform and handles sign-in. Data involved: all account and business records.',
      ],
    },
    {
      title: 'Hosting and delivery',
      paragraphs: [
        'A hosting provider runs the application and delivers pages. Data involved: requests, which include network addresses.',
      ],
    },
    {
      title: 'File storage',
      paragraphs: [
        'Files are stored encrypted in your own linked Google Drive when you link one, otherwise in the platform storage of our database provider. Data involved: documents you upload or generate.',
      ],
    },
    {
      title: 'E-mail and messages',
      paragraphs: [
        'E-mail is sent through a mail provider chosen by the platform or by your own mail server settings, and WhatsApp messages through the WhatsApp Business platform when you turn them on. Data involved: recipient address, message content.',
      ],
    },
    {
      title: 'Payments',
      paragraphs: [
        'Client payments are processed by licensed payment partners that you enable. Card and account details go to the partner and are not stored by us. Data involved: payment amount, status and reference.',
      ],
    },
    {
      title: 'Monitoring and security',
      paragraphs: [
        'An error monitoring provider receives technical error reports without personal content. A bot protection provider checks forms. Data involved: technical data and network address.',
      ],
    },
  ],
);

const acceptableUse = doc(
  'acceptable-use',
  'Acceptable Use Policy',
  'What you may not do with KD SOLUTION IT: illegal activity, abuse, security attacks and misuse of payments.',
  'This policy keeps the platform safe and fair for everyone.',
  [
    {
      title: 'You must not',
      paragraphs: ['Use the platform to:'],
      bullets: [
        'break the law, evade tax, launder money or finance crime,',
        'send invoices for goods or services that do not exist, or mislead your clients,',
        'send spam or messages to people who did not agree to receive them,',
        'upload malware or content that infringes the rights of others,',
        'try to reach data or accounts that are not yours, probe or attack the platform, or avoid its limits and security controls,',
        'hide your location with anonymizing networks where the platform forbids it (sign-up, payments, identity checks and administration),',
        'resell the service without our written agreement.',
      ],
    },
    {
      title: 'What we may do',
      paragraphs: [
        'We may limit, suspend or close an account that breaks this policy, hold payments that look fraudulent, and report illegal activity to the authorities. Where possible we tell you why and how to put it right.',
      ],
    },
    {
      title: 'Reporting',
      paragraphs: [
        'Report abuse through the contact page. Security problems follow the responsible disclosure page.',
      ],
    },
  ],
);

const sla = doc(
  'sla',
  'Service Level Commitment',
  'The availability target of KD SOLUTION IT, how it is measured, planned maintenance and the credits that apply when the target is missed.',
  'Our target is 99.9 percent monthly availability of the core platform.',
  [
    {
      title: 'Target',
      paragraphs: [
        'We aim for at least 99.9 percent availability of sign-in, invoicing and payment pages in each calendar month, measured by our own monitoring and shown on the status page.',
      ],
    },
    {
      title: 'Not counted',
      paragraphs: [
        'Planned maintenance announced in advance, problems caused by your own network or devices, outages of services outside our control such as a client payment partner or your mail server, and events beyond reasonable control.',
      ],
    },
    {
      title: 'Incidents',
      paragraphs: [
        'We publish incidents on the status page, update them while they are open, and share a summary after serious ones.',
      ],
    },
    {
      title: 'Credits',
      paragraphs: [
        'If a month falls below the target, contact us within 30 days. Eligible paid accounts receive a credit on a later invoice in proportion to the missed time. Credits are the only remedy for missed availability.',
      ],
    },
    {
      title: 'Support',
      paragraphs: ['Support response times depend on your plan and are shown on the pricing page.'],
    },
  ],
);

const gdpr = doc(
  'gdpr',
  'GDPR Compliance',
  'How KD SOLUTION IT supports the General Data Protection Regulation: legal bases, your rights, transfers, processor duties and how to use them.',
  'This page describes how we handle personal data of people in the European Economic Area and the United Kingdom.',
  [
    {
      title: 'Legal bases',
      paragraphs: [
        'We process data to perform our agreement with you, to meet legal duties, for our legitimate interests in security and improvement, and with your consent for analytics and marketing cookies.',
      ],
    },
    {
      title: 'Your rights',
      paragraphs: ['You have the right to:'],
      bullets: [
        'access your data and receive a copy,',
        'correct it and have it deleted,',
        'restrict or object to processing,',
        'receive your data in a portable format,',
        'withdraw consent at any time without affecting earlier processing.',
      ],
    },
    {
      title: 'How to use them',
      paragraphs: [
        'Use the contact page. We confirm your identity and answer within one month. Account holders can export and delete much of their data from the settings.',
      ],
    },
    {
      title: 'Processor role',
      paragraphs: [
        'For data you enter about your clients and staff we act as a processor under the data processing agreement.',
      ],
    },
    {
      title: 'Transfers outside the EEA',
      paragraphs: [
        'When data leaves the European Economic Area we use approved safeguards such as standard contractual clauses.',
      ],
    },
  ],
);

const ccpa = doc(
  'ccpa',
  'CCPA Compliance',
  'The rights California residents have over their personal information and how KD SOLUTION IT honors them.',
  'This page applies to residents of California.',
  [
    {
      title: 'Your rights',
      paragraphs: ['You may ask us to:'],
      bullets: [
        'tell you which personal information we collect, use and share,',
        'give you a copy of it,',
        'delete it, subject to legal exceptions,',
        'correct inaccurate information,',
        'not discriminate against you for using these rights.',
      ],
    },
    {
      title: 'We do not sell personal information',
      paragraphs: [
        'We do not sell personal information and we do not share it for cross-context behavioral advertising unless you accept marketing cookies. You can turn these off with the cookie settings link in the footer.',
      ],
    },
    {
      title: 'How to ask',
      paragraphs: [
        'Use the contact page. An authorized agent may ask for you with proof of authority. We verify requests before acting and answer within 45 days.',
      ],
    },
  ],
);

const accessibility = doc(
  'accessibility',
  'Accessibility Statement',
  'Our commitment to WCAG 2.1 level AA, what we do to meet it, known limits and how to report an accessibility problem.',
  'We want everyone to be able to use KD SOLUTION IT.',
  [
    {
      title: 'Our standard',
      paragraphs: [
        'We build to the Web Content Accessibility Guidelines 2.1 level AA: keyboard operation, visible focus, sufficient contrast, labels for form fields, text alternatives for images, respect for reduced motion, and layouts that work on small screens and with zoom.',
      ],
    },
    {
      title: 'Choices',
      paragraphs: ['The theme switch offers light, dark, system and high contrast modes.'],
    },
    {
      title: 'Known limits',
      paragraphs: [
        'Some documents generated for printing, and content added by customers, may not meet the standard. We work on these and welcome reports.',
      ],
    },
    {
      title: 'Tell us',
      paragraphs: [
        'If you find a barrier, use the contact page and tell us the page and the problem. We answer within five working days and aim to fix confirmed problems quickly.',
      ],
    },
  ],
);

const disclosure = doc(
  'responsible-disclosure',
  'Responsible Disclosure',
  'How to report a security weakness in KD SOLUTION IT, what is in scope and what you can expect from us.',
  'If you found a security problem, thank you. Please tell us before you tell anyone else.',
  [
    {
      title: 'How to report',
      paragraphs: [
        'Use the contact page and choose security as the topic, or follow the details in our security.txt file. Describe what you found and the steps to repeat it.',
      ],
    },
    {
      title: 'Please do',
      paragraphs: [],
      bullets: [
        'give us reasonable time to fix the problem before you share it,',
        'use only your own accounts and test data,',
        'stop and report as soon as you reach other people data.',
      ],
    },
    {
      title: 'Please do not',
      paragraphs: [],
      bullets: [
        'run denial of service or spam tests,',
        'use social engineering against our staff or customers,',
        'change or destroy data that is not yours.',
      ],
    },
    {
      title: 'What we do',
      paragraphs: [
        'We confirm receipt within three working days, keep you informed, fix confirmed problems as fast as their severity requires, and credit you if you wish. We will not take legal action against research that follows this page.',
      ],
    },
  ],
);

export const LEGAL_PAGES: Readonly<Record<string, PageDefinition>> = Object.fromEntries(
  [
    terms,
    privacy,
    refunds,
    cookies,
    dpa,
    subProcessors,
    acceptableUse,
    sla,
    gdpr,
    ccpa,
    accessibility,
    disclosure,
  ].map((p) => [p.slug, p]),
);
