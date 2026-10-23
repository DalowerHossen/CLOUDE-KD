// path: lib/i18n/strings/en/s16-ocr.ts
// Strings of the receipt OCR page (STEP 16). English only.
export const strings = {
  nav: { ocr: 'Receipt OCR' },
  common: {
    loadError: 'The data could not be loaded. Try again.',
    done: 'Saved.',
    failed: 'The action failed. Try again.',
    needStepUp:
      'Confirm it is you first with the box on the account security page, then try again.',
  },
  title: 'Receipt OCR',
  description:
    'Read vendor, date, total and tax from receipt photos with Google Cloud Vision. The fields are offered as suggestions on the expense form; you decide what to keep.',
  settings: {
    title: 'Settings',
    privacy:
      'Switching this on sends the images of your receipts to Google Cloud Vision, with the API key you give here. Google chooses the region that processes them. The text of a receipt is not stored here, only the four fields.',
    enabled: 'Read receipts automatically',
    apiKey: 'Google API key (leave empty to keep the saved key)',
    keySaved: 'A key ending in {last4} is saved.',
    noKey: 'No key is saved.',
    dateOrder: 'When a date is written 03/04/2026, the day comes',
    dmy: 'first (3 April)',
    mdy: 'second (4 March)',
    languages: 'Languages on the receipts (codes separated by semicolons, empty for automatic)',
    dailyLimit: 'Most receipts to read in 24 hours',
    consent: 'I agree that receipt images are sent to Google Cloud Vision',
    consentGiven: 'Consent given on {date}.',
    save: 'Save the settings',
    saved: 'The settings were saved.',
    onlyImages: 'Only JPEG and PNG images are read. PDF files are not read; enter those by hand.',
  },
  jobs: {
    title: 'Receipts',
    empty: 'No receipts have been read yet.',
    columns: {
      receipt: 'Receipt',
      state: 'State',
      vendor: 'Vendor',
      date: 'Date',
      total: 'Total',
      tax: 'Tax',
    },
    states: { queued: 'Waiting', processing: 'Reading', done: 'Read', failed: 'Not read' },
    check: 'check',
    corrected: 'corrected',
    retry: 'Read again',
    correctTitle: 'Correct the fields',
    correctHelp: 'Change what is wrong and save. The corrected fields count as fully sure.',
    save: 'Save the correction',
    corrections: 'Saved. The expense form offers the corrected values.',
  },
} as const;
