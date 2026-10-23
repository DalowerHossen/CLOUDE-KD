// path: lib/cms/templates.ts
// Starting content for new blocks and list items in the editor, and the optional parts a block can have.
import type { BlockInput, BlockType } from './blocks';

const cta = { label: 'Learn more', href: '/contact' };

export const BLOCK_LABELS: Readonly<Record<BlockType, string>> = {
  hero: 'Hero (top of page)',
  features: 'Feature grid',
  steps: 'Steps (how it works)',
  pricing_teaser: 'Pricing teaser',
  pricing_table: 'Pricing table',
  testimonials: 'Testimonials',
  trust: 'Trust signals',
  faq: 'Questions and answers',
  cta: 'Call to action',
  richtext: 'Text',
  contact_form: 'Contact form',
  jobs: 'Job list',
  columns: 'Columns with bullet points',
  image: 'Image',
};

function stamp(): string {
  return globalThis.crypto.randomUUID().replaceAll('-', '').slice(0, 6);
}

/** A valid new block of a type. The id is unique within a page because of the random part. */
export function newBlock(type: BlockType): BlockInput {
  const id = `${type.replace(/_/g, '-')}-${stamp()}`;
  switch (type) {
    case 'hero':
      return {
        id,
        type,
        eyebrow: '',
        heading: 'Heading',
        subheading: '',
        primaryCta: cta,
        note: '',
      };
    case 'features':
      return {
        id,
        type,
        heading: 'Heading',
        intro: '',
        items: [{ icon: 'check', title: 'Title', text: 'Short description' }],
      };
    case 'steps':
      return {
        id,
        type,
        heading: 'How it works',
        items: [
          { title: 'First step', text: 'What happens' },
          { title: 'Second step', text: 'What happens next' },
        ],
      };
    case 'pricing_teaser':
      return { id, type, heading: 'Plans', intro: '' };
    case 'pricing_table':
      return { id, type, heading: 'Compare plans', intro: '', prices: {}, footnote: '' };
    case 'testimonials':
      return {
        id,
        type,
        heading: 'What customers say',
        items: [{ quote: 'Quote', name: 'Name', role: '', company: '' }],
      };
    case 'trust':
      return {
        id,
        type,
        heading: 'Why you can trust us',
        items: [{ icon: 'shield', title: 'Title', text: 'Short description' }],
      };
    case 'faq':
      return {
        id,
        type,
        heading: 'Questions',
        items: [{ question: 'Question', answer: 'Answer' }],
      };
    case 'cta':
      return { id, type, heading: 'Heading', text: '', button: cta };
    case 'richtext':
      return { id, type, heading: '', html: '<p>Text</p>' };
    case 'contact_form':
      return { id, type, heading: 'Contact us', intro: '', email: '' };
    case 'jobs':
      return {
        id,
        type,
        heading: 'Open roles',
        intro: '',
        emptyText: 'No open roles right now.',
        items: [],
      };
    case 'columns':
      return {
        id,
        type,
        heading: 'Heading',
        intro: '',
        items: [{ title: 'Title', text: 'Description', bullets: [] }],
      };
    case 'image':
      return {
        id,
        type,
        fileId: '00000000-0000-0000-0000-000000000000',
        alt: 'Describe the image',
        caption: '',
      };
  }
}

/** Items added to a list inside a block, by "<block type>.<field>". */
export const ITEM_TEMPLATES: Readonly<Record<string, unknown>> = {
  'features.items': { icon: 'check', title: 'Title', text: 'Short description' },
  'steps.items': { title: 'Step', text: 'What happens' },
  'testimonials.items': { quote: 'Quote', name: 'Name', role: '', company: '' },
  'trust.items': { icon: 'shield', title: 'Title', text: 'Short description' },
  'faq.items': { question: 'Question', answer: 'Answer' },
  'jobs.items': { title: 'Role', location: 'Location', type: 'Full time', text: 'About the role' },
  'columns.items': { title: 'Title', text: 'Description', bullets: [] },
};

/** Parts a block may have but does not have yet: the editor offers to add them. */
export const OPTIONAL_PARTS: Readonly<Record<string, Readonly<Record<string, unknown>>>> = {
  hero: { primaryCta: cta, secondaryCta: cta, experiment: 'new-experiment' },
  cta: { secondary: cta },
};
