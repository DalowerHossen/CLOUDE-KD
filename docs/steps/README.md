# STEP INDEX

One STEP = one chat. Read `CLAUDE.md` and `docs/execution/STEP_PROTOCOL.md` first.

| STEP | Title | Wave | Folder |
|---|---|---|---|
| 01 | Foundation, Contracts and Guardrails | A | docs/steps/STEP-01 |
| 02 | Data Core and Governance | B | docs/steps/STEP-02 |
| 03 | Authentication, Two-Factor and Account Lock | B | docs/steps/STEP-03 |
| 04 | Security Shield, Fraud Signals and Security Operations | B | docs/steps/STEP-04 |
| 05 | Encryption, File Storage and Email | B | docs/steps/STEP-05 |
| 06 | Public Site, CMS, SEO and Marketing | B | docs/steps/STEP-06 |
| 07 | Onboarding, Tenant Settings, Team, KYC and Admin People | C | docs/steps/STEP-07 |
| 08 | Clients, Catalog, Inventory and Suppliers | C | docs/steps/STEP-08 |
| 09 | Invoicing Core, PDF, Projects and Reports | C | docs/steps/STEP-09 |
| 10 | Payment Core and Super Admin Processor Connect | C | docs/steps/STEP-10 |
| 11 | Payment Processor Adapters, Group 1 (8 processors) | D | docs/steps/STEP-11 |
| 12 | Payment Processor Adapters, Group 2 (8 processors, NMI two modes) | D | docs/steps/STEP-12 |
| 13 | Client Portal, Contracts and Disputes | D | docs/steps/STEP-13 |
| 14 | Wallet, Merchant of Record, Payouts, Plans and Subscriptions | D | docs/steps/STEP-14 |
| 15 | Accounting, Expenses, Payroll and HR | C | docs/steps/STEP-15 |
| 16 | Integrations and Automation | C | docs/steps/STEP-16 |

Each folder contains SCOPE.md (given). The step chat creates SUBSTEPS.md, PROGRESS.md, DECISIONS.md, DEPENDENCY_REQUESTS.md, VERIFY.md, HANDOFF.md (BLOCKERS.md only if blocked).

Files that guide every chat: `CLAUDE.md`, `docs/execution/{STEP_PROTOCOL,OWNERSHIP_MAP,CONTRACTS,REQUIREMENTS_SPEC,PAYMENT_PROCESSORS,INTEGRATION_CHECKLIST,REQUIREMENTS_TRACE}.md`.

Feature coverage: every FEATURE_LIST part is assigned in the "Feature sources" section of a SCOPE file; `REQUIREMENTS_TRACE.md` section 3 lists the mapping by part and section.
