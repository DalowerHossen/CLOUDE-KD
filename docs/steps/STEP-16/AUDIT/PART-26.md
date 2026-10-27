<!-- path: docs/steps/STEP-16/AUDIT/PART-26.md -->
# Audit part 26 of 41: features 2476 to 2574

First pass, made by a script: the words of each feature are looked for in the code (paths and contents of `app`, `components`, `lib`, `services`, `config`, `cron`, `migrations`, `scripts`, `sql`, `public`).
It is a map to the likely files, not a verdict: a match does not prove that the feature works, and a missing word does not prove that it is missing (the code may use other words, and a line in Bengali only has nothing to look for).

| Status | Meaning |
|---|---|
| match | at least three of its words meet in one file |
| some-match | two words meet, or its one specific word is found |
| generic-match | only common words are found, nothing specific |
| no-match | none of its words is found in the code |
| manual | the line has no English word, a person must read it |

Totals: match 47, some-match 29, generic-match 10, no-match 2, manual 11. Features outside every STEP line range: 0.

| No | Section | English words of the feature | Status | STEP | Best file |
|---|---|---|---|---|---|
| 2476 | C2 | auto-suggest | some-match | 06 | lib/migration/rules.ts |
| 2477 | C2 | auto | manual | 06 | - |
| 2478 | C2 | views read time | some-match | 06 | services/payroll/register.ts |
| 2479 | C2 | optional moderated | some-match | 06 | services/payroll/run-rules.ts |
| 2480 | C2 | RSS auto-generated | generic-match | 06 | app/(public)/blog/page.tsx |
| 2481 | C2 | by month/category | match | 06 | scripts/verify/step12-rapyd.ts |
| 2482 | C2 | full-text | manual | 06 | - |
| 2483 | C3 | all transactional emails | some-match | 05,06 | migrations/S02_005_approvals.sql |
| 2484 | C3 | HTML variables | match | 05,06 | scripts/verify/step16-automation.ts |
| 2485 | C3 | invoice_no amount client_name | some-match | 05,06 | services/payroll/run-rules.ts |
| 2486 | C3 | desktop mobile | match | 05,06 | components/email/template-manager.tsx |
| 2487 | C3 | to admin email | manual | 05,06 | - |
| 2488 | C3 | (Bengali only) | manual | 05,06 | - |
| 2489 | C3 | default | manual | 05,06 | - |
| 2490 | C3 | invoice/payment/subscription/system | some-match | 05,06 | scripts/verify/step12-nmi.ts |
| 2491 | C4 | uptime all services | some-match | 06 | components/marketing/status-view.tsx |
| 2492 | C4 | API Dashboard Payments Email | some-match | 06 | app/(dashboard)/suppliers/new/page.tsx |
| 2493 | C4 | operational/degraded/outage/maintenance | match | 06 | scripts/verify/step06-core.ts |
| 2494 | C4 | per service real-time | manual | 06 | - |
| 2495 | C4 | 90 days per service | some-match | 06 | services/payroll/run-rules.ts |
| 2496 | C4 | title description severity | match | 06 | services/seo/audit.ts |
| 2497 | C4 | investigating/identified/monitoring/resolved | match | 06 | lib/support/status.ts |
| 2498 | C4 | chronological updates | no-match | 06 | - |
| 2499 | C4 | from monitoring alert | match | 06 | scripts/verify/step06-core.ts |
| 2500 | C4 | auto-close on recovery | some-match | 06 | lib/cms/defaults/help.ts |
| 2501 | C4 | email/SMS notifications | match | 06 | migrations/S04_006_alerting_incidents.sql |
| 2502 | C4 | past incidents | generic-match | 06 | cron/jobs/s09-overdue.ts |
| 2503 | C4 | global toggle | some-match | 06 | components/layout/topbar.tsx |
| 2504 | C4 | start/end banner | match | 06 | components/shared/notice-banner.tsx |
| 2505 | C4 | all pages dismissible | no-match | 06 | - |
| 2506 | D1 | JSON-LD Organization company info logo contacts | match | 06 | lib/seo/jsonld.ts |
| 2507 | D1 | JSON-LD Product SaaS product pricing features | match | 06 | scripts/verify/step06-seo.ts |
| 2508 | D1 | JSON-LD SoftwareApplication app type OS pricing | match | 06 | scripts/verify/step06-seo.ts |
| 2509 | D1 | JSON-LD FAQ FAQ page expandable | match | 06 | scripts/verify/step06-core.ts |
| 2510 | D1 | JSON-LD BreadcrumbList all pages | match | 06 | scripts/verify/step06-seo.ts |
| 2511 | D1 | JSON-LD Article blog posts | match | 06 | scripts/verify/step06-core.ts |
| 2512 | D1 | JSON-LD Review testimonials | match | 06 | services/payment/payments.ts |
| 2513 | D1 | JSON-LD LocalBusiness address hours | match | 06 | scripts/verify/step07-core.ts |
| 2514 | D1 | JSON-LD Google Rich Results Test | match | 06 | scripts/verify/step16-webhooks-out.ts |
| 2515 | D1 | JSON-LD from CMS data | match | 06 | services/integration/connections.ts |
| 2516 | D1 | JSON-LD admin override | match | 06 | services/email/settings-store.ts |
| 2517 | D2 | OG OpenGraph per page | some-match | 06 | app/layout.tsx |
| 2518 | D2 | OG URL per page | some-match | 06 | app/robots.ts |
| 2519 | D2 | Twitter Card summary_large_image per page | match | 06 | app/layout.tsx |
| 2520 | D2 | URL auto-generated | match | 06 | services/storage/prepare.ts |
| 2521 | D2 | title description OG Twitter | match | 06 | app/layout.tsx |
| 2522 | D2 | page_title KD SOLUTION IT | some-match | 06 | lib/helpdesk/rules.ts |
| 2523 | D2 | auto from content | some-match | 06 | app/not-found.tsx |
| 2524 | D2 | index/noindex follow/nofollow | match | 06 | components/marketing/cms-page.tsx |
| 2525 | D3 | sitemap.xml CMS | match | 06 | app/robots.ts |
| 2526 | D3 | Sitemap on content change | match | 06 | services/blog/admin.ts |
| 2527 | D3 | Sitemap multiple sitemaps | generic-match | 06 | app/robots.ts |
| 2528 | D3 | robots.txt admin-editable | match | 06 | scripts/verify/step07-core.ts |
| 2529 | D3 | robots.txt default rules | generic-match | 06 | app/robots.ts |
| 2530 | D3 | noindex auto | some-match | 06 | services/cms/cms-service.ts |
| 2531 | D3 | noindex auto | some-match | 06 | services/cms/cms-service.ts |
| 2532 | D4 | SEO per page 0-100 | some-match | 06 | app/robots.ts |
| 2533 | D4 | auto-scan weekly | generic-match | 06 | scripts/integration-check.sh |
| 2534 | D4 | H1 H2 H3 no skips | some-match | 06 | scripts/verify/step16-automation.ts |
| 2535 | D4 | alt lint runtime check | generic-match | 06 | app/layout.tsx |
| 2536 | D4 | (Bengali only) | manual | 06 | - |
| 2537 | D4 | self-referencing | some-match | 06 | scripts/verify/step16-automation.ts |
| 2538 | D4 | Core Web Vitals LCP INP CLS | some-match | 06 | lib/cms/defaults/legal.ts |
| 2539 | D4 | (Bengali only) | manual | 06 | - |
| 2540 | D4 | SSL all pages HTTPS | match | 06 | lib/integrations/webhook-transport.ts |
| 2541 | D4 | (Bengali only) | manual | 06 | - |
| 2542 | D4 | (Bengali only) | manual | 06 | - |
| 2543 | D4 | (Bengali only) | manual | 06 | - |
| 2544 | D4 | manual input rank check | some-match | 06 | migrations/S05_006_email.sql |
| 2545 | D4 | GSC API | some-match | 06 | scripts/verify/step11-verifone.ts |
| 2546 | D5 | Google Search Console auto-verify DNS/HTML | match | 06 | scripts/verify/step05-core.ts |
| 2547 | D5 | Bing Webmaster | some-match | 06 | lib/seo/settings.ts |
| 2548 | D5 | Yandex Webmaster optional | generic-match | 06 | lib/seo/settings.ts |
| 2549 | D5 | Baidu Webmaster optional China | generic-match | 06 | services/payroll/run-rules.ts |
| 2550 | D5 | Naver Webmaster optional Korea | generic-match | 06 | services/payroll/run-rules.ts |
| 2551 | D5 | Search engine submission auto-ping on publish | match | 06 | lib/i18n/strings/en/s07-company.ts |
| 2552 | E1 | GA4 Measurement ID admin panel | match | 06 | lib/i18n/strings/en/s07-company.ts |
| 2553 | E1 | GA4 page_view scroll click | match | 06 | lib/analytics/start-provider.ts |
| 2554 | E1 | GA4 signup | match | 06 | lib/analytics/start-provider.ts |
| 2555 | E1 | GA4 invoice_created | some-match | 06 | lib/analytics/start-provider.ts |
| 2556 | E1 | GA4 payment_received | some-match | 06 | lib/analytics/start-provider.ts |
| 2557 | E1 | GA4 subscription_started | match | 06 | lib/i18n/strings/en/s07-company.ts |
| 2558 | E1 | GA4 subscription_cancelled | match | 06 | lib/i18n/strings/en/s07-company.ts |
| 2559 | E1 | GA4 purchase payment success | match | 06 | scripts/verify/step06-core.ts |
| 2560 | E1 | GA4 plan role tenant_id | some-match | 06 | lib/analytics/start-provider.ts |
| 2561 | E1 | GA4 key events | match | 06 | lib/analytics/start-provider.ts |
| 2562 | E1 | GA4 admin | some-match | 06 | lib/analytics/start-provider.ts |
| 2563 | E2 | GTM Container ID admin panel | match | 06 | app/(dashboard)/invoices/[id]/page.tsx |
| 2564 | E2 | GTM dataLayer all events | match | 06 | lib/analytics/start-provider.ts |
| 2565 | E2 | GTM GDPR-compliant | generic-match | 06 | lib/analytics/start-provider.ts |
| 2566 | E2 | GTM admin | some-match | 06 | lib/analytics/start-provider.ts |
| 2567 | E3 | Meta Pixel ID admin panel | match | 06 | lib/env/s06.ts |
| 2568 | E3 | Meta Pixel PageView Lead Purchase | match | 06 | scripts/verify/step06-core.ts |
| 2569 | E3 | Meta Conversions API CAPI | match | 06 | lib/env/s06.ts |
| 2570 | E3 | CAPI Purchase server-side post-payment | match | 06 | services/analytics/pixels.ts |
| 2571 | E3 | CAPI Lead signup | match | 06 | services/analytics/pixels.ts |
| 2572 | E3 | CAPI CompleteRegistration | match | 06 | services/analytics/pixels.ts |
| 2573 | E3 | CAPI event_id client server | match | 06 | services/analytics/pixels.ts |
| 2574 | E3 | Meta Pixel GDPR | match | 06 | lib/env/s06.ts |
