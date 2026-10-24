// path: lib/cms/defaults/careers.ts
import type { PageDefinition } from '../blocks';

export const careers: PageDefinition = {
  slug: 'careers',
  title: 'Careers and open roles',
  description:
    'Join KD SOLUTION IT and help build secure money software for growing businesses. See open roles or tell us about yourself.',
  blocks: [
    {
      id: 'hero',
      type: 'hero',
      eyebrow: 'Careers',
      heading: 'Help us build money software people trust',
      subheading: 'We look for careful, curious people who like making hard things simple.',
    },
    {
      id: 'jobs',
      type: 'jobs',
      heading: 'Open roles',
      intro: 'Roles appear here as soon as they are open.',
      emptyText:
        'We have no open roles right now. If you would like to work with us in the future, send us a short note and we will keep it on file.',
      items: [],
    },
    {
      id: 'cta',
      type: 'cta',
      heading: 'Tell us about yourself',
      text: 'Write to us with what you do best and what you would like to build.',
      button: { label: 'Get in touch', href: '/contact' },
    },
  ],
};
