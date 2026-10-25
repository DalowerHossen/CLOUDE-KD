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
export const PROCESSOR_ORIGINS: Readonly<Partial<Record<ProcessorId, readonly string[]>>> = {
  stripe: ['https://js.stripe.com', 'https://hooks.stripe.com', 'https://api.stripe.com'],
  paypal: ['https://*.paypal.com', 'https://*.paypalobjects.com'],
  square: [
    'https://sandbox.web.squarecdn.com',
    'https://web.squarecdn.com',
    'https://pci-connect.squareupsandbox.com',
    'https://pci-connect.squareup.com',
    'https://o160250.ingest.sentry.io',
    'https://square-fonts-production-f.squarecdn.com',
    'https://d1g145x70srn7h.cloudfront.net',
  ],
  authorizenet: [
    'https://js.authorize.net',
    'https://jstest.authorize.net',
    'https://*.authorize.net',
  ],
  bluesnap: ['https://sandpay.bluesnap.com', 'https://pay.bluesnap.com'],
  // Verifone: the iFrame checkout loader and the frame it opens come from the region host of the account
  // (docs/processors/verifone.md section 3).
  // NMI: sandbox browser scripts and frames; the production hosts are not confirmed (STEP 12 blockers B1, B2).
  nmi: ['https://sandbox.nmi.com'],
  // FastSpring: Checkout Components script and the store checkout frames (docs/processors/fastspring.md section 12a).
  fastspring: ['https://cdn.onfastspring.com', 'https://*.onfastspring.com'],
  // Rapyd: Checkout Toolkit script and the hosted checkout frames (docs/processors/rapyd.md section 12a).
  rapyd: [
    'https://sandboxcheckouttoolkit.rapyd.net',
    'https://sandboxcheckout.rapyd.net',
    'https://checkouttoolkit.rapyd.net',
    'https://checkout.rapyd.net',
  ],
  // Adyen: Web Drop-in script and stylesheet (docs/processors/adyen.md section 12a); the hosts Drop-in itself calls are
  // not documented on the pages read (open question 1).
  adyen: [
    'https://checkoutshopper-test.cdn.adyen.com',
    'https://checkoutshopper-live.cdn.adyen.com',
  ],
  // PayArc: sandbox Hosted Fields script and frames; the production hosts are not documented (STEP 11 blocker B3).
  payarc: ['https://testportal.payarc.net', 'https://testapi.payarc.net'],
  verifone: [
    'https://cst.test-gsc.vfims.com',
    'https://uscst-gb.gsc.vficloud.net',
    'https://emea.gsc.verifone.cloud',
    'https://us.gsc.verifone.cloud',
    'https://nz.gsc.verifone.cloud',
  ],
  braintree: [
    'https://js.braintreegateway.com',
    'https://*.braintreegateway.com',
    'https://*.braintree-api.com',
  ],
};

/**
 * Processors whose secure card form exists in code (components/payment/processors/<id>/). A processor without one cannot be
 * enabled and is never offered at checkout, because the payer would see an error instead of a card form. The list is kept in
 * step with components/payment/processors/index.generated.ts by scripts/verify/step16-secure-forms.ts.
 */
export const PROCESSORS_WITH_SECURE_FORM: readonly ProcessorId[] = [
  'stripe',
  'adyen',
  'authorizenet',
  'bluesnap',
  'braintree',
  'custom',
  'fastspring',
  'payarc',
  'paypal',
  'payproglobal',
  'rapyd',
  'square',
  'verifone',
];

export function hasSecureForm(id: ProcessorId): boolean {
  return PROCESSORS_WITH_SECURE_FORM.includes(id);
}
