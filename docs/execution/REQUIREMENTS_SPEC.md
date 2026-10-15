# REQUIREMENTS SPEC (formal English version of docs/source/REQUIREMENTS_ADDENDUM.md)

Each requirement has an id. STEP SCOPE files and `REQUIREMENTS_TRACE.md` refer to these ids. Defaults named here live in `config/` files (never inline in code).

## REQ-DOC - Processor documentation rule
1. Before any code for a payment processor, read that processor's latest official documentation from the internet in the current session. No code from memory or assumption.
2. Write what was read into `docs/processors/<id>.md` (template in PAYMENT_PROCESSORS.md section 4) and commit it before the adapter code.
3. If the documentation or sandbox information cannot be reached, stop the sub-step and report. Do not guess.

## REQ-PROCESSORS - Sixteen processors from the start
Stripe, NMI, Adyen, Verifone (2Checkout), Braintree (PayPal), BlueSnap, Square, Payoneer, FastSpring, Paddle, PayPro Global, PayPal (standalone), Payarc/PaymentCloud, Rapyd, Authorize.Net, Custom. One adapter per file in `lib/payment/adapters/<id>.ts`. One registry file `lib/payment/registry.ts` lists all sixteen. Documentation and sandbox facts are taken from each provider's own website (links in PAYMENT_PROCESSORS.md).

## REQ-NMI-MODES - NMI front-end modes
1. Mode `collectjs` (default): Collect.js. The payment token is single use and expires after 24 hours.
2. Mode `payment_component`: NMI Payment Component, which needs an npm package. The package request goes through `DEPENDENCY_REQUESTS.md` to the Integrator, who owns `package.json`.
3. Both modes send the payment from the server through one shared module that calls the NMI REST API (`lib/payment/adapters/nmi/shared-server.ts`).
4. The mode of any processor that has modes can be changed from the super admin dashboard. Exactly one mode is active per processor at any time.
5. Before switching, a successful test in the target mode must be recorded (`processor_mode_tests`, tied to the current credentials version, valid for `MODE_TEST_VALID_HOURS`, default 24).
6. Every mode change is written to the audit log (actor, processor, from, to, test id).

## REQ-ADMIN-CONNECT - Connect processors from the super admin dashboard
1. One page, `app/(admin)/processors`, lets the super admin enter API credentials, run a test, and enable or disable any processor, with no document change and no redeploy.
2. Only `super_admin` can open it. It requires an active 2FA session and a fresh identity check (`requireStepUp`, default `STEP_UP_MAX_AGE_SECONDS` = 300) for every write action.
3. Credentials are encrypted with AES-256-GCM before they are saved. The encryption key lives in an environment variable (`ENCRYPTION_KEY`, purpose `processor-credentials`), never in the database. Stored fields: ciphertext, iv, tag, key_version, last4 (last characters), updated_at, updated_by.
4. After saving, the secret is never shown again. The page shows only the last characters and the last update time.
5. A processor cannot be enabled unless its latest test passed for the current credentials and the current mode. Changing credentials disables the processor until a new test passes.
6. A processor whose adapter is not present in code cannot be added or enabled. The dashboard lists only processors that exist in the registry with an adapter file.
7. Routing: if no routing rule matches a payment, the payment is cancelled with reason `routing_no_match`. It is never sent to another processor. If the selected processor fails, the payment fails; there is no automatic failover.
8. Every credential save, test, enable, disable, mode change and routing change is audit logged.

## REQ-LOCK - Login lock
Config file: `config/auth-lock.ts` (`LOCK_THRESHOLD=2`, `LOCK_DURATION_SECONDS=7200`, `IP_FAILURE_LIMIT`, `IP_FAILURE_WINDOW_SECONDS`).
1. Two consecutive failures lock the account for 2 hours. A failure is a wrong password or a wrong 2FA code (including a wrong backup code). The counter is shared by both kinds and resets only after a full successful login.
2. While locked: a correct password still does not log in; password reset is disabled (no reset email is sent, previously issued reset tokens are rejected); changing the password does not lift the lock.
3. When the lock starts, a warning email goes to the account owner. For a staff account the company owner also receives it. The email contains no unlock link.
4. Unlock: only an admin, or an `admin_staff` member who holds the permission `auth.account.unlock`, and only after contact with the account owner by email is confirmed. Confirmation is verified by the system: the unlock request sends a one-time confirmation message to the account's registered email and the owner confirms it. Every unlock request, confirmation and unlock is audit logged with actor, time and evidence.
5. Failed-attempt counters and lock state are stored in the database (`auth_login_state`) so a server restart does not clear them. They are keyed by an HMAC of the normalized identifier, so unknown accounts behave identically.
6. Account existence is never revealed: one generic message for wrong password, wrong code, locked and unknown account; equalized response time; password-reset requests always answer with the same neutral message.
7. IP-based rate limiting applies in addition (through the security contract).
8. Supabase Auth endpoints are not a bypass: the lock is also enforced at the auth server by Supabase Auth Hooks if the current Supabase documentation supports them for the project plan; otherwise all sign-in traffic is forced through the platform's own API. The STEP 03 sub-step reads the current Supabase documentation first.

