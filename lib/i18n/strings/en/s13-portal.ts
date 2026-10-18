// path: lib/i18n/strings/en/s13-portal.ts
// Strings of the client portal pages (STEP 13). English only.
export const strings = {
  state: {
    invalidTitle: 'This link is not available',
    invalidBody:
      'The link may be mistyped or it is no longer valid. Please ask the sender for a new link.',
    revokedTitle: 'This link has been revoked',
    revokedBody: 'The sender turned this link off. Please ask the sender for a new link.',
    limitedTitle: 'Too many requests',
    limitedBody: 'Please wait a minute and try again.',
    expiredTitle: 'This link has expired',
    expiredBody:
      'For your safety, links stop working after some time. You can ask the sender for a new link.',
    expiredAction: 'Ask for a new link',
    expiredSent:
      'Your request was sent. If the sender approves it, a new link is sent to the address they have on file.',
    expiredFailed: 'The request could not be sent. Please try again later.',
    expiredPageTitle: 'This link is not available',
    expiredPageBody:
      'Open the link from the message you received. If it no longer works, ask the sender for a new one.',
  },
  otp: {
    title: 'Enter your code',
    body: 'This document is protected. We send a six-digit code to the email address the sender has on file.',
    send: 'Send me a code',
    resend: 'Send a new code',
    sent: 'If a code could be sent, it is on its way. It is valid for five minutes.',
    codeLabel: 'Six-digit code',
    verify: 'Open document',
    wrong: 'That code did not work. Check it and try again, or ask for a new one.',
    failed: 'Something went wrong. Please try again.',
  },
  view: {
    unavailableTitle: 'This page is not available yet',
    unavailableBody: 'Please ask the sender for a link to a document.',
  },
} as const;
