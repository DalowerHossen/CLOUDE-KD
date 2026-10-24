// path: lib/cms/defaults/contact.ts
import type { PageDefinition } from '../blocks';

export const contact: PageDefinition = {
  slug: 'contact',
  title: 'Contact our team',
  description:
    'Send a message to the KD SOLUTION IT team for sales, support or partnership questions. We reply by e-mail, usually within one working day.',
  blocks: [
    {
      id: 'form',
      type: 'contact_form',
      heading: 'Talk to us',
      intro: 'Tell us how we can help. A real person reads every message and answers by e-mail.',
      email: 'support@kdsolutionit.com',
    },
    {
      id: 'faq',
      type: 'faq',
      heading: 'Before you write',
      items: [
        {
          question: 'I need help with my account.',
          answer:
            'Sign in and open the help center for guides, or write to us here and mention the e-mail address of your account.',
        },
        {
          question: 'I found a security problem.',
          answer:
            'Please write to us here with the word "security" as the topic and describe what you found. Do not include passwords or personal data.',
        },
        {
          question: 'I want to become a partner.',
          answer: 'Choose "Partnership" as the topic and tell us about your business.',
        },
      ],
    },
  ],
};
