<!-- path: docs/steps/STEP-16/AUDIT/PART-24.md -->
# Audit part 24 of 41: features 2278 to 2376

First pass, made by a script: the words of each feature are looked for in the code (paths and contents of `app`, `components`, `lib`, `services`, `config`, `cron`, `migrations`, `scripts`, `sql`, `public`).
It is a map to the likely files, not a verdict: a match does not prove that the feature works, and a missing word does not prove that it is missing (the code may use other words, and a line in Bengali only has nothing to look for).

| Status | Meaning |
|---|---|
| match | at least three of its words meet in one file |
| some-match | two words meet, or its one specific word is found |
| generic-match | only common words are found, nothing specific |
| no-match | none of its words is found in the code |
| manual | the line has no English word, a person must read it |

Totals: match 34, some-match 32, generic-match 9, no-match 4, manual 20. Features outside every STEP line range: 0.

| No | Section | English words of the feature | Status | STEP | Best file |
|---|---|---|---|---|---|
| 2278 | H2 | who viewed when | match | 13 | services/bnpl/offers.ts |
| 2279 | H2 | unsigned after X days | generic-match | 13 | lib/payment/adapters/fastspring/webhook.ts |
| 2280 | H2 | cancel signature request | match | 13 | scripts/verify/step12-rapyd.ts |
| 2281 | I1 | Email WhatsApp SMS Telegram | match | 16 | lib/i18n/strings/en/s16-messaging.ts |
| 2282 | I1 | primary fail secondary tertiary | match | 16 | scripts/verify/step01-tokens.mjs |
| 2283 | I1 | per event type per tenant | some-match | 16 | services/payroll/run-rules.ts |
| 2284 | I1 | per-client client preference stored | match | 16 | sql/assertions/s05_008_notifications.sql |
| 2285 | I1 | based on client history | some-match | 16 | app/(dashboard)/contracts/[id]/page.tsx |
| 2286 | I1 | per message per channel | some-match | 16 | scripts/verify/step12-adyen.ts |
| 2287 | I1 | monthly per tenant | some-match | 16 | app/sitemap.ts |
| 2288 | I1 | quiet hours per tenant timezone no messages 10pm-8am | match | 16 | sql/assertions/s16_010_messaging.sql |
| 2289 | I1 | (Bengali only) | manual | 16 | - |
| 2290 | I1 | (Bengali only) | manual | 16 | - |
| 2291 | I2 | SMS Twilio/ API-based | generic-match | 16 | migrations/S04_006_alerting_incidents.sql |
| 2292 | I2 | SMS | some-match | 16 | migrations/S04_006_alerting_incidents.sql |
| 2293 | I2 | SMS | some-match | 16 | migrations/S04_006_alerting_incidents.sql |
| 2294 | I2 | SMS | some-match | 16 | migrations/S04_006_alerting_incidents.sql |
| 2295 | I2 | Telegram Bot BotFather token | match | 16 | lib/i18n/strings/en/s16-social.ts |
| 2296 | I2 | Telegram invoice/payment link | match | 16 | lib/i18n/strings/en/s16-social.ts |
| 2297 | I2 | Telegram | some-match | 16 | migrations/S16_013_social_networks.sql |
| 2298 | I2 | Viber optional API-based | generic-match | 16 | config/s16-messaging.ts |
| 2299 | I2 | Viber | some-match | 16 | config/s16-messaging.ts |
| 2300 | I3 | Email WhatsApp SMS | some-match | 16 | migrations/S04_006_alerting_incidents.sql |
| 2301 | I3 | try WhatsApp fallback SMS fallback Email | generic-match | 16 | lib/payment/adapters/fastspring/mapping.ts |
| 2302 | I3 | all channels combined | generic-match | 16 | scripts/verify/step12-adyen.ts |
| 2303 | I3 | A/B channel A vs channel B | some-match | 16 | scripts/verify/step12-adyen.ts |
| 2304 | J1 | CMS-editable searchable | generic-match | 06 | app/robots.ts |
| 2305 | J1 | CRUD admin | no-match | 06 | - |
| 2306 | J1 | (Bengali only) | manual | 06 | - |
| 2307 | J1 | full-text fuzzy | some-match | 06 | services/product/search.ts |
| 2308 | J1 | helpful/not helpful | no-match | 06 | - |
| 2309 | J1 | views search terms | match | 06 | services/client/clients.ts |
| 2310 | J1 | button contextual | no-match | 06 | - |
| 2311 | J1 | per feature | manual | 06 | - |
| 2312 | J1 | CMS-managed | match | 06 | lib/cms/defaults/legal.ts |
| 2313 | J2 | client owner | manual | 06,07 | - |
| 2314 | J2 | CRUD owner/staff | no-match | 06,07 | - |
| 2315 | J2 | low/medium/high/urgent | match | 06,07 | lib/i18n/strings/en/s07-company.ts |
| 2316 | J2 | open/pending/resolved/closed | match | 06,07 | services/company/admin.ts |
| 2317 | J2 | SLA response time resolution time | match | 06,07 | services/support/tickets.ts |
| 2318 | J2 | to staff member | some-match | 06,07 | services/invoice/send.ts |
| 2319 | J2 | pre-built replies | match | 06,07 | services/contract/templates.ts |
| 2320 | J2 | staff-only | manual | 06,07 | - |
| 2321 | J2 | context | some-match | 06,07 | services/payroll/register.ts |
| 2322 | J2 | (Bengali only) | manual | 06,07 | - |
| 2323 | J2 | auto-create ticket from email | some-match | 06,07 | lib/helpdesk/rules.ts |
| 2324 | J2 | WhatsApp- auto-create from WhatsApp reply | some-match | 06,07 | scripts/verify/step12-nmi.ts |
| 2325 | J2 | in-app email | some-match | 06,07 | app/robots.ts |
| 2326 | J2 | volume resolution time satisfaction | match | 06,07 | lib/i18n/strings/en/s07-company.ts |
| 2327 | J3 | NPS in-app email quarterly | generic-match | 07 | lib/helpdesk/opinion.ts |
| 2328 | J3 | NPS | some-match | 07 | lib/helpdesk/opinion.ts |
| 2329 | J3 | NPS trend over time | generic-match | 07 | lib/helpdesk/opinion.ts |
| 2330 | J3 | per feature per interaction | some-match | 07 | scripts/verify/step11-verifone.ts |
| 2331 | J3 | bug/feature/compliment/complaint | some-match | 07 | migrations/S05_006_email.sql |
| 2332 | J3 | auto | manual | 07 | - |
| 2333 | J3 | admin | manual | 07 | - |
| 2334 | K1 | QuickBooks QBO/QBD CSV | match | 08,16 | lib/migration/rules.ts |
| 2335 | K1 | Zoho Books | match | 08,16 | lib/migration/rules.ts |
| 2336 | K1 | Wave | some-match | 08,16 | sql/assertions/s16_011_migration.sql |
| 2337 | K1 | FreshBooks | match | 08,16 | services/payroll/runs.ts |
| 2338 | K1 | Xero | some-match | 08,16 | sql/assertions/s16_011_migration.sql |
| 2339 | K1 | CSV customizable mapping | match | 08,16 | services/export/exports.ts |
| 2340 | K1 | Excel xlsx | match | 08,16 | app/(dashboard)/payroll/reports/page.tsx |
| 2341 | K1 | OFX/QFX bank statements | match | 08,16 | components/accounting/statement-import-form.tsx |
| 2342 | K1 | drag-drop field mapping | match | 08,16 | components/onboarding/logo-upload.tsx |
| 2343 | K1 | first 10 rows | manual | 08,16 | - |
| 2344 | K1 | errors/warnings | some-match | 08,16 | services/payroll/runs.ts |
| 2345 | K1 | duplicate/format | match | 08,16 | migrations/S04_005_siem.sql |
| 2346 | K1 | background job | match | 08,16 | services/import/imports.ts |
| 2347 | K1 | within 24 hours | some-match | 08,16 | services/payroll/run-rules.ts |
| 2348 | K1 | (Bengali only) | manual | 08,16 | - |
| 2349 | K1 | (Bengali only) | manual | 08,16 | - |
| 2350 | K1 | (Bengali only) | manual | 08,16 | - |
| 2351 | K1 | (Bengali only) | manual | 08,16 | - |
| 2352 | K1 | (Bengali only) | manual | 08,16 | - |
| 2353 | K1 | (Bengali only) | manual | 08,16 | - |
| 2354 | A1 | platform-wide stats | generic-match | 07 | migrations/S02_007_compliance.sql |
| 2355 | A1 | active/suspended/trial | match | 07 | lib/i18n/strings/en/s14-wallet.ts |
| 2356 | A1 | MRR/ARR this month/YTD | match | 07 | services/company/admin-metrics.ts |
| 2357 | A1 | owners staff | manual | 07 | - |
| 2358 | A1 | this month | match | 07 | services/payroll/run-rules.ts |
| 2359 | A1 | USD this month | match | 07 | services/payroll/run-rules.ts |
| 2360 | A1 | KYC | some-match | 07 | scripts/verify/step14-settlement.ts |
| 2361 | A1 | open/pending | some-match | 07 | scripts/verify/step12-nmi.ts |
| 2362 | A1 | all services | manual | 07 | - |
| 2363 | A1 | (Bengali only) | manual | 07 | - |
| 2364 | A1 | critical warnings | match | 07 | app/(admin)/admin/security/page.tsx |
| 2365 | A1 | admin tasks | some-match | 07 | services/hr/hr-rules.ts |
| 2366 | A2 | all roles search/filter/sort | match | 07 | services/cms/cms-service.ts |
| 2367 | A2 | name email company role | some-match | 07 | services/payroll/runs.ts |
| 2368 | A2 | role status plan date range | some-match | 07 | app/(dashboard)/suppliers/[id]/statement/page.tsx |
| 2369 | A2 | name created last login plan | some-match | 07 | scripts/verify/step16-tenant-insight.ts |
| 2370 | A2 | profile activity billing | match | 07 | lib/i18n/strings/en/s07-company.ts |
| 2371 | A2 | email verification bypass | some-match | 07 | scripts/verify/step12-nmi.ts |
| 2372 | A2 | Suspend block access keep data | match | 07 | lib/cms/defaults/legal.ts |
| 2373 | A2 | Activate restore from suspend | match | 07 | lib/i18n/strings/en/s16-gateway.ts |
| 2374 | A2 | mark deleted 30-day grace | match | 07 | services/bnpl/installments.ts |
| 2375 | A2 | after grace all data | some-match | 07 | config/auth-lock.ts |
| 2376 | A2 | admin | manual | 07 | - |
