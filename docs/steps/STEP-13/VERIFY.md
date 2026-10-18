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

## 13.4 Client emails (2026-10-18)
- `SKIP_ENV_VALIDATION=1 npx tsx scripts/verify/step13-emails.ts` -> 5 checks passed: nine client templates in the platform catalogue, ids tracked, every template renders with the forward warning exactly when it holds a link, subject variables declared and USD only, sender note shown only when given.
- `scripts/db-apply.sh --clean`: `S13_003_delivery_proofs` applies; `sql/assertions/s13_003_delivery_proofs.sql` passes (RLS on, append only, one proof per message, hash and document type checks).
- Not run here: a real send through a mail provider and the delivery events coming back; the owner page in a browser; recorded for the sandbox run in 13.10.

## 13.5 Tenant branding (2026-10-18)
- `SKIP_ENV_VALIDATION=1 npx tsx --conditions=react-server scripts/verify/step13-branding.ts` -> 6 checks passed: contrast maths (black on white 21), light colours refused and dark ones accepted, hex to token conversion and readable text colour, only the four safe fonts (no URL in any stack), branded pages are light and carry the brand colours, strict save, import and export shapes.
- `scripts/db-apply.sh --clean`: `S13_004_branding` applies; `sql/assertions/s13_004_branding.sql` passes (RLS on, one row per company, colour format, history is a log).
- Not run here: the host lookup against a database (a verified domain resolves, a pending or removed one does not), the branded pages and the editor in a browser, an e-mail with the brand colours; recorded for 13.10.

## 13.6.a Contracts (2026-10-18)
- `SKIP_ENV_VALIDATION=1 npx tsx --conditions=react-server scripts/verify/step13-contracts.ts` -> 7 checks passed: status machine (forward only, four final states), contract number format, merge fields (escaping, missing and unknown names), the four pre-built templates use only known fields and no script, strict contract, update, send, void and template requests (dates, duplicate signer e-mail, amount format, plain-text title).
- `scripts/db-apply.sh --clean`: `S13_005_contracts` applies; `sql/assertions/s13_005_contracts.sql` passes (RLS on, numbers from one sequence, a sent contract needs its hash, status list, end not before start, one signer per e-mail, versions and events are logs, `kd_contract_save` creates, edits, replaces signers, counts versions, refuses a stale save and a sent contract).
- `step13-emails.ts` now covers eleven client templates (contract invitation and reminder added).
- Not run here: a real send (token, one-time code, mail), the daily job against real data, and the contract pages in a browser; recorded for the sandbox run in 13.10.

## 13.6.b Signing page and evidence (2026-10-18)
- `SKIP_ENV_VALIDATION=1 npx tsx --conditions=react-server scripts/verify/step13-esign.ts` -> 5 checks passed: the seal verifies and breaks when the file, the wording, a signature, the signature order or the key changes; the statement checksum is stable; a real picture is accepted and re-drawn as a PNG within 600 by 200; text with a picture name, a PNG header with junk, bad base64 and an oversized file are refused; the signing and decline requests are strict (accept box, picture tied to the method, checksum format, no markup in the name).
- `npx tsx scripts/verify/step13-signed-pdf.mts` -> 2 checks passed: a short and a 120 clause contract with a typed and a drawn signature render real PDFs.
- `scripts/db-apply.sh --clean`: `S13_006_signatures` applies; `sql/assertions/s13_006_signatures.sql` passes (signing out of turn, a wrong checksum, a drawn signature without a picture, a second signature, signing a closed contract, editing or deleting evidence are all refused; the first of two signers gives `partly_signed`, the last gives `signed` with its time; a decline ends the contract and cannot be repeated).
- `step13-emails.ts` now covers twelve client templates (signed copy added).
- Not run here: the signing page in a browser (drawing on a touch screen, upload, the one-time code), the real PDF with a stored picture through Drive or Supabase Storage, and the daily job; recorded for the sandbox run in 13.10.