## REQ-CARD - Card payment rules
Config file: `config/payment-risk.ts`.
1. Card number, expiry and CVV are entered only in the processor's own secure form (hosted fields, iframe or redirect). Our code and servers never read, store, log or relay them, and never track key presses. Payment pages load no analytics, pixel, heatmap or behaviour scripts. `scripts/check-no-pan.sh` fails the build on card-field handling in our code.
2. Same card, same invoice: after one successful card payment on an invoice, that card cannot pay the same invoice again for `SAME_CARD_SAME_INVOICE_HOURS` (24). Other invoices are not affected.
3. Failures: card-related or authentication failures (wrong number, wrong expiry, wrong CVV, wrong OTP, 3DS failure) count per card identity in a rolling `CARD_FAIL_WINDOW_HOURS` (24). After `CARD_FAIL_LIMIT` (2) counted failures, the third attempt is rejected. Insufficient-funds declines are not counted. The counted categories are listed in `CARD_COUNTED_FAILURES`.
4. A card flagged by the processor's fraud signal, or present in our blacklist, is rejected immediately.
5. The blacklist and all card tracking use the card token or the processor's card fingerprint (stored as an HMAC), never the card number. Each adapter declares its card identity strategy in `docs/processors/<id>.md`.
6. Velocity limits per card identity, per IP and per distinct cards per IP, with defaults in config (`CARD_ATTEMPTS_PER_HOUR`, `IP_ATTEMPTS_PER_HOUR`, `IP_DISTINCT_CARDS_PER_HOUR`).
7. All amounts are USD, stored as numeric(18,4), calculated with the `Money` type; no JavaScript Number arithmetic.

## REQ-VERIFY - Payment verification
1. Request 3D Secure on every payment whenever the processor supports it.
2. If 3DS is not completed, the payment is taken only when both the billing postal code and the payer's IP country match the invoice data (invoice billing postal code and billing country). If either differs, the payment is not captured and is placed in the manual review list (`payment_reviews`). The authorization is held for `REVIEW_HOLD_HOURS` (default 72, never beyond the processor's authorization validity) and voided automatically when it expires. A reviewer captures or voids it; every decision is audit logged.
3. Processors without separate authorize and capture steps apply the same two checks before the charge is sent when 3DS has not been completed.
4. VPN, proxy and Tor checks apply on the payment page (context `payment`) and block the payment.
5. A processor webhook is accepted only after its signature verifies, and is processed idempotently (unique processor + event id). Unsigned or invalid webhooks are rejected and raise a security event.

## REQ-STORAGE - File storage
1. Text and accounting data always live in Supabase Postgres.
2. Files (PDFs, images, KYC documents, logos and the rest) go to the company's Google Drive when one is linked (OAuth link per company); otherwise to Supabase Storage.
3. Every file is encrypted with AES-256-GCM before upload. Every file record has `storage_provider` (`google_drive` or `supabase`).
4. The provider is resolved at runtime per company (`resolveProvider(companyId)`).
5. If the chosen provider is unavailable, the file goes to the other one automatically, and the event is audit logged and notified.
6. A file migration tool moves files between providers (resumable, hash verified, `storage_provider` switched atomically).

## REQ-ACCOUNTS - Accounts needed for launch
Supabase, Netlify, Cloudflare Turnstile, SMTP (any provider), a Google Cloud OAuth client (for the optional per-company Drive link). Processor keys are entered in the dashboard (REQ-ADMIN-CONNECT), not in environment files. A data source for VPN/Proxy/Tor detection (REQ-NETWORK).

## REQ-NETWORK - VPN, Proxy, Tor
Detection through a provider adapter (IPQualityScore or MaxMind Anonymous IP) plus the public Tor exit list. Policy per context: block on signup, payment, KYC and admin; flag and require 2FA on login. Admin whitelist for corporate networks.

## REQ-BRANCH - Branches
`integration` is the main line. Step branches merge into it only through the Integrator session.

## REQ-STEPS - Work method
Sixteen STEPs, one STEP per chat, each divided into sub-steps before any code, each sub-step committed, each STEP closed with a handoff file. After STEP 01 is merged, STEPs 02 to 16 can start in separate chats at the same time because they work in disjoint paths and meet only through contracts.

## REQ-ROLES - Roles
super_admin > ceo > admin_staff (sub-roles: kyc_reviewer, payment_processor, support_agent, content_manager, compliance_officer, fraud_analyst, finance_analyst) > owner > staff. Clients are tokenized. No accountant, affiliate or reseller role.

## REQ-APPROVAL - Approval chain interpretation
Every action is registered in `lib/auth/approval-rules.ts` with a level: L0 (no approval, own-company routine), L1 (staff action approved by owner or admin lead), L2 (CEO), L3 (super_admin), L2+L3 (dual). Platform admin actions follow the chain admin_staff -> CEO -> super_admin. Owner-side staff actions follow staff -> owner. Super admin actions need no higher approval but need step-up and are audit logged.
