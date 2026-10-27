<!-- path: docs/steps/STEP-16/AUDIT/PART-41.md -->
# Audit part 41 of 41: features 3961 to 4029

First pass, made by a script: the words of each feature are looked for in the code (paths and contents of `app`, `components`, `lib`, `services`, `config`, `cron`, `migrations`, `scripts`, `sql`, `public`).
It is a map to the likely files, not a verdict: a match does not prove that the feature works, and a missing word does not prove that it is missing (the code may use other words, and a line in Bengali only has nothing to look for).

| Status | Meaning |
|---|---|
| match | at least three of its words meet in one file |
| some-match | two words meet, or its one specific word is found |
| generic-match | only common words are found, nothing specific |
| no-match | none of its words is found in the code |
| manual | the line has no English word, a person must read it |

Totals: match 52, some-match 6, generic-match 3, no-match 0, manual 8. Features outside every STEP line range: 0.

| No | Section | English words of the feature | Status | STEP | Best file |
|---|---|---|---|---|---|
| 3961 | K3 | button link form | some-match | 04 | services/payroll/runs.ts |
| 3962 | K3 | fields changed | some-match | 04 | services/payroll/runs.ts |
| 3963 | K3 | API endpoint method status duration | match | 04 | app/(dashboard)/integrations/gateway/page.tsx |
| 3964 | K3 | (Bengali only) | manual | 04 | - |
| 3965 | K3 | initiate complete fail | match | 04 | scripts/verify/step11-payarc.ts |
| 3966 | K3 | who changed what | match | 04 | services/payroll/runs.ts |
| 3967 | K3 | data exfiltration detection | generic-match | 04 | lib/security/zero-trust.ts |
| 3968 | K3 | (Bengali only) | manual | 04 | - |
| 3969 | K3 | 2FA | manual | 04 | - |
| 3970 | K3 | (Bengali only) | manual | 04 | - |
| 3971 | K3 | (Bengali only) | manual | 04 | - |
| 3972 | K3 | (Bengali only) | manual | 04 | - |
| 3973 | K3 | (Bengali only) | manual | 04 | - |
| 3974 | K3 | bot detection | match | 04 | lib/middleware/bot-detector.ts |
| 3975 | K3 | bot detection | match | 04 | lib/middleware/bot-detector.ts |
| 3976 | K3 | bot detection | match | 04 | lib/middleware/bot-detector.ts |
| 3977 | K3 | per user per session | some-match | 04 | scripts/verify/step12-nmi.ts |
| 3978 | K3 | (Bengali only) | manual | 04 | - |
| 3979 | L1 | Never trust always verify every request authenticated | match | 03,04 | migrations/S14_001_wallet_ledger.sql |
| 3980 | L1 | Least privilege access minimum required permissions | match | 03,04 | lib/cms/defaults/legal.ts |
| 3981 | L1 | Micro-segmentation tenant isolation at every layer | generic-match | 03,04 | scripts/verify/step15-reports.ts |
| 3982 | L1 | Continuous verification session re-validation | match | 03,04 | scripts/verify/step12-nmi.ts |
| 3983 | L1 | Device trust scoring every device evaluated | match | 03,04 | scripts/verify/step04-core.ts |
| 3984 | L1 | Network trust scoring every IP evaluated | match | 03,04 | lib/security/risk-scoring.ts |
| 3985 | L1 | User trust scoring behavioral real-time | match | 03,04 | scripts/verify/step04-core.ts |
| 3986 | L1 | Transaction trust scoring every payment evaluated | match | 03,04 | lib/security/risk-scoring.ts |
| 3987 | L1 | Adaptive MFA risk-based step-up authentication | some-match | 03,04 | services/fraud/admin-ops.ts |
| 3988 | L1 | Just-in-time access temporary elevated permissions | match | 03,04 | scripts/verify/step16-bankfeed.ts |
| 3989 | L1 | Just-enough access minimum scope minimum duration | match | 03,04 | config/auth-lock.ts |
| 3990 | L1 | Assume breach mentality all data encrypted all logs immutable | match | 03,04 | lib/cms/defaults/legal.ts |
| 3991 | L1 | zip code zip code | some-match | 03,04 | scripts/verify/step12-nmi.ts |
| 3992 | L2 | Zero tolerance SQL injection attempt IP ban account lock | match | 03,04 | lib/security/zero-trust.ts |
| 3993 | L2 | Zero tolerance XSS attempt IP ban account lock | match | 03,04 | lib/security/zero-trust.ts |
| 3994 | L2 | Zero tolerance CSRF attempt session terminate alert | match | 03,04 | scripts/verify/step04-core.ts |
| 3995 | L2 | Zero tolerance Brute force permanent IP ban | match | 03,04 | scripts/verify/step04-core.ts |
| 3996 | L2 | Zero tolerance Credential stuffing account lock 2FA enforce | match | 03,04 | lib/security/zero-trust.ts |
| 3997 | L2 | Zero tolerance Data exfiltration account suspend investigation | match | 03,04 | lib/security/zero-trust.ts |
| 3998 | L2 | Zero tolerance Fraud detection account freeze fund hold | match | 03,04 | scripts/verify/step04-core.ts |
| 3999 | L2 | Zero tolerance Chargeback fraud merchant suspend evidence | match | 03,04 | services/mor/settle.ts |
| 4000 | L2 | Zero tolerance Insider threat access revoke audit | match | 03,04 | services/auth/actor.ts |
| 4001 | L2 | Zero tolerance Compliance violation auto-remediation alert | match | 03,04 | sql/assertions/s08_007_inventory_documents.sql |
| 4002 | L2 | Zero tolerance Vulnerability exploitation WAF block patch | match | 03,04 | lib/security/zero-trust.ts |
| 4003 | L2 | Zero tolerance DDoS attempt Cloudflare challenge block | match | 03,04 | scripts/verify/step04-core.ts |
| 4004 | L2 | Zero tolerance Bot activity CAPTCHA block | match | 03,04 | scripts/verify/step04-core.ts |
| 4005 | M1 | Optimistic locking version column every editable table | match | 02 | migrations/S02_001_foundation.sql |
| 4006 | M1 | Pessimistic locking SELECT FOR UPDATE critical operations | some-match | 02 | lib/cms/defaults/security.ts |
| 4007 | M1 | Advisory locking PostgreSQL invoice numbering | match | 02 | migrations/S09_003_numbering.sql |
| 4008 | M1 | Conflict detection UI Another user edited this | match | 02 | services/budget/budgets.ts |
| 4009 | M1 | Conflict resolution UI merge/discard/overwrite | match | 02 | lib/i18n/strings/en/s08-crm.ts |
| 4010 | M1 | Real-time co-editing presence John is editing | generic-match | 02 | migrations/S02_008_realtime_down.sql |
| 4011 | M1 | Edit lock timeout 5 minutes auto-release | match | 02 | migrations/S06_002_cms.sql |
| 4012 | M1 | Concurrent payment guard idempotency key | match | 02 | migrations/S10_001_payment_core.sql |
| 4013 | M1 | Concurrent stock update guard row lock | match | 02 | migrations/S08_005_inventory.sql |
| 4014 | M1 | Concurrent wallet balance guard serialized | match | 02 | migrations/S14_001_wallet_ledger_down.sql |
| 4015 | M2 | Invoice duplicate detection same client amount date | match | 02 | types/contracts/payment-adapter.ts |
| 4016 | M2 | Payment duplicate detection same gateway transaction ID | match | 02 | types/contracts/payment-adapter.ts |
| 4017 | M2 | Client duplicate detection fuzzy name email match | match | 02 | services/base/duplicate-detector.ts |
| 4018 | M2 | Product duplicate detection SKU name match | match | 02 | lib/migration/rules.ts |
| 4019 | M2 | Expense duplicate detection receipt hash | match | 02 | scripts/verify/step15-expenses.ts |
| 4020 | M2 | Journal entry duplicate detection same accounts amount date | match | 02 | sql/assertions/s15_006_reconciliation.sql |
| 4021 | M2 | Payroll duplicate detection same employee period | match | 02 | scripts/verify/step15-payroll-runs.ts |
| 4022 | M2 | Webhook duplicate detection idempotency key | match | 02 | types/contracts/payment-adapter.ts |
| 4023 | M2 | Email duplicate detection same recipient subject time | match | 02 | services/email/email-service.ts |
| 4024 | M2 | API request duplicate detection idempotency header | match | 02 | types/contracts/payment-adapter.ts |
| 4025 | M2 | Form submission duplicate detection anti-double-submit token | match | 02 | lib/i18n/strings/en/s07-company.ts |
| 4026 | M2 | File upload duplicate detection content hash | match | 02 | services/storage/files.ts |
| 4027 | M2 | Import duplicate detection pre-flight check | match | 02 | scripts/verify/step15-expenses.ts |
| 4028 | M2 | Batch operation duplicate guard per batch ID | match | 02 | migrations/S09_002_invoices_core.sql |
| 4029 | M2 | Cron job overlap prevention leader lock | match | 02 | cron/base/leader-lock.ts |
