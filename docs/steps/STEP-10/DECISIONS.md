# STEP 10 - Decisions

Each entry records a choice that the source documents leave open or where two sources disagree (precedence: addendum, requirements spec, master prompt, feature list).

**D1 Ownership patterns.** The ownership map lists `lib/payment/{registry,routing,card-rules,verification,credentials,modes}.ts` and `components/payment/*.tsx`. STEP 10 also needs `lib/payment/{capabilities,decline,state-machine,csp,webhook-route}.ts`, `schemas/payment/**` and `components/payment/{admin,processors/index.generated.ts}`. `config/ownership.json` got three patterns for STEP 10: `lib/payment/*.ts`, `schemas/payment/**`, `components/payment/**`. The more specific patterns of STEPs 11, 12 and 14 still win.

**D2 Shared scripts touched.** Two shared scripts were changed because the SCOPE or a route rule demands it: `scripts/check-no-pan.sh` (extended payment rules, named in sub-step 10.12) and `scripts/verify/step04-static.mjs` (`app/api/webhooks/` joins the plain-handler prefixes, because processor webhooks must read the raw body before any parsing).

**D3 Card identity exists only after the processor answers.** The adapter contract has no call that returns a card identity before `authorize` or `charge`. So the card rules that need the identity (blocked list, same card on the same invoice, failure limit, per-card velocity) run immediately after the processor answers and before the capture. If a rule refuses the card, the authorization is voided (or a single-step charge is refunded) and the payment fails with the rule code. The address rules (attempts per address) run before the processor is called. The card rules run before the current attempt is written, so the attempt does not count against its own card.

**D4 Reviewer roles.** REQ-VERIFY names the roles `payment_processor` and `fraud_analyst`. Admin sub-role domains are fixed by STEP 02 (`payment_processor`: payment, payout, processor; `fraud_analyst`: fraud, security, risk). Two permission families therefore exist: `payment.review.*` and `fraud.payment_review.*`. A reviewer needs either one. `super_admin` and `ceo` hold both.

**D5 Processors without separate authorize and capture.** The single-use token cannot be kept for a later decision, so a mismatch of postal code or IP country (without a completed 3DS, which cannot be known before the charge) fails the payment with `verification_mismatch` before the charge is sent. No review row is created for these processors. A security event is raised.

**D6 3DS policy.** "Request 3DS whenever the processor supports it" is implemented as policy `preferred` (requested, never a reason to fail by itself), because REQ-VERIFY item 2 defines what happens when 3DS is not completed.

**D7 Refunds and the invoice.** The `invoices` contract can apply a payment but has no operation that reverses one. A refund therefore records the refund, updates the payment (`partially_refunded`, `refunded`), publishes `payment.refunded` and writes the audit entry, but does not change the invoice amounts. This is requested in `DEPENDENCY_REQUESTS.md` (R1). Accounting (STEP 15) is fed by the event.

**D8 No failover.** The first matching routing rule decides. If its processor is not enabled, not in code, or does not accept USD, the payment fails with `processor_unavailable`; the next rule is never tried. A static check (`step10-static.mjs`) fails the build if failover wording appears in payment code.

**D9 Webhooks never decide the state.** After the signature verifies, the core asks the processor for the transaction (`getTransaction`) and applies that answer. A webhook that arrives before our record stores the transaction id is retried (1, 2, 4, 8 minutes, then dead letter after `WEBHOOK_MAX_ATTEMPTS`). A refund made inside the processor's own dashboard writes an audit entry `payment.refund.external_notice` and needs a person to reconcile; it does not change money state by itself. Dispute events publish `dispute.opened`, `dispute.won` or `dispute.lost` for STEP 13 and mark the invoice disputed.

**D10 Review hold length.** `min(REVIEW_HOLD_HOURS, authorization validity)`. The validity defaults to `DEFAULT_AUTH_VALIDITY_HOURS` (168) and each adapter sub-step may set the documented value of its processor in `AUTH_VALIDITY_HOURS_BY_PROCESSOR`.

**D11 Hosted checkout location.** The public page `/pay/[token]` is a client portal route (STEP 13). STEP 10 provides the logic and the component: `components/payment/checkout-panel.tsx`, the secure-form slot, and the public API under `app/api/payment-links/checkout/[token]/`. STEP 13 renders `<CheckoutPanel token={token} />`.

**D12 Generated secure-form index.** `components/payment/processors/index.generated.ts` is an empty map until the Integrator adds a generator step (see `DEPENDENCY_REQUESTS.md` R2). Adapters of STEP 11 and 12 add `components/payment/processors/<id>/index.tsx` with a default export of type `SecureFormComponent`.

**D13 Payment page CSP.** `config/processors.ts` holds `PROCESSOR_ORIGINS` (empty until each adapter sub-step records the processor's secure-form hosts from its documentation). `lib/payment/csp.ts` exposes `paymentPageOrigins()` for the proxy (R3). Analytics hosts are refused by `violatesPaymentProfile`.

**D14 Card identities and the blocked list are platform wide.** Both tables have no company. A card flagged for fraud is refused for every company. Only HMACs are stored (key `CARD_IDENTITY_HMAC_KEY`). Taking a card off the list sets `expires_at` to now; the row stays as history.

**D15 Refund approval.** A staff member's refund waits for the owner (action `payment.refund`, level L1). A refund above `REFUND_APPROVAL_THRESHOLD_USD` (500) waits for the CEO (`payment.refund.large`, L2) whoever asks. Platform roles `super_admin` and `ceo` refund directly up to the threshold; above it only `super_admin` is direct. Policy: refunds are possible for `REFUND_WINDOW_DAYS` (180) after capture and never above the amount left.

**D16 Surcharge.** `CARD_SURCHARGE_PERCENT` is `0` by default. A positive value adds the surcharge to the amount sent to the processor and shows it in the checkout; only the base amount is applied to the invoice.

**D17 Upserts need plain unique indexes.** `payment_allocations`, `card_blacklist` and `card_identities` have unique indexes without a `where` clause so that upserts with `ON CONFLICT` work through the API client.

**D18 Concurrent refunds.** A refund row reserves its amount when it is created; if the reserved total would exceed the captured amount the new refund is rejected (a race can reject both, never over-refund).

**D19 End-to-end verification.** No adapter exists yet. The flow check (`scripts/verify/step10-flow.ts`) runs the services with fake processors and an in-memory database; the SQL assertions run on a real PostgreSQL. A run against a real sandbox waits for the first adapter of STEP 11 (see `VERIFY.md` section C).

**D20 What "payment fraud engine" means in this STEP.** The feature list (part 4 L, part 11 payment fraud engine) names a wide engine: risk score 0 to 100, BIN check, device-card binding, structured-payment detection, merchant and payer scoring, network analysis, a configurable rule engine with shadow mode, case management, whitelist. The owner's later requirements (REQ-CARD and REQ-VERIFY, which win over the feature list) define the rules to build: the card rules (blocked list, same card same invoice, counted failures, velocity per card, per address and per distinct cards), 3DS, postal code and IP country comparison, network blocking and the manual review queue. STEP 10 builds exactly those. The remaining engine features (scoring, BIN, device binding, rule engine, cases, whitelist) are not built; HANDOFF lists them. A BIN check also needs card data, which our code never touches.

**D21 Failover chain and per-tenant gateway toggles.** Feature items 1246 (enable per tenant), 1250 (default priority per tenant) and 1251 (fallback chain primary, secondary, tertiary) conflict with REQ-ADMIN-CONNECT (platform-level enable by the super admin, routing rules, no automatic failover). The requirement wins: processors are enabled platform wide and routing rules choose the processor.
