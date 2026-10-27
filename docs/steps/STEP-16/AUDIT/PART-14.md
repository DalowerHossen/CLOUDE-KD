<!-- path: docs/steps/STEP-16/AUDIT/PART-14.md -->
# Audit part 14 of 41: features 1288 to 1386

First pass, made by a script: the words of each feature are looked for in the code (paths and contents of `app`, `components`, `lib`, `services`, `config`, `cron`, `migrations`, `scripts`, `sql`, `public`).
It is a map to the likely files, not a verdict: a match does not prove that the feature works, and a missing word does not prove that it is missing (the code may use other words, and a line in Bengali only has nothing to look for).

| Status | Meaning |
|---|---|
| match | at least three of its words meet in one file |
| some-match | two words meet, or its one specific word is found |
| generic-match | only common words are found, nothing specific |
| no-match | none of its words is found in the code |
| manual | the line has no English word, a person must read it |

Totals: match 61, some-match 24, generic-match 5, no-match 0, manual 9. Features outside every STEP line range: 0.

| No | Section | English words of the feature | Status | STEP | Best file |
|---|---|---|---|---|---|
| 1288 | A3 | PayPal Venmo US | match | 11 | lib/payment/adapters/paypal.ts |
| 1289 | A4 | Paddle Vendor ID/Auth Code encrypted | match | 11,12 | scripts/verify/step12-payproglobal.ts |
| 1290 | A4 | Paddle Checkout hosted overlay | match | 11,12 | config/processors.ts |
| 1291 | A4 | Paddle Webhooks subscription_created payment_succeeded | match | 11,12 | types/contracts/payment-adapter.ts |
| 1292 | A4 | Paddle | some-match | 11,12 | lib/payment/adapters/index.generated.ts |
| 1293 | A4 | Paddle | some-match | 11,12 | lib/payment/adapters/index.generated.ts |
| 1294 | A4 | Paddle Tax auto VAT/GST | match | 11,12 | scripts/verify/step09-calc.ts |
| 1295 | A4 | Paddle | some-match | 11,12 | lib/payment/adapters/index.generated.ts |
| 1296 | A5 | NMI Security Key/Source Key encrypted | match | 11,12 | config/ownership.json |
| 1297 | A5 | NMI Three-Step Redirect 3DS compliant | match | 11,12 | types/contracts/payment-adapter.ts |
| 1298 | A5 | NMI Direct Post server-to-server | generic-match | 11,12 | scripts/verify/step12-nmi.ts |
| 1299 | A5 | NMI save card securely | match | 11,12 | migrations/S10_001_payment_core.sql |
| 1300 | A5 | NMI subscription | match | 11,12 | scripts/verify/step12-nmi.ts |
| 1301 | A5 | NMI ACH/eCheck US bank | match | 11,12 | scripts/verify/step10-flow.ts |
| 1302 | A5 | NMI Webhooks | match | 11,12 | scripts/verify/step12-nmi.ts |
| 1303 | A5 | NMI Void | some-match | 11,12 | scripts/verify/step12-nmi.ts |
| 1304 | A5 | NMI | some-match | 11,12 | scripts/verify/step12-nmi.ts |
| 1305 | A5 | NMI | some-match | 11,12 | scripts/verify/step12-nmi.ts |
| 1306 | A6 | Rapyd Access Key/Secret Key encrypted | match | 11,12 | scripts/verify/step12-rapyd.ts |
| 1307 | A6 | Rapyd Checkout Page hosted | match | 11,12 | config/processors.ts |
| 1308 | A6 | Rapyd Collect API embedded | generic-match | 11,12 | lib/payment/adapters/index.generated.ts |
| 1309 | A6 | Rapyd Wallet API | match | 11,12 | config/ownership.json |
| 1310 | A6 | Rapyd Payout API global 100+ countries | match | 11,12 | types/contracts/payment-adapter.ts |
| 1311 | A6 | Rapyd Webhooks payment_completed payout_completed | match | 11,12 | types/contracts/payment-adapter.ts |
| 1312 | A6 | Rapyd Local Payment Methods Asia LATAM Europe | match | 11,12 | scripts/verify/step12-rapyd.ts |
| 1313 | A6 | Rapyd FX multi-currency conversion | match | 11,12 | scripts/verify/step12-rapyd.ts |
| 1314 | A6 | Rapyd KYC optional built-in | match | 11,12 | lib/payment/mor-engine.ts |
| 1315 | A6 | Rapyd | some-match | 11,12 | lib/payment/adapters/index.generated.ts |
| 1316 | A6 | Rapyd Compliance per country | match | 11,12 | config/ownership.json |
| 1317 | A7 | Adyen API Key/Merchant Account encrypted | match | 11,12 | scripts/verify/step10-core.ts |
| 1318 | A7 | Adyen Checkout API Drop-in/Components | match | 11,12 | components/payment/processors/adyen/index.tsx |
| 1319 | A7 | Adyen Webhooks AUTHORISATION CAPTURE REFUND | match | 11,12 | scripts/verify/step12-adyen.ts |
| 1320 | A7 | Adyen Payout API | match | 11,12 | config/ownership.json |
| 1321 | A7 | Adyen Recurring saved cards subscriptions | match | 11,12 | scripts/verify/step10-core.ts |
| 1322 | A7 | Adyen 3D Secure 2 | match | 11,12 | components/payment/processors/index.generated.ts |
| 1323 | A7 | Adyen Risk Management RevenueProtect | match | 11,12 | config/ownership.json |
| 1324 | A7 | Adyen Multi-currency | match | 11,12 | scripts/verify/step12-adyen.ts |
| 1325 | A7 | Adyen Local Payment Methods 250+ methods | match | 11,12 | scripts/verify/step12-adyen.ts |
| 1326 | A7 | Adyen MarketPay platform/MoR mode | match | 11,12 | scripts/verify/step12-adyen.ts |
| 1327 | A7 | Adyen | some-match | 11,12 | scripts/verify/step12-adyen.ts |
| 1328 | A7 | Adyen Test Card Numbers | match | 11,12 | scripts/verify/step12-adyen.ts |
| 1329 | A8 | admin UI | manual | 11,12 | - |
| 1330 | A8 | API endpoint | some-match | 11,12 | scripts/verify/step16-automation.ts |
| 1331 | A8 | API key/OAuth/HMAC | match | 11,12 | lib/env/s01.ts |
| 1332 | A8 | redirect/iframe/direct | match | 11,12 | components/payment/secure-form-types.ts |
| 1333 | A8 | (Bengali only) | manual | 11,12 | - |
| 1334 | A8 | (Bengali only) | manual | 11,12 | - |
| 1335 | A8 | gateway status KD status | some-match | 11,12 | app/api/integrations/settlement/payouts/route.ts |
| 1336 | A8 | (Bengali only) | manual | 11,12 | - |
| 1337 | A8 | developer guide | generic-match | 11,12 | lib/i18n/strings/en.ts |
| 1338 | B1 | Global Payout Partners | match | 10,12,14 | cron/jobs/s14-payouts.ts |
| 1339 | B1 | Local Payment Methods via Licensed Partners | match | 10,12,14 | config/payment-methods.ts |
| 1340 | B1 | per country per partner | match | 10,12,14 | migrations/S14_003_payouts.sql |
| 1341 | B1 | enable/disable super_admin global owner per tenant | match | 10,12,14 | app/(admin)/admin/retention/_components/retention-manager.tsx |
| 1342 | B1 | country-based auto-show | some-match | 10,12,14 | scripts/verify/step12-nmi.ts |
| 1343 | B1 | checkout display priority | match | 10,12,14 | lib/i18n/strings/en/s10-processors.ts |
| 1344 | B1 | per method per partner | match | 10,12,14 | services/payout/payouts.ts |
| 1345 | B1 | checkout display | some-match | 10,12,14 | scripts/verify/step12-nmi.ts |
| 1346 | B1 | client-facing instructions | generic-match | 12,14 | lib/middleware/bot-detector.ts |
| 1347 | B2 | Local Payment Methods via Licensed Partners Mobile Wallet A bKash-type | match | 12,14 | config/payment-methods.ts |
| 1348 | B2 | Local Payment Methods via Licensed Partners Mobile Wallet B Nagad-type | match | 12,14 | config/payment-methods.ts |
| 1349 | B2 | Local Payment Methods via Licensed Partners Bank Transfer BD Bank | match | 12,14 | config/payment-methods.ts |
| 1350 | B2 | BD Bank manual auto | some-match | 12,14 | services/payroll/run-rules.ts |
| 1351 | B2 | BD Bank owner bank | some-match | 12,14 | services/payroll/run-rules.ts |
| 1352 | B2 | BD Bank owner setup | match | 12,14 | services/payroll/runs.ts |
| 1353 | B3 | ACH USA Bank Transfer incoming | match | 12,14 | migrations/S16_027_payout_kinds.sql |
| 1354 | B3 | ACH USA Bank outgoing | match | 12,14 | lib/i18n/strings/en/s14-wallet.ts |
| 1355 | B3 | Wire Transfer incoming/outgoing | match | 12,14 | lib/i18n/strings/en/s14-wallet.ts |
| 1356 | B3 | USA Bank Plaid/micro-deposit | some-match | 12,14 | scripts/verify/step08-core.ts |
| 1357 | B3 | NACHA batch ACH | generic-match | 12,14 | scripts/verify/step12-nmi.ts |
| 1358 | B3 | ACH | some-match | 12,14 | services/payout/methods.ts |
| 1359 | B4 | Local Payment Methods via Licensed Partners India UPI-type | match | 12,14 | config/payment-methods.ts |
| 1360 | B4 | Local Payment Methods via Licensed Partners Philippines GCash-type | match | 12,14 | config/payment-methods.ts |
| 1361 | B4 | Local Payment Methods via Licensed Partners Thailand PromptPay-type | match | 12,14 | config/payment-methods.ts |
| 1362 | B4 | Local Payment Methods via Licensed Partners Singapore PayNow-type | match | 12,14 | lib/cms/defaults/support.ts |
| 1363 | B4 | Local Payment Methods via Licensed Partners China Alipay/WeChat-type optional | match | 12,14 | lib/i18n/strings/en/s07-company.ts |
| 1364 | B4 | Local Payment Methods via Licensed Partners Malaysia DuitNow-type | match | 12,14 | lib/cms/defaults/support.ts |
| 1365 | B4 | Local Payment Methods via Licensed Partners Vietnam MoMo-type | match | 12,14 | config/payment-methods.ts |
| 1366 | B4 | Local Payment Methods via Licensed Partners Indonesia OVO/GoPay-type | match | 12,14 | config/payment-methods.ts |
| 1367 | B4 | Local Payment Methods via Licensed Partners Japan PayPay-type | match | 12,14 | config/payment-methods.ts |
| 1368 | B4 | Local Payment Methods via Licensed Partners South Korea KakaoPay-type | match | 12,14 | config/payment-methods.ts |
| 1369 | B5 | Partner API keys endpoints encrypted | match | 12,14 | migrations/S14_003_payouts.sql |
| 1370 | B5 | Partner per partner | some-match | 12,14 | app/(public)/[slug]/page.tsx |
| 1371 | B5 | Partner partner down alternative | match | 12,14 | services/bnpl/installments.ts |
| 1372 | B5 | Partner | some-match | 12,14 | app/(public)/[slug]/page.tsx |
| 1373 | B5 | Partner | some-match | 12,14 | app/(public)/[slug]/page.tsx |
| 1374 | B5 | Partner | some-match | 12,14 | app/(public)/[slug]/page.tsx |
| 1375 | B5 | admin | manual | 12,14 | - |
| 1376 | B5 | (Bengali only) | manual | 12,14 | - |
| 1377 | C1 | invoice checkout | some-match | 10,11 | scripts/verify/step12-nmi.ts |
| 1378 | C1 | dynamic per tenant config | some-match | 10,11 | app/robots.ts |
| 1379 | C1 | (Bengali only) | manual | 10,11 | - |
| 1380 | C1 | gateway call | match | 10,11 | lib/middleware/bot-detector.ts |
| 1381 | C1 | status update receipt notification | match | 10,11 | services/dispute/refund-requests.ts |
| 1382 | C1 | error message retry alternative method | match | 10,11 | lib/api/with-api.ts |
| 1383 | C1 | async methods | some-match | 10,11 | services/payroll/runs.ts |
| 1384 | C1 | (Bengali only) | manual | 10,11 | - |
| 1385 | C1 | (Bengali only) | manual | 10,11 | - |
| 1386 | C1 | idempotency key | some-match | 10,11 | lib/middleware/idempotency.ts |
