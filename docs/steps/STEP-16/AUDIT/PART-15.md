<!-- path: docs/steps/STEP-16/AUDIT/PART-15.md -->
# Audit part 15 of 41: features 1387 to 1485

First pass, made by a script: the words of each feature are looked for in the code (paths and contents of `app`, `components`, `lib`, `services`, `config`, `cron`, `migrations`, `scripts`, `sql`, `public`).
It is a map to the likely files, not a verdict: a match does not prove that the feature works, and a missing word does not prove that it is missing (the code may use other words, and a line in Bengali only has nothing to look for).

| Status | Meaning |
|---|---|
| match | at least three of its words meet in one file |
| some-match | two words meet, or its one specific word is found |
| generic-match | only common words are found, nothing specific |
| no-match | none of its words is found in the code |
| manual | the line has no English word, a person must read it |

Totals: match 41, some-match 29, generic-match 6, no-match 2, manual 21. Features outside every STEP line range: 0.

| No | Section | English words of the feature | Status | STEP | Best file |
|---|---|---|---|---|---|
| 1387 | C1 | (Bengali only) | manual | 10,11 | - |
| 1388 | C1 | (Bengali only) | manual | 10,11 | - |
| 1389 | C1 | server-side prevent tampering | generic-match | 10,11 | lib/payment/adapters/fastspring/webhook.ts |
| 1390 | C1 | USD base | match | 10,11 | scripts/verify/step12-nmi.ts |
| 1391 | C2 | per transaction | some-match | 10,11 | scripts/verify/step12-nmi.ts |
| 1392 | C2 | gateway method amount currency status | match | 10,11 | scripts/verify/step12-nmi.ts |
| 1393 | C2 | gateway transaction ID | match | 10,11 | scripts/verify/step12-nmi.ts |
| 1394 | C2 | client IP user agent geo | generic-match | 10,11 | app/robots.ts |
| 1395 | C2 | timestamp UTC | match | 10,11 | lib/utils/date.ts |
| 1396 | C2 | fee breakdown gateway fee platform fee | match | 10,11 | scripts/verify/step16-settlement.ts |
| 1397 | C2 | net amount after fees | match | 10,11 | scripts/verify/step16-settlement.ts |
| 1398 | C2 | linked invoice s | some-match | 10,11 | services/project/billing.ts |
| 1399 | C2 | linked client | some-match | 10,11 | services/project/billing.ts |
| 1400 | C2 | (Bengali only) | manual | 10,11 | - |
| 1401 | C3 | PDF branded | generic-match | 10,11,13 | services/payroll/run-rules.ts |
| 1402 | C3 | client instant | some-match | 10,11,13 | lib/integrations/mapping-rules.ts |
| 1403 | C3 | client-facing token link | match | 10,11,13 | lib/middleware/bot-detector.ts |
| 1404 | C3 | auto sequential | some-match | 10,11,13 | components/onboarding/wizard.tsx |
| 1405 | C3 | owner- | manual | 10,11,13 | - |
| 1406 | C3 | Contact seller first | match | 10,11,13 | services/payment/payments.ts |
| 1407 | C3 | (Bengali only) | manual | 10,11,13 | - |
| 1408 | C3 | (Bengali only) | manual | 10,11,13 | - |
| 1409 | C3 | PDF tamper-proof | match | 10,11,13 | lib/pdf/evidence-pack-pdf.tsx |
| 1410 | C4 | gateway API call | match | 10,11,13 | lib/middleware/bot-detector.ts |
| 1411 | C4 | partial amount | some-match | 10,11,13 | services/payroll/run-rules.ts |
| 1412 | C4 | client request/duplicate/fraud/other | match | 10,11,13 | services/dispute/reasons.ts |
| 1413 | C4 | staff owner | manual | 10,11,13 | - |
| 1414 | C4 | (Bengali only) | manual | 10,11,13 | - |
| 1415 | C4 | (Bengali only) | manual | 10,11,13 | - |
| 1416 | C4 | MoR | manual | 10,11,13 | - |
| 1417 | C4 | keep/return | some-match | 10,11,13 | scripts/verify/step11-verifone.ts |
| 1418 | C4 | (Bengali only) | manual | 10,11,13 | - |
| 1419 | C4 | per tenant per period | some-match | 10,11,13 | services/payroll/run-rules.ts |
| 1420 | C4 | owner one-click | some-match | 10,11,13 | lib/middleware/bot-detector.ts |
| 1421 | C5 | partial payment on invoice | generic-match | 10,11 | services/payroll/runs.ts |
| 1422 | C5 | auto-generate | some-match | 10,11 | services/payroll/runs.ts |
| 1423 | C5 | one payment multiple invoices | some-match | 10,11 | scripts/verify/step11-stripe.ts |
| 1424 | C5 | (Bengali only) | manual | 10,11 | - |
| 1425 | C5 | (Bengali only) | manual | 10,11 | - |
| 1426 | C5 | remaining due | match | 10,11 | services/accounting/period-rules.ts |
| 1427 | C6 | per payment method | some-match | 10,11 | services/payroll/runs.ts |
| 1428 | C6 | percentage/fixed per gateway | match | 10,11 | lib/utils/currency.ts |
| 1429 | C6 | checkout before payment | some-match | 10,11 | scripts/verify/step12-nmi.ts |
| 1430 | C6 | separate ledger | match | 10,11 | lib/i18n/strings/en/s14-wallet.ts |
| 1431 | C6 | compliance per jurisdiction | match | 10,11 | lib/compliance/retention.ts |
| 1432 | D1 | no invoice required | some-match | 10 | services/payroll/portal.ts |
| 1433 | D1 | per invoice unique | some-match | 10 | sql/assertions/s14_009_bnpl.sql |
| 1434 | D1 | one-click | some-match | 10 | lib/middleware/bot-detector.ts |
| 1435 | D1 | clipboard | some-match | 10 | components/layout/icon-map.tsx |
| 1436 | D1 | WhatsApp/Email/SMS | some-match | 10 | migrations/S04_006_alerting_incidents.sql |
| 1437 | D1 | QR scannable | no-match | 10 | - |
| 1438 | D1 | configurable | no-match | 10 | - |
| 1439 | D1 | (Bengali only) | manual | 10 | - |
| 1440 | D1 | (Bengali only) | manual | 10 | - |
| 1441 | D1 | (Bengali only) | manual | 10 | - |
| 1442 | D1 | shortening inv.kd.io/abc | match | 10 | scripts/verify/step12-nmi.ts |
| 1443 | D2 | branded per tenant | some-match | 10 | components/client/branded-portal-layout.tsx |
| 1444 | D2 | owner | manual | 10 | - |
| 1445 | D2 | (Bengali only) | manual | 10 | - |
| 1446 | D2 | (Bengali only) | manual | 10 | - |
| 1447 | D2 | terms refund policy | match | 10 | sql/assertions/s13_002_consents.sql |
| 1448 | D2 | Pay | some-match | 10 | services/payroll/run-rules.ts |
| 1449 | D2 | Contact seller | match | 10 | services/payment/payments.ts |
| 1450 | D2 | Thank You receipt download | match | 10 | lib/i18n/strings/en/s07-company.ts |
| 1451 | D2 | retry alternative method | match | 10 | lib/api/with-api.ts |
| 1452 | D2 | (Bengali only) | manual | 10 | - |
| 1453 | D2 | A/B conversion optimization | some-match | 10 | sql/assertions/s06_007_marketing.sql |
| 1454 | D3 | iFrame Embed any website | match | 10 | lib/middleware/headers.ts |
| 1455 | D3 | JavaScript SDK | match | 10 | components/payment/processors/paypal/index.tsx |
| 1456 | D3 | SDK KD.pay invoiceId xxx one-line integration | some-match | 10 | scripts/verify/step12-adyen.ts |
| 1457 | D3 | REST API | some-match | 10 | scripts/verify/step12-nmi.ts |
| 1458 | D3 | Shopify App plug-and-play auto invoice | generic-match | 10 | migrations/S16_028_checkout_sessions.sql |
| 1459 | D3 | WooCommerce Plugin plug-and-play | some-match | 10 | lib/integrations/woocommerce.ts |
| 1460 | D3 | WordPress Plugin shortcode/widget | match | 10 | lib/integrations/commerce-http.ts |
| 1461 | D3 | Chrome Extension quick payment link | match | 10 | lib/i18n/strings/en/s16-automation.ts |
| 1462 | D3 | Zapier/Make Trigger any source payment link | match | 10 | lib/i18n/strings/en/s16-automation.ts |
| 1463 | D3 | Webhook Ingestion any source auto invoice payment | match | 10 | scripts/verify/step16-automation.ts |
| 1464 | D3 | SDK developer portal | match | 10 | components/payment/checkout-panel.tsx |
| 1465 | D3 | SDK v1 v2 | some-match | 10 | scripts/verify/step12-adyen.ts |
| 1466 | D3 | SDK sandbox keys | match | 10 | scripts/verify/step12-adyen.ts |
| 1467 | E1 | Apple Pay web mobile | match | 10 | scripts/verify/step04-core.ts |
| 1468 | E1 | Google Pay web mobile | match | 10 | lib/cms/defaults/support.ts |
| 1469 | E1 | Apple Pay | match | 10 | scripts/verify/step04-core.ts |
| 1470 | E1 | Google Pay Merchant ID | match | 10 | scripts/verify/step10-core.ts |
| 1471 | E1 | Apple Pay/GPay checkout prominent | match | 10 | scripts/verify/step04-core.ts |
| 1472 | E1 | Apple Pay/GPay server-side | match | 10 | scripts/verify/step04-core.ts |
| 1473 | E1 | Apple Pay/GPay | match | 10 | scripts/verify/step04-core.ts |
| 1474 | E1 | Apple Pay/GPay priority | match | 10 | scripts/verify/step04-core.ts |
| 1475 | F1 | per tenant auto on KYC approve | match | 10,14 | lib/company/sections.ts |
| 1476 | F1 | real-time per tenant | manual | 10,14 | - |
| 1477 | F1 | credit/debit/hold/release | match | 10,14 | services/wallet/wallet-service.ts |
| 1478 | F1 | race condition prevention | generic-match | 10,14 | lib/storage/validate/pipeline.ts |
| 1479 | F1 | CSV | some-match | 10,14 | services/payroll/run-rules.ts |
| 1480 | F1 | PDF per tenant monthly | match | 10,14 | sql/assertions/s05_002_files.sql |
| 1481 | F1 | low balance negative | match | 10,14 | services/wallet/ledger.ts |
| 1482 | F1 | auto-deduct from future | some-match | 10,14 | services/social/schedules.ts |
| 1483 | F2 | per transaction auto | some-match | 10,14 | scripts/verify/step12-nmi.ts |
| 1484 | F2 | percentage fixed per gateway | match | 10,14 | lib/utils/currency.ts |
| 1485 | F2 | per merchant super_admin | some-match | 10,14 | app/api/integrations/settlement/payouts/route.ts |
