// path: config/s13-portal.ts
// Settings of the client portal (STEP 13). One home for every number and version the portal pages use.

/** Version of the wording the payer accepts before paying; change it whenever the text in `s13Portal.consent` changes. */
export const CLIENT_CONSENT_VERSION = '2026-10-18';

/** A payment page that stays open this long must be opened again (FEATURE_LIST 1741). */
export const PAYMENT_PAGE_TIMEOUT_MINUTES = 15;

/** How long a payment link made from the invoice page stays valid, in hours. */
export const PORTAL_PAY_LINK_HOURS = 2;

/** How long an invoice link opened from the client hub stays valid, in days. */
export const HUB_OPEN_LINK_DAYS = 7;

/** Days to answer a dispute when the processor did not tell us the date. The owner can enter the real date. */
export const DISPUTE_RESPONSE_DAYS = 7;

/** The owner is alerted this many hours before a dispute answer is due (and again when it is overdue). */
export const DISPUTE_ALERT_HOURS = [72, 24] as const;
