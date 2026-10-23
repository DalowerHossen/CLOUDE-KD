// path: lib/i18n/strings/en/s16-automation.ts
// Strings of the automation tools page (STEP 16). English only.
export const strings = {
  nav: { automation: 'Automation tools' },
  common: { loadError: 'The data could not be loaded. Try again.' },
  title: 'Automation tools',
  description:
    'Connect Zapier or Make, or use the browser extension. They all use an API key of this platform, so they can do only what the key allows.',
  connect: {
    title: 'How to connect',
    keys: 'Make an API key on the Developers page. Give it only the scopes you need (listed below for each trigger and action).',
    address: 'The address of the API',
    auth: 'Send the key as a bearer token: Authorization: Bearer <key>. Zapier and Make connections use the API key method; OAuth 2.0 sign-in is not available.',
    sandbox:
      'A sandbox key works on test data only. Writes through the API work with sandbox keys only for now.',
  },
  triggers: {
    title: 'Triggers',
    help: 'A trigger returns the latest events, newest first, each with a stable id. Poll it, or subscribe a hook URL to be called when the event happens (the call is signed like any webhook).',
    columns: { name: 'Trigger', scope: 'Key scope', poll: 'Poll address', event: 'Hook event' },
    names: {
      'invoice-paid': 'Invoice paid',
      'client-created': 'New client',
      'payment-received': 'Payment received',
      'estimate-approved': 'Estimate approved',
    },
  },
  actions: {
    title: 'Actions',
    help: 'Zapier and Make actions call the ordinary endpoints of the API.',
    columns: { name: 'Action', call: 'Call', scope: 'Key scope' },
    createClient: 'Create client',
    createInvoice: 'Create invoice (draft)',
    createEstimate: 'Create estimate (draft)',
    paymentNote: 'Record a payment note',
    sendInvoice: 'Send invoice',
    notAvailable: 'Not available yet: the invoices service has no send operation for keys.',
    sandboxOnly: 'Sandbox keys only for now.',
  },
  hooks: {
    title: 'Hooks made by Zapier and Make',
    empty: 'No hooks yet. They appear here when you turn on a Zap or a Make scenario.',
    columns: {
      source: 'Tool',
      url: 'Address',
      events: 'Event',
      state: 'State',
      failures: 'Failed in a row',
    },
    sources: { zapier: 'Zapier', make: 'Make' },
    states: { active: 'Active', paused: 'Paused', disabled: 'Switched off' },
    manage: 'Open the webhook page to test, pause or remove a hook.',
  },
  extension: {
    title: 'Browser extension',
    help: 'The extension shows an invoice summary, finds clients and makes a draft invoice. Its source is in the project. Build it for this platform and load it in the browser.',
    step1: 'Run: npx tsx lib/integrations/chrome/build.ts {origin} ./dist/kd-extension',
    step2:
      'Open chrome://extensions, turn on developer mode, choose "Load unpacked" and pick the folder.',
    step3:
      'Open the extension and paste an API key with the scopes read:clients, read:invoices and write:invoices.',
    notBuilt:
      'Not available: a timer, copying a payment link, a download as a zip file, store publishing and automatic updates.',
  },
} as const;
