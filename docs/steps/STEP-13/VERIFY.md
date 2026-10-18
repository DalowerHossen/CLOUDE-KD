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

## 13.7 Owner workflows (2026-10-18)
- `SKIP_ENV_VALIDATION=1 npx tsx --conditions=react-server scripts/verify/step13-owner.ts` -> 6 checks passed: the link-request decision (a denial needs a reason, nothing extra), the client page of every document type (unknown types go to the expired page), the bulk safeguards (confirmed number 1 to 100, no extra fields), the reminder windows, the staff-through-owner chain (approval rule L1, permissions and roles, no duplicate permission), the notice worker events and the cron schedules.
- `scripts/db-apply.sh --clean`: `S13_007_owner_workflows` applies; `sql/assertions/s13_007_owner_workflows.sql` passes (denial reason kept and limited, a contract holds its send request, the two new log kinds work and others are refused).
- Not run here: the approval flow end to end (staff ask, owner approves, the job sends), the payment event worker with a real payment, and the owner pages in a browser; recorded for the sandbox run in 13.10.

## 13.8 Disputes (2026-10-18)
- `SKIP_ENV_VALIDATION=1 npx tsx --conditions=react-server scripts/verify/step13-disputes.ts` -> 5 checks passed: the status machine (forward only, four final states, no re-opening), reason sorting by keyword and the adapter hook (a mapper belongs to one processor and falls back to keywords), the alert schedule (72 hours, 24 hours, overdue, each once, nothing too early), the default answer window, the event worker and the hourly job.
- `scripts/db-apply.sh --clean`: `S13_008_disputes` applies; `sql/assertions/s13_008_disputes.sql` passes (RLS on, one case per processor event and per processor dispute, a closed status needs a closing time, status and reason lists, evidence and history are logs, a file item needs a file, one waiting refund request per payment and a new one after a denial).
- Not run here: a seeded `dispute.opened` event through the real event bus (the intake worker is tested only through its building blocks), the alert job against real cases, a refund approval through a processor, and the pages in a browser; recorded for the sandbox run in 13.10.

## 13.9.a Evidence pack generator (2026-10-18)
- `SKIP_ENV_VALIDATION=1 npx tsx --conditions=react-server scripts/verify/step13-evidence.ts` -> 4 checks passed: exactly nine sections in a fixed order; an empty pack lists only invoice and platform, a full one lists all nine; the timeline is in time order and keeps the order of equal times; the built timeline joins every source (invoice, e-mail with open events, portal views, consent, payment, refund, dispute) in order and ends with the dispute.
- `npx tsx scripts/verify/step13-evidence-pdf.mts` -> 2 checks passed: a pack with every section filled (80 timeline events, 30 audit entries) and a pack with every section empty both render real PDFs.
- Not run here: `collectEvidence` against a seeded dispute in a database with real payments, consent and audit rows (it needs the API layer on top of the database); recorded for the sandbox run in 13.10.

## 13.9.b Evidence pack storage, ZIP, retention and pages (2026-10-18)
- `SKIP_ENV_VALIDATION=1 npx tsx --conditions=react-server scripts/verify/step13-evidence-packs.ts` -> 6 checks passed: CRC-32 equals the standard check value; a ZIP of three files (one empty) is read back byte for byte by an independent reader; python's `zipfile` accepts the ZIP and its checksums; names that climb out of the archive, absolute paths, hidden names, repeats, too long names and an empty list are refused; the facts for the processor adapter hold the invoice, receipt, consent with address, policy, delivery, identity and timeline but no card-like number or card identity; the retention promise is at least 18 months.
- `scripts/db-apply.sh --clean`: `S13_009_evidence_packs` applies; `sql/assertions/s13_009_evidence_packs.sql` passes (RLS on, one row per version of a dispute, checksum format, a stored pack cannot be changed or deleted).
- Not run here: making a pack for a seeded dispute end to end (collect, store through the storage service, audit record, download with the checksum check) and finding the pack checksum in the audit chain with `audit.verifyChain`; both need the running application with a database and storage; recorded for the sandbox run in 13.10.

## 13.10 Closure: the whole STEP (2026-10-18)
- All STEP 13 verification scripts, run together: `step13-portal` 6, `step13-payment-page` 5, `step13-estimates` 4, `step13-receipt-pdf` 2, `step13-emails` 5, `step13-branding` 6, `step13-contracts` 7, `step13-esign` 5, `step13-signed-pdf` 2, `step13-owner` 6, `step13-disputes` 5, `step13-evidence` 4, `step13-evidence-pdf` 2, `step13-evidence-packs` 6 -> 65 checks, all passed.
- `scripts/db-apply.sh --clean`: migrations `S13_001` to `S13_009` apply in order on top of STEPs 01 to 12, and all nine STEP 13 assertion files pass.
- `npm run lint` (no warnings), `npx tsc --noEmit` and `bash scripts/check-all.sh` (English only, no tests, no TODO, path comments, no `any`, no console, no card numbers, no brand names, money, secrets, migrations, dead links) pass.
- `SKIP_ENV_VALIDATION=1 npx next build` succeeds; the build lists the client pages, the owner pages, the admin page and the routes of this STEP.
- `node scripts/check-ownership.mjs 13 HEAD <commit before 13.1>` lists only: the generated barrels (regenerated by `npm run gen`, as earlier STEPs did), `emails/catalog.ts` (the one catalogue line STEP 05 asks every STEP to add), and paths no ownership row covers yet (`app/(dashboard)/client-mail/**`, `config/s13-portal.ts`, `workers/s13/**`); request R8 asks for those rows. The portal layout change was taken back out of `app/(client-portal)/layout.tsx` (STEP 01) and put in `components/client/branded-portal-layout.tsx`; R8 also asks the Integrator to use it.
- Runtime check attempted: the built application was started with throw-away settings and no database. Every request, including `/expired` and a wrong API call, was answered "blocked" (HTTP 403) by the security gate, which refuses requests when its checks cannot run. This shows the gate fails closed; it does not check the pages. The browser run is therefore still open: 320 px layout, dark mode and print of each client page, the code-then-sign flow with real mail, a real payment through the portal checkout, the approval flows end to end, the event workers with real events, and an evidence pack for a seeded dispute with `audit.verifyChain`. It needs the sandbox environment with the database, storage and a mail account (credentials are never put in chat; the person who runs it supplies them in the environment).
