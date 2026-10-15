# REQUIREMENTS TRACE (nothing from the owner's instructions is left out)

## 1. Owner instructions -> where they are satisfied

| Id | Owner instruction | Specification | STEP | Verified in |
|---|---|---|---|---|
| T-01 | 20 absolute rules | CLAUDE.md section 4 | all | guard scripts (STEP 01), Release Gate |
| T-02 | Tech stack and project structure | CLAUDE.md section 5, MASTER_PROMPT structure | 01 | STEP 01 scaffold |
| T-03 | Plan first, no code before sub-step split | STEP_PROTOCOL phase 1 | all | SUBSTEPS.md committed before code |
| T-04 | One STEP per chat, resume for long STEPs | STEP_PROTOCOL sections 1 and 8 | all | PROGRESS.md |
| T-05 | No conflicts or duplicates between chats | OWNERSHIP_MAP, CONTRACTS | all | check-ownership.sh, INTEGRATION_CHECKLIST A |
| T-06 | Commit after each step, push to git | STEP_PROTOCOL sections 4 and 7 | all | commit history |
| T-07 | `integration` branch is main | CLAUDE.md section 6, REQ-BRANCH | Integrator | branch exists |
| T-08 | Same type of instruction in every chat | CLAUDE.md, STEP_PROTOCOL, SCOPE template | all | -- |
| T-09 | Zero Trust, Zero Tolerance | STEP_PROTOCOL section 6, STEP 04 | 04 and all | security checklist per sub-step |
| T-10 | Files: company Drive if linked, else Supabase; text always Supabase | REQ-STORAGE | 05 (07 UI link) | STEP 05 verification |
| T-11 | Live accounts: Supabase, Netlify, Google, Turnstile, SMTP | REQ-ACCOUNTS | 01 (env), 05, 03, 04 | env fragments |
| T-12 | Processor docs read from the internet before coding | REQ-DOC, PAYMENT_PROCESSORS section 1 | 11, 12 | docs/processors/<id>.md committed first |
| T-13 | 16 processors, one file each, one registry file | REQ-PROCESSORS, PAYMENT_PROCESSORS section 3 | 10, 11, 12 | registry lists 16 |
| T-14 | Provider links and sandbox notes (incl. BlueSnap 404 note, "not provided" notes) | PAYMENT_PROCESSORS section 2 | 11, 12 | .verify.md |
| T-15 | NMI two modes, Collect.js default, token single use and 24 h | REQ-NMI-MODES | 10 (framework), 12 | nmi.verify.md |
| T-16 | NMI Payment Component package via Integrator | REQ-NMI-MODES item 2, STEP 12 12.1.d | 12, Integrator | DEPENDENCY_REQUESTS |
| T-17 | Mode switch needs prior successful test; one active mode; audit | REQ-NMI-MODES 4-6 | 10 | STEP 10 verification |
| T-18 | Super admin connects API keys, test, enable, no deploy | REQ-ADMIN-CONNECT 1 | 10 | STEP 10 verification |
| T-19 | Super admin only, 2FA plus fresh identity check | REQ-ADMIN-CONNECT 2 | 03 (step-up), 10 | STEP 10 verification |
| T-20 | AES-256-GCM encryption, key in environment, last chars only | REQ-ADMIN-CONNECT 3-4 | 05, 10 | sql assertion s10 |
| T-21 | Cannot enable without test; unknown adapter cannot be added | REQ-ADMIN-CONNECT 5-6 | 10 | STEP 10 verification |
| T-22 | No routing match cancels payment, no failover | REQ-ADMIN-CONNECT 7 | 10 | STEP 10 verification |
| T-23 | Login lock: 2 failures, 2 hours, no login/reset/password-change unlock | REQ-LOCK 1-2 | 03 | STEP 03 VERIFY |
| T-24 | Lock alert email to owner | REQ-LOCK 3 | 03 | STEP 03 VERIFY |
| T-25 | Unlock only by permitted admin after email contact confirmed; audited | REQ-LOCK 4 | 03 | STEP 03 VERIFY |
| T-26 | Lock state persisted in database | REQ-LOCK 5 | 03 | s03 assertion |
| T-27 | IP rate limit; no account-existence leak | REQ-LOCK 6-7 | 03, 04 | STEP 03 VERIFY |
| T-28 | Card data only in processor secure form; no key-press tracking | REQ-CARD 1 | 10, 11, 12, 13 | check-no-pan.sh |
| T-29 | Same card, same invoice, 24 h block | REQ-CARD 2 | 10 | STEP 10 verification |
| T-30 | 2 counted failures per card token in 24 h; third refused; insufficient funds excluded | REQ-CARD 3 | 10 | STEP 10 verification |
| T-31 | Processor fraud signal or blacklist rejects immediately | REQ-CARD 4 | 10 | STEP 10 verification |
| T-32 | Blacklist by token or fingerprint, not number | REQ-CARD 5 | 10 | s10 assertion |
| T-33 | Velocity limits for card and IP, defaults in config | REQ-CARD 6 | 10 | config/payment-risk.ts |
| T-34 | USD only, numeric(18,4), no JS Number | REQ-CARD 7, rule 2 | all | check-money.sh |
| T-35 | 3DS requested on every payment where possible | REQ-VERIFY 1 | 10, 11, 12 | .verify.md |
| T-36 | Without 3DS: postal code and IP country must both match, else manual review, not captured | REQ-VERIFY 2-3 | 10 | STEP 10 verification |
| T-37 | VPN/Proxy/Tor checks on payment page | REQ-VERIFY 4, REQ-NETWORK | 04, 10 | STEP 04 verification |
| T-38 | Webhooks only with valid signature; idempotent | REQ-VERIFY 5 | 04 (helpers), 10 (core), 11, 12 | .verify.md |
| T-39 | storage_provider on each file; runtime provider; auto fallback; migration tool | REQ-STORAGE 3-6 | 05 | STEP 05 verification |
| T-40 | Roles hierarchy and approval chain | REQ-ROLES, REQ-APPROVAL | 02, 03, 07 | s02 assertions |
| T-41 | Generic payment partner names | rule 18 | 14, all | check-no-brand-names.sh |
| T-42 | VPN/Proxy/Tor block on signup, payment, KYC, admin | rule 20, REQ-NETWORK | 04 | STEP 04 verification |

