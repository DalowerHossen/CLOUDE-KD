# STEP 12 - Progress

- [x] 12.1.a nmi: doc record
- [x] 12.1.b nmi: shared server module (`lib/payment/adapters/nmi/shared-server.ts`)
- [x] 12.1.c nmi: adapter with modes collectjs (default) and payment_component
- [ ] 12.1.d nmi: mode components - BLOCKED: collectjs by B1 (submission trigger undocumented), payment_component by request R1 (package not installed)
- [x] 12.1.e nmi: mode tests (`testConnection` per mode) - local checks done, sandbox scenarios pending (no credentials)
- [x] 12.1.f nmi: webhook route and verification record
- [ ] 12.2 adyen - doc record written from the available sources (incomplete); BLOCKED by B3 (docs host unreachable) and B4 (no payment lookup; request R3); no code
- [ ] 12.3 paddle - doc record, adapter (one-step sale, merchant of record), webhook, local checks (10) done; browser form BLOCKED by B5 (Paddle.js docs unreachable); sandbox pending
- [x] 12.4 fastspring - doc record, adapter (one-step sale, merchant of record), webhook, Checkout Components form, local checks (11) done; sandbox pending (no credentials); Components must be enabled by FastSpring for the store
- [x] 12.5 payproglobal - doc record, adapter (hosted checkout, merchant of record), IPN webhook, form (payer types the order number), local checks (11) done; sandbox pending; request R4 (return route)
- [ ] 12.6 payoneer
- [ ] 12.7 rapyd
- [ ] 12.8 custom
- [ ] 12.9 status table and handoff
