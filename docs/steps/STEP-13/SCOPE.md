# STEP 13 - Client Portal, Contracts and Disputes

Wave D. Depends on: STEP 01 to 05, STEP 09 (invoices and pdf contracts), STEP 10 (payments contract and checkout slot). Contract use: tokens, invoices, clients, payments, pdf, storage, email, security, audit, events. Provides: portal pages and dispute services.

## Feature sources
- Part 5 lines 2013-2338 (A tokens usage, B client pages, C client emails, D tenant branding, E white-label and custom domain, F form safety, G integrity, approval, e-signature and bulk email, H owner-only send, I collection UX, J presets, K lifecycle, L data cleanliness)
- Part 4 lines 1695-1716 (C3 receipts, C4 refunds: client side), 1869-1932 (H chargeback, evidence pack, prevention; I consent, delivery proof, audit chain)
- Part 6 lines 2701-2728 (H contracts and e-signature)
- Part 9 lines 3907-3918 (F token and link safety: page side)
- Part 11 lines 4778-4804 (J chargeback and refund documentation)
- MASTER_PROMPT: chargeback and refund evidence system; security layer 8

## Owned paths and migrations
OWNERSHIP_MAP.md rows 13 and section 4. Migration block `S13_*`.

## Sub-steps
- 13.1 Portal foundation: `(client-portal)` routes `/i/[token]`, `/pay/[token]`, `/e/[token]`, `/r/[token]`, `/hub/[token]`, `/c/[token]`, `/expired`; token verify through the tokens contract; `noindex`; OTP gate; no analytics; token masking; re-request page; revocation display; rate limits; view events with IP and device (not on card fields).
- 13.2 Invoice view and payment page: invoice display, PDF download, payment method selection, embeds the STEP 10 checkout slot, shows refund policy and consent checkbox capture (timestamp, IP, device, terms version, exact text snapshot), messages for review-pending and blocked payments, no tracking scripts.
- 13.3 Estimates and receipts: estimate approve or decline with note, receipt page and receipt PDF (`lib/pdf/receipt-pdf.tsx`), client hub (all invoices, statements).
- 13.4 Client emails: invoice, reminder, receipt, estimate, overdue, thank you and other client templates in `emails/client/`, forward-leak warning, delivery tracking views for the owner.
- 13.5 Tenant branding application: logo, colors, fonts, footer applied to portal, emails, PDFs; white-label removal of platform marks by plan; custom domain serving for portal routes.
- 13.6 Contracts and e-signature: contract templates, send, sign (typed, drawn, uploaded), signing evidence (hash, IP, device, timestamp), archive via storage contract, reminders.
- 13.7 Owner workflows: owner-only send gate, approval workflow integration for staff-created documents, bulk email workflow with safeguards, collection UX (promise to pay, dispute note), document presets, lifecycle states, data cleanliness checks.
- 13.8 Disputes: chargeback intake from payment webhooks (events), case record, deadline tracker and alerts, status workflow, reason code mapping hooks through adapters, refund request workflow (client to owner to approve to process), win/loss analytics.
- 13.9 Evidence pack generator (`services/evidence`, `lib/pdf/evidence-pack-pdf.tsx`): invoice snapshot, receipt, consent proof, delivery proof, communication log, client identity data (IP, device, geo, 3DS proof), timeline, audit chain proof with hashes, platform details; download as PDF and ZIP, processor-specific format through the adapter `evidenceFormat` hook, 18-month encrypted retention through the storage contract, admin and owner pages.
- 13.10 Nav and permission fragments, i18n strings, email templates.

## Security notes
Token pages are the only unauthenticated surface with data: constant-time token checks, uniform not-found replies, strict CSP profile for payment page, no third-party scripts besides the processor's. Evidence packs contain no card data.

## Verification
Token tamper rejected; expired link shows re-request page; revoked link dead; OTP gate works; payment page has zero analytics requests; consent record complete; estimate approval changes status; evidence pack from a seeded dispute includes all nine listed sections and its hash appears in the audit chain; mobile 320 px.

## Handoff must list
Routes, event names consumed and published, evidence pack sections, retention settings.
