// path: lib/i18n/strings/en/s10-payments.ts
// Strings of the payment screens (STEP 10). English only.
export const strings = {
  nav: {
    review: 'Payment review',
    webhooks: 'Webhook deliveries',
    payments: 'Payments',
    gateway: 'Payment overview',
  },
  review: {
    title: 'Payment review',
    description:
      'These payments were authorized but not captured because the postal code or the country did not match the invoice. Capture or void each one. A payment that is not decided is voided when its hold ends.',
    loadError: 'The review queue could not be loaded.',
    empty: 'No payments are waiting for review.',
    columns: {
      company: 'Company',
      invoice: 'Invoice',
      amount: 'Amount',
      reasons: 'Why it is held',
      hold: 'Decide before',
      processor: 'Processor',
    },
    note: 'Note for the record',
    noteHelp: 'Required when you void. It is saved in the audit log.',
    capture: 'Capture',
    void: 'Void',
    blockCard: 'Also put the card on the blocked list',
    done: 'Decision saved.',
    failed: 'The decision could not be saved.',
    needStepUp: 'Confirm your identity above first (password and code), then try again.',
    reasons: {
      postal_code_mismatch: 'The billing postal code does not match the invoice.',
      postal_code_missing: 'No billing postal code could be checked.',
      ip_country_mismatch: 'The payer is in a different country than the invoice billing address.',
      ip_country_unknown: 'The country of the payer could not be determined.',
      invoice_data_missing: 'The invoice has no billing postal code or country to compare with.',
    },
    blocked: {
      title: 'Blocked cards',
      empty: 'No cards are blocked.',
      remove: 'Unblock',
      reason: 'Reason',
      source: 'Source',
    },
  },
  webhooks: {
    title: 'Webhook deliveries',
    description:
      'Messages from payment processors. A delivery whose signature is wrong is refused and never listed. A failed delivery is tried again by itself; after the last attempt it waits here in the dead-letter list.',
    loadError: 'The webhook deliveries could not be loaded.',
    empty: 'No deliveries to show.',
    filterAll: 'All',
    columns: {
      time: 'Received',
      processor: 'Processor',
      type: 'Type',
      status: 'Status',
      attempts: 'Attempts',
      error: 'Problem',
    },
    statuses: {
      received: 'Received',
      processed: 'Processed',
      failed: 'Will retry',
      dead_letter: 'Dead letter',
      ignored: 'No action needed',
    },
    retry: 'Process again',
    retried: 'The delivery was processed again. New state: {status}.',
    failed: 'The action could not be completed.',
    needStepUp: 'Confirm your identity above first (password and code), then try again.',
  },
} as const;
