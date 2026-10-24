// path: lib/i18n/strings/en/s16-compliance.ts
// Strings of the compliance page (country restrictions and sanctions lists). English only.
export const strings = {
  nav: { compliance: 'Country and sanctions' },
  common: {
    failed: 'The action failed. Try again.',
    needStepUp:
      'Confirm it is you first with the box on the account security page, then try again.',
    done: 'Done.',
    loadError: 'The data could not be loaded. Try again.',
  },
  page: {
    title: 'Compliance',
    description:
      'Switch a country off when a United Nations Security Council measure or another legal duty requires it, and see which sanctions lists are loaded for KYC screening.',
    countriesTitle: 'Country restrictions',
    countriesHelp:
      'Block refuses every request from the country. Review keeps the service open but makes KYC screening report a match for a person from that country. The platform does not read United Nations notices by itself: record the measure here with its reference.',
    empty: 'No country is restricted.',
    country: 'Country',
    mode: 'Mode',
    source: 'Source',
    reference: 'Reference',
    reason: 'Reason',
    state: 'State',
    on: 'On',
    off: 'Off',
    modes: { block: 'Block', review: 'Review' },
    sources: { un_security_council: 'UN Security Council', manual: 'Manual' },
    turnOn: 'Turn on',
    turnOff: 'Turn off',
    remove: 'Remove',
    changed: 'Saved.',
    removed: 'Removed.',
    addTitle: 'Add a country',
    countryCode: 'Country code (two letters, for example KP)',
    referenceHelp: 'Resolution or notice number (optional)',
    reasonHelp: 'Why (at least 10 characters)',
    add: 'Add country',
    sanctionsTitle: 'Sanctions lists',
    sanctionsHelp:
      'KYC screening checks the company name and every owner against these lists when a review starts. A list is loaded through the import route (see docs/compliance/sanctions.md).',
    list: 'List',
    entries: 'Entries',
    importedAt: 'Imported',
    note: 'Note',
    notLoaded: 'Not loaded',
    lists: { ofac: 'OFAC (United States)', un: 'United Nations Security Council' },
  },
} as const;
