# STEP 13 - Sub-steps plan

Branch: `claude/clever-goldberg-8ncdae`, continued from the end of STEP 12 (STEPS 02 to 12 are not on `origin/integration` yet, so the branch is the only place where the contracts this STEP uses exist). Migration block `S13_*`. Every sub-step ends with lint, typecheck, `scripts/check-all.sh`, `scripts/db-apply.sh --clean` (when it has a migration), `scripts/run-assertions.sh s13` and its own `scripts/verify/step13-*.ts`. FEATURE_LIST ranges: Part 5 2013-2338; Part 4 1695-1716, 1869-1932; Part 6 2701-2728; Part 9 3907-3918; Part 11 4778-4804. Each sub-step reads its exact lines first.

Security checks for all sub-steps: Z1 to Z14 of STEP_PROTOCOL section 6. Token pages are the only unauthenticated surface with data: constant-time checks, uniform not-found replies, no third-party scripts (payment page: only the processor's), no card data anywhere, evidence packs without card data.

Contracts consumed (all present in `types/contracts/`): tokens, invoices, clients, payments, pdf, storage, email, notification, security, audit, events, consent, approval, permissions, tenant, encryption, jobs. Provided: none new (portal pages and dispute services); the services are registered in `services/{portal,contract,esign,dispute,evidence,branding}/register.ts`.

## 13.1 Portal foundation
- Goal: `(client-portal)` routes `/i/[token]`, `/pay/[token]`, `/e/[token]`, `/r/[token]`, `/hub/[token]`, `/c/[token]`, `/expired`; token verification through the tokens contract; uniform not-found; `noindex`; OTP gate; no analytics; token masking in logs; re-request page; revocation display; per-IP and per-token rate limits; `portal_events` (view, otp, rerequest) with IP and device, never on card fields.
- Files: `migrations/S13_001_portal_core.sql` (+ `_down`; `portal_events`, `consent_records`, `delivery_proofs`), `sql/assertions/s13_001_portal_core.sql`, `services/portal/{access,events,rate,register}.ts`, `app/(client-portal)/{i,pay,e,r,hub,c,expired}/**` shells, `app/api/portal/{otp,rerequest}/**`, `components/client/{otp-gate,expired-card,token-frame}.tsx`, `scripts/verify/step13-portal.ts`.
- Done when: tampered token rejected with the same reply as unknown; expired token shows the re-request page; revoked token dead; OTP gate blocks until verified; view events stored with IP and device.

## 13.2 Invoice view and payment page
- Goal: invoice display, PDF download, method selection, the STEP 10 checkout slot embedded, refund policy text and consent capture (timestamp, IP, device, terms version, exact text snapshot) before payment, messages for review-pending and blocked payments, zero tracking scripts, strict CSP profile for the payment page.
- Files: `services/portal/{invoice-view,consent-capture}.ts`, `app/(client-portal)/{i,pay}/[token]/page.tsx`, `app/api/portal/{invoice,consent,pdf}/**`, `components/client/{invoice-view,pay-panel,consent-box}.tsx`, `scripts/verify/step13-payment-page.ts`.
- Done when: consent record complete (all six fields) before the checkout slot is enabled; the payment page makes no analytics request; mobile 320 px.

## 13.3 Estimates and receipts
- Goal: estimate approve or decline with note (publishes `estimate.approved|rejected`), receipt page and receipt PDF, client hub (all invoices, statements).
- Files: `lib/pdf/receipt-pdf.tsx`, `services/portal/{estimate-actions,receipt-view,hub-view}.ts`, `app/(client-portal)/{e,r,hub}/[token]/page.tsx`, `app/api/portal/{estimate,receipt,hub}/**`, `components/client/{estimate-actions,receipt-view,hub-view}.tsx`, `scripts/verify/step13-estimates.ts`.
- Done when: estimate approval changes the status through the estimates service; receipt PDF registered with `registerPdfRenderer('receipt')`.

## 13.4 Client emails
- Goal: invoice, reminder, receipt, estimate, overdue, thank you and other client templates, forward-leak warning, delivery tracking views for the owner.
- Files: `emails/client/*.tsx`, `services/portal/{client-mail,delivery-proof}.ts`, `app/(dashboard)/client-mail/**` (owner view), `app/api/portal/delivery/**`, `scripts/verify/step13-emails.ts`.
- Done when: templates registered through the email contract; delivery proof rows written per send.

## 13.5 Tenant branding
- Goal: logo, colors, fonts, footer applied to portal, emails and PDFs; platform marks removed by plan (entitlement); custom domain serving for portal routes.
- Files: `services/branding/{theme,domain,register}.ts`, `components/client/branded-frame.tsx`, `proxy`-side host lookup helper `lib/portal/host.ts`, `migrations/S13_002_branding.sql` (+ `_down`), `scripts/verify/step13-branding.ts`.
- Done when: colors checked for contrast, fonts limited to a safe list, custom domain resolves only to a verified tenant domain.

## 13.6 Contracts and e-signature
- 13.6.a Contract templates, contracts, send, reminders: `migrations/S13_003_contracts.sql` (`contracts`, `signatures`), `services/contract/**`, `app/(dashboard)/contracts/**`, `app/api/contracts/**`.
- 13.6.b Signing page `/c/[token]` (typed, drawn, uploaded), signing evidence (document hash, IP, device, timestamp), archive via the storage contract, signed PDF: `services/esign/**`, `app/(client-portal)/c/[token]/page.tsx`, `components/client/signature-pad.tsx`.
- Done when: signing evidence complete; signed document stored with its hash; second signature attempt refused.

## 13.7 Owner workflows
- Goal: owner-only send gate, approval workflow integration for staff-created documents, bulk email with safeguards, collection UX (promise to pay, dispute note), document presets, lifecycle states, data cleanliness checks.
- Files: `services/portal/{send-gate,bulk-mail,promises,presets,cleanliness}.ts`, `migrations/S13_004_owner_workflows.sql`, owner pages under `app/(dashboard)/client-mail/**`, `scripts/verify/step13-owner.ts`.

## 13.8 Disputes
- Goal: chargeback intake from `dispute.opened` events, case record, deadline tracker and alerts, status workflow, reason-code mapping hook through adapters, refund request workflow (client to owner to approve to process), win and loss analytics.
- Files: `migrations/S13_005_disputes.sql` (`disputes`, `dispute_evidence`), `services/dispute/**`, `workers/s13/dispute-deadlines.ts`, `app/(dashboard)/disputes/**`, `app/(admin)/admin/disputes/**`, `app/api/disputes/**`, `app/(client-portal)/r/[token]` refund request form.
- Done when: seeded `dispute.opened` creates one case; deadline alert job fires; status machine refuses illegal moves.

## 13.9 Evidence pack
- 13.9.a Generator `services/evidence/**` and `lib/pdf/evidence-pack-pdf.tsx`: invoice snapshot, receipt, consent proof, delivery proof, communication log, client identity data (IP, device, geo, 3DS proof), timeline, audit chain proof with hashes, platform details (nine sections).
- 13.9.b ZIP download, processor format through the adapter `evidenceFormat` hook, 18-month encrypted retention through the storage contract, admin and owner pages, hash recorded in the audit chain: `migrations/S13_006_evidence_packs.sql`, `app/api/disputes/evidence/**`.
- Done when: pack of a seeded dispute has all nine sections and its hash is found by `audit.verifyChain`.

## 13.10 Fragments and closure
- Files: `config/nav/s13.ts`, `config/permissions/s13-*.ts`, `lib/i18n/strings/en/s13-*.ts`, `config/env/s13.env.fragment` (if needed), `docs/steps/STEP-13/{VERIFY,HANDOFF,DEPENDENCY_REQUESTS}.md`.
- Done when: whole STEP verification recorded; handoff lists routes, events consumed and published, evidence pack sections, retention settings.