## 2. Earlier-plan decisions now fixed by the owner

Roles: Part 11 and the 20 rules decide (no accountant, affiliate, reseller). Storage: per-company Drive, otherwise Supabase. VPN/Proxy/Tor: blocked on signup, payment, KYC and admin. Tests: no test files; verification by scripts, SQL assertions and checklists. Branch: `integration`. Processors: sixteen from the start.

## 3. FEATURE_LIST coverage by part and section (line numbers refer to docs/source/FEATURE_LIST.md)

| Part (lines) | Sections -> STEP |
|---|---|
| 1 (1-471) | A, B, C, D, E, F, H, J, L, M -> 01; G, I, K -> 06 |
| 2 (472-953) | A -> 03; B, H, L(storage) -> 05; C, D, E, F, G, K, L -> 07; I, J -> 14 |
| 3 (954-1516) | A-E, K-O -> 09; F-I -> 08; J -> 16 |
| 4 (1517-2011) | A1, C, D, E, L, M -> 10; A2-A8 -> 11 and 12; B, F, G, J, K -> 14; H, I -> 13 |
| 5 (2012-2338) | A (token logic) -> 04; A pages, B-L -> 13 |
| 6 (2339-2812) | A-G, I, K -> 16; H -> 13; J1 -> 06; J2-J3 -> 07 |
| 7 (2813-3326) | A, H, L -> 07; B, I(entitlement), K -> 14; C-G, J, M -> 06; C3 -> 05 |
| 8 (3327-3742) | A-M -> 15 |
| 9 (3743-4275) | A, G, K, L -> 02; B, E, N, O -> 05; C, D, F, I, S -> 04; H, M, T -> 01; J -> Release Gate; P -> 09 and 14; Q -> 07; R -> 09, 10, 14, 15 |
| 10 (4276-4435) | A, B, C, D, F, H -> 01; E -> 04; G -> 07; I, J -> 06 |
| 11 (4436-4911) | A, E, M -> 02; B -> 05; C -> 02 and 04; D, G, H, I, K, L -> 04; J -> 13 |

Every STEP SCOPE file also lists the same line ranges under "Feature sources". When a step chat finds an item in a listed range that no sub-step covers, it adds a sub-step for it in SUBSTEPS.md rather than skipping it.
