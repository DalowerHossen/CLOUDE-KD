// path: config/processors.ts
// Metadata of the sixteen processors (REQ-PROCESSORS). Links are the starting points from PAYMENT_PROCESSORS.md; each
// adapter sub-step re-reads the provider's own site and records the facts in docs/processors/<id>.md before any code.
import type { ProcessorId, ProcessorMetadata } from '@/types/contracts';

export const PROCESSORS: readonly ProcessorMetadata[] = [
  {
    id: 'stripe',
    name: 'Stripe',
    docsUrl: 'https://stripe.com/docs/api',
    sandboxUrl: 'https://stripe.com/docs/testing',
    step: 11,
  },
  {
    id: 'nmi',
    name: 'NMI',
    docsUrl: 'https://docs.nmi.com/',
    sandboxUrl: 'https://docs.nmi.com/docs/testing-sandbox',
    step: 12,
  },
  {
    id: 'adyen',
    name: 'Adyen',
    docsUrl: 'https://docs.adyen.com/',
    sandboxUrl: 'https://docs.adyen.com/development-resources/testing/',
    step: 12,
  },
  {
    id: 'verifone',
    name: 'Verifone (2Checkout)',
    docsUrl: 'https://docs.verifone.com/',
    sandboxUrl: 'https://www.verifone.com/development-partner',
    step: 11,
  },
  {
    id: 'braintree',
    name: 'Braintree (PayPal)',
    docsUrl: 'https://developer.paypal.com/braintree/docs',
    sandboxUrl: 'https://developer.paypal.com/braintree/help/sandboxHelp',
    step: 11,
  },
  {
    id: 'bluesnap',
    name: 'BlueSnap',
    docsUrl: 'https://developers.bluesnap.com/',
    sandboxUrl: null,
    step: 11,
  },
  {
    id: 'square',
    name: 'Square',
    docsUrl: 'https://developer.squareup.com/docs',
    sandboxUrl: 'https://developer.squareup.com/docs/testing/sandbox',
    step: 11,
  },
  {
    id: 'payoneer',
    name: 'Payoneer',
    docsUrl: 'https://developer.payoneer.com/docs/payoneer-api-reference',
    sandboxUrl: null,
    step: 12,
  },
  {
    id: 'fastspring',
    name: 'FastSpring',
    docsUrl: 'https://developer.fastspring.com/reference/api-overview',
    sandboxUrl: null,
    step: 12,
  },
  {
    id: 'paddle',
    name: 'Paddle',
    docsUrl: 'https://developer.paddle.com/',
    sandboxUrl: 'https://developer.paddle.com/sdks/sandbox/',
    step: 12,
  },
  {
    id: 'payproglobal',
    name: 'PayPro Global',
    docsUrl: 'https://developers.payproglobal.com/docs/api/overview/',
    sandboxUrl: null,
    step: 12,
  },
  {
    id: 'paypal',
    name: 'PayPal',
    docsUrl: 'https://developer.paypal.com/api/rest/',
    sandboxUrl: 'https://developer.paypal.com/sandbox-testing/overview',
    step: 11,
  },
  {
    id: 'payarc',
    name: 'Payarc / PaymentCloud',
    docsUrl: 'https://docs.payarc.net/',
    sandboxUrl: null,
    step: 11,
  },
  { id: 'rapyd', name: 'Rapyd', docsUrl: 'https://docs.rapyd.net/', sandboxUrl: null, step: 12 },
  {
    id: 'authorizenet',
    name: 'Authorize.Net',
    docsUrl: 'https://developer.authorize.net/api/reference/index.html',
    sandboxUrl: 'https://developer.authorize.net/hello_world/sandbox.html',
    step: 11,
  },
  {
    id: 'custom',
    name: 'Custom',
    docsUrl: 'docs/processors/custom.md',
    sandboxUrl: null,
    step: 12,
  },
];

export const PROCESSOR_BY_ID: Readonly<Record<ProcessorId, ProcessorMetadata>> = Object.fromEntries(
  PROCESSORS.map((p) => [p.id, p]),
) as Record<ProcessorId, ProcessorMetadata>;

/** Payment methods a routing rule can name. `card` is the only one with a secure form in STEP 10 to 12. */
export const PAYMENT_METHODS = ['card', 'wallet', 'local_methods'] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

/**
 * Script, frame and API origins of each processor's secure form (https only). Empty until the adapter sub-step has read
 * the processor's documentation and recorded the hosts in docs/processors/<id>.md; then the host is added here.
 * The payment page content security policy allows exactly these origins and nothing else.
 */
export const PROCESSOR_ORIGINS: Readonly<Partial<Record<ProcessorId, readonly string[]>>> = {};
