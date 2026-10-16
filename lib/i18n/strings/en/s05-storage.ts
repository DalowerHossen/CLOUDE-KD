// path: lib/i18n/strings/en/s05-storage.ts
// Strings of STEP 05: storage, e-mail and notifications.
export const strings = {
  nav: {
    notifications: 'Notifications',
    storageSettings: 'Storage',
    emailSettings: 'E-mail',
    adminStorage: 'Storage health',
    adminEmails: 'E-mail templates',
  },
  storage: {
    title: 'File storage',
    description:
      'Your files are encrypted before they are stored. They go to your own Google Drive when it is linked, otherwise to the encrypted platform storage.',
    loadError: 'The storage data could not be loaded.',
    providerTitle: 'Where new files go',
    providerDrive: 'Your Google Drive',
    providerSupabase: 'Platform storage',
    filesOnDrive: '{count} file(s) in Google Drive',
    filesOnSupabase: '{count} file(s) in platform storage',
    usageTitle: 'Storage use',
    usageText: '{used} of {quota} used',
    monthlyText: 'Upload volume this month is limited to {limit}.',
    quota80: 'Your storage is more than 80 percent full.',
    quota95: 'Your storage is almost full. New uploads will be refused at 100 percent.',
    quota100: 'Your storage is full. Delete files or upgrade the plan.',
    driveTitle: 'Google Drive',
    driveUnavailable: 'Google Drive linking is not set up on this platform yet.',
    driveNone: 'Google Drive is not linked.',
    driveConnected: 'Linked to {email}.',
    driveConnectedNoEmail: 'Linked.',
    driveError:
      'Google Drive is not reachable right now. New files go to the platform storage until it works again.',
    driveRevoked: 'The Google link was revoked. Link Drive again to use it.',
    driveQuota: 'Google Drive space: {used} of {limit}.',
    driveHelp:
      'The platform only gets access to files it creates itself, inside the folder tenants/{company}/ of your Drive. Files are saved encrypted; Google cannot read them.',
    connect: 'Link Google Drive',
    reconnect: 'Link again',
    disconnect: 'Unlink Google Drive',
    disconnectForce: 'Unlink anyway',
    disconnectWarning:
      'Files that are still in Google Drive cannot be opened after unlinking. Move them first, or unlink anyway.',
    connectedNotice: 'Google Drive is linked.',
    cancelledNotice: 'Linking was cancelled.',
    failedNotice: 'Google Drive could not be linked. Please try again.',
    errorNotice: 'Something went wrong while linking Google Drive.',
    working: 'Working...',
    genericError: 'Something went wrong. Please try again.',
  },
} as const;
