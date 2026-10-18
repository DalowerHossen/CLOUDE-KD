# STEP 13 - Verification record

## 13.1 Portal foundation (2026-10-18)
- `SKIP_ENV_VALIDATION=1 npx tsx --conditions=react-server scripts/verify/step13-portal.ts` -> 6 checks passed: strict request shapes (token and six-digit code), device labels, route to document type map, the code cookie (bound to the link, expires, refuses edits), every state of the one door (ok, wrong document type, invalid, expired, revoked, code needed, limited), and limiter keys that never contain the link.
- `scripts/db-apply.sh --clean`: all migrations apply and re-apply; `sql/assertions/s13_001_portal_core.sql` passes (RLS on, events are a log, one pending re-request per link, decision columns follow the status, token lookup works for an expired link and is closed to anon and authenticated).
- Not run here (needs a running app and database): the browser run of the pages (mobile 320 px, dark mode, zero analytics requests). Recorded for the sandbox run in 13.10.

## 13.2 Invoice view and payment page (2026-10-18)
- `SKIP_ENV_VALIDATION=1 npx tsx --conditions=react-server scripts/verify/step13-payment-page.ts` -> 5 checks passed: consent wording (names the refund window, stable, hashable), strict consent request (box must be true), payment page settings (15 minutes, payment CSP profile only for `/pay/`), no tracker or script tag in any portal file, token pages dynamic and not indexed.
- `scripts/db-apply.sh --clean`: `S13_002_consents` applies and re-applies; `sql/assertions/s13_002_consents.sql` passes (RLS on, consent proof is a log, hash and wording checks).
- Not run here: the browser run (mobile 320 px, dark mode, print layout, the processor form after consent) and a rendered invoice with real data; recorded for the sandbox run in 13.10.

## 13.3 Estimates, receipts and client hub (2026-10-18)
- `SKIP_ENV_VALIDATION=1 npx tsx --conditions=react-server scripts/verify/step13-estimates.ts` -> 4 checks passed: receipt checksum (stable, 16 hex, changes with the facts), strict decision request, hub open request needs a uuid, hub summary adds only open balances.
- `npx tsx scripts/verify/step13-receipt-pdf.mts` -> 2 checks passed: paid and refunded receipts render real PDF files.
- Not run here: the browser run (estimate form, hub filter, receipt print) and a signed estimate against a database; recorded for 13.10.
