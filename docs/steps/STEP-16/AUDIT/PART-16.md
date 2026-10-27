<!-- path: docs/steps/STEP-16/AUDIT/PART-16.md -->
# Audit part 16 of 41: features 1486 to 1584

First pass, made by a script: the words of each feature are looked for in the code (paths and contents of `app`, `components`, `lib`, `services`, `config`, `cron`, `migrations`, `scripts`, `sql`, `public`).
It is a map to the likely files, not a verdict: a match does not prove that the feature works, and a missing word does not prove that it is missing (the code may use other words, and a line in Bengali only has nothing to look for).

| Status | Meaning |
|---|---|
| match | at least three of its words meet in one file |
| some-match | two words meet, or its one specific word is found |
| generic-match | only common words are found, nothing specific |
| no-match | none of its words is found in the code |
| manual | the line has no English word, a person must read it |

Totals: match 39, some-match 35, generic-match 5, no-match 2, manual 18. Features outside every STEP line range: 0.

| No | Section | English words of the feature | Status | STEP | Best file |
|---|---|---|---|---|---|
| 1486 | F2 | tenant- transparent | some-match | 10,14 | styles/globals.css |
| 1487 | F2 | (Bengali only) | manual | 10,14 | - |
| 1488 | F2 | auto | manual | 10,14 | - |
| 1489 | F2 | flat/percentage/tiered | match | 10,14 | lib/payment/fee-calculator.ts |
| 1490 | F3 | per tenant | manual | 10,14 | - |
| 1491 | F3 | new merchant longer hold | match | 10,14 | scripts/verify/step14-settlement.ts |
| 1492 | F3 | cron daily auto-release after period | match | 10,14 | services/lifecycle/data.ts |
| 1493 | F3 | super_admin override | some-match | 10,14 | services/invoice/invoices.ts |
| 1494 | F3 | per transaction tenant-visible | generic-match | 10,14 | scripts/verify/step12-nmi.ts |
| 1495 | F3 | available vs held | match | 10,14 | scripts/verify/step16-settlement.ts |
| 1496 | F3 | risk-based auto | some-match | 10,14 | scripts/verify/step16-tenant-insight.ts |
| 1497 | F4 | tenant platform | manual | 10,14 | - |
| 1498 | F4 | auto/manual per amount threshold | match | 10,14 | services/payroll/preview.ts |
| 1499 | F4 | daily/weekly/monthly per tenant | match | 10,14 | lib/payment/payout.ts |
| 1500 | F4 | configurable | no-match | 10,14 | - |
| 1501 | F4 | Global Payout Partners/Bank/Wire | match | 10,14 | sql/assertions/s14_003_payouts.sql |
| 1502 | F4 | gateway API call | match | 10,14 | lib/middleware/bot-detector.ts |
| 1503 | F4 | pending/processing/completed/failed | match | 10,14 | scripts/verify/step12-rapyd.ts |
| 1504 | F4 | FX USD local | some-match | 10,14 | services/payroll/run-rules.ts |
| 1505 | F4 | auto credit back | match | 10,14 | lib/cms/defaults/help.ts |
| 1506 | F4 | failed retry schedule | match | 10,14 | services/payout/payouts.ts |
| 1507 | F4 | tenant-visible | some-match | 10,14 | migrations/S02_003_locks.sql |
| 1508 | F4 | four-eyes | generic-match | 10,14 | scripts/verify/step16-settlement.ts |
| 1509 | F4 | per tenant per period | some-match | 10,14 | services/payroll/run-rules.ts |
| 1510 | F4 | per payout configurable | some-match | 10,14 | app/api/integrations/settlement/payouts/route.ts |
| 1511 | G1 | Merchant of Record platform-level toggle | match | 14 | components/payment/admin/processor-panel.tsx |
| 1512 | G1 | MoR all payments through KD | some-match | 14 | services/payroll/runs.ts |
| 1513 | G1 | MoR versioned per tenant e-sign | match | 14 | sql/assertions/s16_021_settlement.sql |
| 1514 | G1 | MoR legal page | some-match | 14 | app/sitemap.ts |
| 1515 | G1 | MoR separate from platform ToS | some-match | 14 | scripts/verify/step11-verifone.ts |
| 1516 | G1 | MoR on/off per tenant super_admin | some-match | 14 | scripts/verify/step16-settlement.ts |
| 1517 | G1 | MoR tenant dashboard | some-match | 14 | app/(dashboard)/suppliers/new/page.tsx |
| 1518 | G2 | own gateway no KYC no MoR | match | 14 | lib/i18n/strings/en/s07-company.ts |
| 1519 | G2 | KYC verified MoR auto on admin approve | match | 14 | lib/i18n/strings/en/s07-company.ts |
| 1520 | G2 | KYC pending own gateway only | match | 14 | lib/i18n/strings/en/s07-company.ts |
| 1521 | G2 | KYC rejected own gateway only notification | match | 14 | lib/i18n/strings/en/s07-company.ts |
| 1522 | G2 | KYC expired MoR auto own gateway fallback | match | 14 | lib/i18n/strings/en/s07-company.ts |
| 1523 | G2 | MoR per tenant super_admin | manual | 14 | - |
| 1524 | G2 | super_admin | manual | 14 | - |
| 1525 | G2 | MoR vs own gateway | match | 14 | sql/assertions/s16_019_gateway.sql |
| 1526 | G2 | MoR auto/manual | manual | 14 | - |
| 1527 | G2 | MoR after risk review | match | 14 | scripts/verify/step14-settlement.ts |
| 1528 | G2 | MoR fail own gateway manual | match | 14 | services/gateway/forward.ts |
| 1529 | G3 | KYC business docs agreement | match | 14 | migrations/S07_003_kyc.sql |
| 1530 | G3 | per tenant real-time rule-based | manual | 14 | - |
| 1531 | G3 | per merchant configurable | some-match | 14 | app/api/integrations/settlement/payouts/route.ts |
| 1532 | G3 | real-time auto-suspend | some-match | 14 | migrations/S14_002_settlement.sql |
| 1533 | G3 | AML automated per transaction | generic-match | 14 | services/accounting/posting.ts |
| 1534 | G3 | cron weekly | match | 14 | services/lifecycle/data.ts |
| 1535 | G3 | real-time anomaly detection | generic-match | 14 | config/s16-api.ts |
| 1536 | G3 | daily/weekly/monthly | match | 14 | lib/payment/payout.ts |
| 1537 | G3 | T+1 T+3 T+7 | manual | 14 | - |
| 1538 | G3 | platform vs gateway | some-match | 14 | app/api/integrations/settlement/payouts/route.ts |
| 1539 | G3 | (Bengali only) | manual | 14 | - |
| 1540 | G3 | (Bengali only) | manual | 14 | - |
| 1541 | G3 | per merchant | some-match | 14 | app/api/integrations/settlement/payouts/route.ts |
| 1542 | G3 | 0.65 threshold | some-match | 14 | app/(dashboard)/payroll/settings/page.tsx |
| 1543 | G3 | auto-review | some-match | 14 | lib/compliance/rules.ts |
| 1544 | G3 | PCI- hosted fields | match | 14 | config/processors.ts |
| 1545 | G3 | PCI SAQ-A | generic-match | 14 | config/processors.ts |
| 1546 | G3 | hosted fields only | some-match | 14 | config/s16-api.ts |
| 1547 | H1 | gateway KD | some-match | 11,13 | app/api/integrations/settlement/payouts/route.ts |
| 1548 | H1 | per case | some-match | 11,13 | services/payroll/reports.ts |
| 1549 | H1 | new/responded/won/lost | match | 11,13 | config/s16-api.ts |
| 1550 | H1 | from wallet | some-match | 11,13 | app/(dashboard)/subscriptions/page.tsx |
| 1551 | H1 | gateway fee | match | 11,13 | scripts/verify/step16-settlement.ts |
| 1552 | H1 | owner instant | some-match | 11,13 | lib/integrations/mapping-rules.ts |
| 1553 | H1 | response due date | match | 11,13 | services/dispute/intake.ts |
| 1554 | H1 | cron | some-match | 11,13 | cron/jobs/s09-overdue.ts |
| 1555 | H1 | super_admin all tenants | manual | 11,13 | - |
| 1556 | H2 | Generate Evidence Pack one-click | match | 11,13 | lib/i18n/strings/en/s13-portal.ts |
| 1557 | H2 | Evidence Pack PDF | match | 11,13 | sql/assertions/s13_009_evidence_packs.sql |
| 1558 | H2 | Stripe/PayPal/Adyen specific | match | 11,13 | config/processors.ts |
| 1559 | H2 | immutable | some-match | 11,13 | migrations/S05_006_email.sql |
| 1560 | H2 | proof of delivery | match | 11,13 | app/api/portal/delivery/route.ts |
| 1561 | H2 | tracking confirmation | match | 11,13 | components/payment/processors/stripe/index.tsx |
| 1562 | H2 | to gateway | some-match | 11,13 | app/api/integrations/settlement/payouts/route.ts |
| 1563 | H2 | organized | no-match | 11,13 | - |
| 1564 | H2 | (Bengali only) | manual | 11,13 | - |
| 1565 | H2 | Google Drive encrypted | match | 11,13 | services/storage/resolver.ts |
| 1566 | H3 | bank statement | match | 11,13 | scripts/verify/step16-settlement.ts |
| 1567 | H3 | post-payment | match | 11,13 | services/payroll/runs.ts |
| 1568 | H3 | (Bengali only) | manual | 11,13 | - |
| 1569 | H3 | client-facing | some-match | 11,13 | lib/middleware/bot-detector.ts |
| 1570 | H3 | flag before charge | match | 11,13 | scripts/verify/step11-verifone.ts |
| 1571 | H3 | (Bengali only) | manual | 11,13 | - |
| 1572 | H3 | (Bengali only) | manual | 11,13 | - |
| 1573 | I1 | checkout | some-match | 11,13 | scripts/verify/step12-nmi.ts |
| 1574 | I1 | I received goods/services | some-match | 11,13 | scripts/verify/step11-verifone.ts |
| 1575 | I1 | (Bengali only) | manual | 11,13 | - |
| 1576 | I1 | Terms versioned snapshot immutable | match | 11,13 | migrations/S09_002_invoices_core.sql |
| 1577 | I1 | checkbox | some-match | 11,13 | app/(dashboard)/subscriptions/[id]/page.tsx |
| 1578 | I1 | Pay | some-match | 11,13 | services/payroll/run-rules.ts |
| 1579 | I1 | UTC | some-match | 11,13 | lib/compliance/jurisdictions.ts |
| 1580 | I1 | IP at consent time | some-match | 11,13 | services/bnpl/installments.ts |
| 1581 | I1 | (Bengali only) | manual | 11,13 | - |
| 1582 | I1 | immutable | some-match | 11,13 | migrations/S05_006_email.sql |
| 1583 | I1 | immutable hash-chain | match | 11,13 | sql/assertions/s02_004_audit.sql |
| 1584 | I1 | visual proof | some-match | 11,13 | scripts/verify/step12-adyen.ts |
