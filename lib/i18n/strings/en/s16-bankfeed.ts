// path: lib/i18n/strings/en/s16-bankfeed.ts
// Strings of the bank feed pages (STEP 16.7). English only.
export const strings = {
  nav: { bankfeed: 'Bank feed' },
  common: {
    loadError: 'The data could not be loaded. Try again.',
    done: 'Done.',
    failed: 'The action failed. Try again.',
    needStepUp:
      'Confirm it is you first with the box on the account security page, then try again.',
    none: '-',
  },
  providers: { plaid: 'Plaid', saltedge: 'Salt Edge' },
  page: {
    title: 'Bank feed',
    description:
      'Link your bank through Plaid or Salt Edge. New bank lines arrive by themselves and wait in the reconciliation page, where matches are suggested.',
    reconcile: 'Open the reconciliation page',
    empty: 'No bank link yet.',
    connectTitle: 'Add a bank link',
    provider: 'Service',
    name: 'Name to show here',
    plaidHelp:
      'Use your own Plaid account: paste its client id and its secret (sandbox is for tests). The bank is linked in a window that Plaid hosts.',
    saltedgeHelp:
      'Use your own Salt Edge account: paste its App id and its Secret. A private key is needed for a Live account (the platform signs its requests with it). The bank is linked in the Salt Edge window.',
    clientId: 'Client id',
    secret: 'Secret',
    environment: 'Environment',
    environments: { sandbox: 'Sandbox (tests)', production: 'Production' },
    countries: 'Country codes of the banks (separate with semicolons)',
    appId: 'App id',
    privateKey: 'Private key (PEM, optional)',
    connect: 'Save the keys',
    columns: {
      name: 'Name',
      bank: 'Bank',
      state: 'State',
      synced: 'Last sync',
    },
    states: {
      new: 'Not linked yet',
      linking: 'Linking',
      active: 'Active',
      needs_reauth: 'Log in again',
      disconnected: 'Disconnected',
      error: 'Problem',
    },
    link: 'Link the bank',
    relink: 'Log in again',
    linkOpen: 'Open the bank window',
    linkNote:
      'The window opens at the service. When you are done, come back here; the platform is told by the service.',
    finish: 'I finished linking',
    finishedNo: 'The service did not report a result yet. Wait a moment and try again.',
    finishedYes: 'The bank is linked.',
    sync: 'Fetch lines now',
    synced: 'The lines were fetched.',
    disconnect: 'Disconnect',
    disconnected: 'The bank link was disconnected.',
    saltedgeRemoveNote:
      'Salt Edge is not told by the platform yet. Remove the connection in the Salt Edge dashboard as well.',
    callbackTitle: 'Callback address for Salt Edge',
    callbackHelp:
      'Paste this address on the Callbacks page of the Salt Edge dashboard (success, fail, notify, destroy and consent status). Salt Edge signs every callback.',
    accountsTitle: 'Accounts of this link',
    accountsEmpty: 'No account was reported yet.',
    accountColumns: {
      name: 'Account',
      mask: 'Number',
      book: 'Bank account of the books',
      last: 'Last lines',
    },
    notMapped: 'Not mapped',
    usdOnly: 'Only USD accounts can be mapped.',
    mapSave: 'Save',
    mapDone: 'The mapping was saved.',
    mapNote:
      'Lines of an account that is not mapped are not kept. When you map an account, its history is fetched again.',
    noBookAccounts: 'Make a bank account in the accounting pages first.',
  },
} as const;
