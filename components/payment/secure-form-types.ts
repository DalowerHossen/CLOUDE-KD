// path: components/payment/secure-form-types.ts
// The contract between the hosted checkout (STEP 10) and the secure form of each processor (STEP 11 and 12).
// A secure form is a React component in components/payment/processors/<id>/index.tsx with a default export of type
// SecureFormComponent. Rules for every secure form (checked by scripts/check-no-pan.sh and review):
//  - card number, expiry and security code are typed only inside the processor's own fields (hosted fields, iframe or
//    redirect); this code never reads, stores, logs or forwards them;
//  - no key press tracking, no analytics, no behaviour scripts;
//  - the only thing handed back is the processor's single-use payment token.
import type { ComponentType } from 'react';

export interface SecureFormProps {
  /** Public data from the processor session (client token, public key, session id). Never a secret. */
  clientConfig: Readonly<Record<string, string>>;
  /** The processor mode in use, for example "collectjs" or "payment_component". */
  mode: string;
  environment: 'sandbox' | 'live';
  /** Text for the pay button, for example "Pay USD 120.00". */
  submitLabel: string;
  disabled: boolean;
  /** Called with the processor's payment token when the payer submitted the secure form. */
  onToken: (paymentToken: string) => void;
  /** Called with a message that is safe to show when the form cannot continue. */
  onError: (message: string) => void;
  /** Set when the processor asked for a challenge in the page (3D Secure inside an SDK). */
  challenge: { clientSecret: string | null } | null;
  /** Called when the in-page challenge is finished (successfully or not); the checkout then asks the server. */
  onChallengeDone: () => void;
}

export type SecureFormComponent = ComponentType<SecureFormProps>;
export type SecureFormLoader = () => Promise<{ default: SecureFormComponent }>;
