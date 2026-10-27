<!-- path: docs/steps/STEP-16/AUDIT/PART-27.md -->
# Audit part 27 of 41: features 2575 to 2673

First pass, made by a script: the words of each feature are looked for in the code (paths and contents of `app`, `components`, `lib`, `services`, `config`, `cron`, `migrations`, `scripts`, `sql`, `public`).
It is a map to the likely files, not a verdict: a match does not prove that the feature works, and a missing word does not prove that it is missing (the code may use other words, and a line in Bengali only has nothing to look for).

| Status | Meaning |
|---|---|
| match | at least three of its words meet in one file |
| some-match | two words meet, or its one specific word is found |
| generic-match | only common words are found, nothing specific |
| no-match | none of its words is found in the code |
| manual | the line has no English word, a person must read it |

Totals: match 37, some-match 37, generic-match 4, no-match 5, manual 16. Features outside every STEP line range: 0.

| No | Section | English words of the feature | Status | STEP | Best file |
|---|---|---|---|---|---|
| 2575 | E4 | TikTok Pixel ID | match | 06 | lib/analytics/providers.ts |
| 2576 | E4 | LinkedIn Insight Tag | match | 06 | lib/analytics/providers.ts |
| 2577 | E4 | X Twitter Pixel | match | 06 | lib/analytics/start-provider.ts |
| 2578 | E4 | Pinterest Tag optional | match | 06 | lib/social/rules.ts |
| 2579 | E4 | Microsoft Clarity Project ID | match | 06 | lib/analytics/providers.ts |
| 2580 | E4 | Microsoft Clarity | match | 06 | lib/analytics/providers.ts |
| 2581 | E4 | Hotjar optional alternative to Clarity | some-match | 06 | scripts/check-no-pan.sh |
| 2582 | E5 | ID | manual | 06 | - |
| 2583 | E5 | ID owner GA4/Pixel | match | 06 | lib/analytics/start-provider.ts |
| 2584 | E5 | consent-based | some-match | 06 | services/bnpl/installments.ts |
| 2585 | E5 | GTM first then others | some-match | 06 | lib/analytics/start-provider.ts |
| 2586 | E5 | ad blocker detection | generic-match | 06 | lib/payment/adapters/nmi.ts |
| 2587 | E5 | firing verification | some-match | 06 | scripts/verify/step12-nmi.ts |
| 2588 | E5 | load time | some-match | 06 | app/global-error.tsx |
| 2589 | E6 | simplified in-app | some-match | 06 | app/robots.ts |
| 2590 | E6 | public site | some-match | 06 | app/robots.ts |
| 2591 | E6 | UTM | no-match | 06 | - |
| 2592 | E6 | (Bengali only) | manual | 06 | - |
| 2593 | E6 | (Bengali only) | manual | 06 | - |
| 2594 | E6 | (Bengali only) | manual | 06 | - |
| 2595 | E6 | top pages | some-match | 06 | scripts/verify/step09-calc.ts |
| 2596 | E6 | custom events | some-match | 06 | services/payroll/run-rules.ts |
| 2597 | F1 | A/B CTA | some-match | 06 | migrations/S06_007_marketing.sql |
| 2598 | F1 | A/B variant A vs B | some-match | 06 | app/(client-portal)/p/[token]/page.tsx |
| 2599 | F1 | A/B 50/50 70/30 | manual | 06 | - |
| 2600 | F1 | A/B conversion event | match | 06 | sql/assertions/s06_007_marketing.sql |
| 2601 | F1 | A/B auto-calculate | some-match | 06 | services/invoice/prepare.ts |
| 2602 | F1 | A/B conversion rate confidence | match | 06 | lib/fx/rates.ts |
| 2603 | F1 | A/B after significance | some-match | 06 | lib/marketing/significance.ts |
| 2604 | F1 | A/B/C/D | manual | 06 | - |
| 2605 | F1 | CTA text color position size | match | 06 | styles/globals.css |
| 2606 | F1 | A/B | manual | 06 | - |
| 2607 | F1 | A/B | manual | 06 | - |
| 2608 | F2 | SSL GDPR SOC2 Trusted by X companies | match | 06 | lib/i18n/strings/en/s05-storage.ts |
| 2609 | F2 | recently signed up social proof widget | match | 06 | lib/cms/defaults/legal.ts |
| 2610 | F2 | X invoices sent this month | match | 06 | services/payroll/run-rules.ts |
| 2611 | F2 | X companies trust us | some-match | 06 | lib/i18n/strings/en/s16-gateway.ts |
| 2612 | F2 | wall trusted brands | generic-match | 06 | lib/storage/validate/magic.ts |
| 2613 | F2 | CMS public site | match | 06 | app/robots.ts |
| 2614 | F2 | auto-rotate | some-match | 06 | services/gateway/upstream.ts |
| 2615 | F2 | (Bengali only) | manual | 06 | - |
| 2616 | F2 | Google Review | match | 06 | services/storage/admin-ops.ts |
| 2617 | F2 | G2/Capterra optional | some-match | 06 | services/payroll/run-rules.ts |
| 2618 | F2 | PCI SOC2 ISO | generic-match | 06 | config/processors.ts |
| 2619 | F3 | interactive per plan | no-match | 06 | - |
| 2620 | F3 | ROI hours saved per month | match | 06 | services/payroll/structures.ts |
| 2621 | F3 | public site desktop | generic-match | 06 | app/robots.ts |
| 2622 | F3 | offer urgency | some-match | 06 | app/api/retention/offer/route.ts |
| 2623 | F3 | CTA | some-match | 06 | migrations/S06_007_marketing.sql |
| 2624 | F3 | conversion funnel | match | 06 | scripts/verify/step09-core.ts |
| 2625 | F3 | no signup | some-match | 06 | app/(admin)/admin/analytics/page.tsx |
| 2626 | F3 | per page per CTA | some-match | 06 | migrations/S06_007_marketing.sql |
| 2627 | F3 | where users leave | some-match | 06 | services/payroll/calc-rules.ts |
| 2628 | F3 | Clarity/Hotjar | match | 06 | scripts/check-no-pan.sh |
| 2629 | G1 | drag-and-drop | match | 06 | components/onboarding/logo-upload.tsx |
| 2630 | G1 | (Bengali only) | manual | 06 | - |
| 2631 | G1 | dynamic segments | some-match | 06 | config/s16-gateway.ts |
| 2632 | G1 | send date/time | some-match | 06 | services/payroll/run-rules.ts |
| 2633 | G1 | A/B subject line content | match | 06 | app/(admin)/admin/_components/people-actions.tsx |
| 2634 | G1 | sent/opened/clicked | match | 06 | app/(dashboard)/client-mail/page.tsx |
| 2635 | G1 | (Bengali only) | manual | 06 | - |
| 2636 | G2 | visual flow | no-match | 06 | - |
| 2637 | G2 | signup day 1/3/7/14 | match | 06 | app/(admin)/admin/analytics/page.tsx |
| 2638 | G2 | trial paid conversion | match | 06 | lib/i18n/strings/en/s14-wallet.ts |
| 2639 | G2 | free pro | match | 06 | lib/cms/defaults/pricing.ts |
| 2640 | G2 | churned re-engage | some-match | 06 | services/platform/controls.ts |
| 2641 | G2 | feature adoption | no-match | 06 | - |
| 2642 | G2 | if opened skip next | match | 06 | services/messaging/campaigns.ts |
| 2643 | G2 | (Bengali only) | manual | 06 | - |
| 2644 | G3 | CMS | some-match | 06 | app/robots.ts |
| 2645 | G3 | public site | some-match | 06 | app/robots.ts |
| 2646 | G3 | customizable fields | no-match | 06 | - |
| 2647 | G3 | behavior-based rule engine | some-match | 06 | lib/email/template-body.ts |
| 2648 | G3 | (Bengali only) | manual | 06 | - |
| 2649 | G3 | public site | some-match | 06 | app/robots.ts |
| 2650 | G3 | public | some-match | 06 | app/layout.tsx |
| 2651 | G3 | UTM in-app for campaigns | some-match | 06 | sql/assertions/s06_007_marketing.sql |
| 2652 | G3 | UTM source/medium/campaign | match | 06 | services/siem/siem-service.ts |
| 2653 | G3 | signup trial paid | match | 06 | config/trial.ts |
| 2654 | H1 | (Bengali only) | manual | 07 | - |
| 2655 | H1 | (Bengali only) | manual | 07 | - |
| 2656 | H1 | SMTP Universal SMTP any provider | match | 07 | migrations/S05_006_email.sql |
| 2657 | H1 | Stripe/PayPal/Rapyd/Adyen | match | 07 | config/processors.ts |
| 2658 | H1 | Free Starter Pro Enterprise | match | 07 | lib/i18n/strings/en/s07-company.ts |
| 2659 | H1 | app marketing mail | some-match | 07 | lib/cms/defaults/legal.ts |
| 2660 | H1 | Global Payout Partners | match | 07 | cron/jobs/s14-payouts.ts |
| 2661 | H1 | WhatsApp Meta Cloud API | match | 07 | scripts/verify/step11-verifone.ts |
| 2662 | H1 | GA4/GTM | match | 07 | lib/analytics/start-provider.ts |
| 2663 | H1 | (Bengali only) | manual | 07 | - |
| 2664 | H1 | settings re-run wizard | match | 07 | services/company/platform-setup.ts |
| 2665 | H2 | api/health DB/SMTP/Storage/Gateway | match | 07 | lib/i18n/strings/en/s07-company.ts |
| 2666 | H2 | Supabase | some-match | 07 | services/payroll/runs.ts |
| 2667 | H2 | Google Drive | match | 07 | migrations/S05_003_storage_adapters.sql |
| 2668 | H2 | SMTP | some-match | 07 | migrations/S05_006_email.sql |
| 2669 | H2 | Payment gateway per gateway | some-match | 07 | app/api/integrations/settlement/payouts/route.ts |
| 2670 | H2 | WhatsApp | some-match | 07 | app/robots.ts |
| 2671 | H2 | build/version | some-match | 07 | scripts/verify/step16-automation.ts |
| 2672 | H2 | version info | some-match | 07 | services/payroll/portal.ts |
| 2673 | I1 | entitlement server-side | match | 06,14 | services/payment/embed.ts |
