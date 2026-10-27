<!-- path: docs/steps/STEP-16/AUDIT/PART-28.md -->
# Audit part 28 of 41: features 2674 to 2772

First pass, made by a script: the words of each feature are looked for in the code (paths and contents of `app`, `components`, `lib`, `services`, `config`, `cron`, `migrations`, `scripts`, `sql`, `public`).
It is a map to the likely files, not a verdict: a match does not prove that the feature works, and a missing word does not prove that it is missing (the code may use other words, and a line in Bengali only has nothing to look for).

| Status | Meaning |
|---|---|
| match | at least three of its words meet in one file |
| some-match | two words meet, or its one specific word is found |
| generic-match | only common words are found, nothing specific |
| no-match | none of its words is found in the code |
| manual | the line has no English word, a person must read it |

Totals: match 46, some-match 28, generic-match 2, no-match 3, manual 20. Features outside every STEP line range: 0.

| No | Section | English words of the feature | Status | STEP | Best file |
|---|---|---|---|---|---|
| 2674 | I1 | configurable | no-match | 06,14 | - |
| 2675 | I1 | UI soft paywall modal | match | 06,14 | services/entitlement/usage.ts |
| 2676 | I1 | entitlement every API call | match | 06,14 | lib/cms/pricing.ts |
| 2677 | I1 | usage-based per invoice over limit | some-match | 06,14 | config/s16-api.ts |
| 2678 | I1 | visual per feature | no-match | 06,14 | - |
| 2679 | I1 | 80 warning 100 block | match | 06,14 | app/(admin)/admin/fraud/page.tsx |
| 2680 | I1 | server-side strict | some-match | 06,14 | lib/payment/adapters/fastspring/webhook.ts |
| 2681 | I1 | per plan per tenant per user | manual | 06,14 | - |
| 2682 | I1 | UI admin | manual | 06,14 | - |
| 2683 | I1 | gradual percentage-based | some-match | 06,14 | lib/ocr/extract-rules.ts |
| 2684 | I2 | Powered by KD SOLUTION IT Free tier | some-match | 06,14 | lib/i18n/strings/en/s01-core.ts |
| 2685 | I2 | Pro+ | some-match | 06,14 | config/trial.ts |
| 2686 | I2 | Enterprise | some-match | 06,14 | scripts/verify/step06-core.ts |
| 2687 | I2 | Pro+ | some-match | 06,14 | config/trial.ts |
| 2688 | I2 | paid | some-match | 06,14 | services/payroll/run-rules.ts |
| 2689 | I2 | extra features for sale | match | 06,14 | scripts/verify/step16-settlement.ts |
| 2690 | I2 | no login lead magnet | match | 06,14 | types/contracts/common.ts |
| 2691 | I2 | per staff member | some-match | 06,14 | services/invoice/send.ts |
| 2692 | J1 | footer CMS-editable | match | 06 | lib/i18n/strings/en/s06-public.ts |
| 2693 | J1 | Terms of Service versioned acceptance log | match | 06 | services/cms/legal.ts |
| 2694 | J1 | Privacy Policy GDPR/CCPA compliant | match | 06 | lib/i18n/strings/en/s06-public.ts |
| 2695 | J1 | Refund Policy | match | 06 | scripts/verify/step11-stripe.ts |
| 2696 | J1 | Cookie Policy | match | 06 | config/security.ts |
| 2697 | J1 | DPA Data Processing Agreement | match | 06 | lib/cms/defaults/legal.ts |
| 2698 | J1 | auto-updated | manual | 06 | - |
| 2699 | J1 | Acceptable Use Policy | match | 06 | scripts/verify/step06-core.ts |
| 2700 | J1 | SLA 99.9 guarantee | generic-match | 06 | lib/helpdesk/rules.ts |
| 2701 | J1 | GDPR Compliance | match | 06 | lib/compliance/jurisdictions.ts |
| 2702 | J1 | CCPA Compliance | match | 06 | lib/compliance/jurisdictions.ts |
| 2703 | J1 | WCAG 2.1 AA | some-match | 06 | scripts/verify/step01-tokens.mjs |
| 2704 | J2 | detailed CMS-editable | match | 06 | services/invoice/invoices.ts |
| 2705 | J2 | encryption infrastructure compliance | match | 06 | config/ownership.json |
| 2706 | J2 | SOC 2 Type II ready when achieved | match | 06 | services/company/sso.ts |
| 2707 | J2 | ISO 27001 ready when achieved | match | 06 | lib/payment/mor-engine.ts |
| 2708 | J2 | PCI DSS SAQ-A | generic-match | 06 | config/processors.ts |
| 2709 | J2 | GDPR | some-match | 06 | lib/compliance/jurisdictions.ts |
| 2710 | J2 | quarterly summary | match | 06 | services/payroll/report-rules.ts |
| 2711 | J2 | Bounty Program | some-match | 06 | services/compliance/sanctions.ts |
| 2712 | J2 | Responsible Disclosure | match | 06 | lib/cms/legal-pages.ts |
| 2713 | J2 | security.txt well-known/security.txt | match | 06 | app/.well-known/security.txt/route.ts |
| 2714 | J2 | where data is stored | some-match | 06 | lib/middleware/idempotency.ts |
| 2715 | J2 | MoR | manual | 06 | - |
| 2716 | J3 | versioned | some-match | 06 | migrations/S02_003_locks.sql |
| 2717 | J3 | who accepted when which version | match | 06 | lib/cms/defaults/legal.ts |
| 2718 | J3 | Terms re-accept prompt | match | 06 | lib/i18n/strings/en/s06-public.ts |
| 2719 | J3 | Terms IP | some-match | 06 | scripts/verify/step16-settlement.ts |
| 2720 | J3 | GDPR-compliant granular categories | match | 06 | lib/cms/defaults/legal.ts |
| 2721 | J3 | essential/analytics/marketing/functional | match | 06 | lib/i18n/strings/en/s06-public.ts |
| 2722 | J3 | (Bengali only) | manual | 06 | - |
| 2723 | J3 | (Bengali only) | manual | 06 | - |
| 2724 | K1 | MRR Monthly Recurring Revenue | match | 14 | services/subscription/client-reports.ts |
| 2725 | K1 | ARR Annual Recurring Revenue | match | 14 | lib/i18n/strings/en/s07-company.ts |
| 2726 | K1 | LTV Lifetime Value | match | 14 | app/(dashboard)/subscriptions/page.tsx |
| 2727 | K1 | signup month retention | match | 14 | lib/i18n/strings/en/s06-public.ts |
| 2728 | K1 | by plan by gateway by country | match | 14 | scripts/verify/step12-nmi.ts |
| 2729 | K1 | MoM YoY | manual | 14 | - |
| 2730 | K1 | NRR | some-match | 14 | lib/i18n/strings/en/s14-wallet.ts |
| 2731 | K1 | monthly annual | match | 14 | services/payroll/payroll-rules.ts |
| 2732 | K1 | (Bengali only) | manual | 14 | - |
| 2733 | K1 | MoR own-gateway | match | 14 | sql/assertions/s16_019_gateway.sql |
| 2734 | K1 | (Bengali only) | manual | 14 | - |
| 2735 | K1 | (Bengali only) | manual | 14 | - |
| 2736 | K2 | engagement payment support | some-match | 14 | migrations/S05_006_email.sql |
| 2737 | K2 | login frequency invoice count payment delay | some-match | 14 | scripts/verify/step16-tenant-insight.ts |
| 2738 | K2 | new/active/churned per month | match | 14 | services/payroll/run-rules.ts |
| 2739 | K2 | by plan by usage by industry | match | 14 | lib/i18n/strings/en/s15-accounting.ts |
| 2740 | K2 | trial paid | match | 14 | config/trial.ts |
| 2741 | K2 | (Bengali only) | manual | 14 | - |
| 2742 | K2 | (Bengali only) | manual | 14 | - |
| 2743 | K2 | (Bengali only) | manual | 14 | - |
| 2744 | K2 | (Bengali only) | manual | 14 | - |
| 2745 | K3 | all services | manual | 14 | - |
| 2746 | K3 | API p50/p95/p99 | some-match | 14 | app/sitemap.ts |
| 2747 | K3 | per endpoint | some-match | 14 | scripts/verify/step16-automation.ts |
| 2748 | K3 | per service 30/90 days | some-match | 14 | services/payroll/run-rules.ts |
| 2749 | K3 | query time connections | match | 14 | services/integration/connections.ts |
| 2750 | K3 | usage Google Drive per tenant | match | 14 | services/storage/drive-link.ts |
| 2751 | K3 | (Bengali only) | manual | 14 | - |
| 2752 | K3 | per gateway | some-match | 14 | app/api/integrations/settlement/payouts/route.ts |
| 2753 | K3 | (Bengali only) | manual | 14 | - |
| 2754 | K3 | cron | some-match | 14 | cron/jobs/s09-overdue.ts |
| 2755 | L1 | DB-backed | some-match | 07 | services/entitlement/register.ts |
| 2756 | L1 | pending/processing/completed/failed | match | 07 | scripts/verify/step12-rapyd.ts |
| 2757 | L1 | failed jobs | match | 07 | services/payroll/runs.ts |
| 2758 | L1 | per job per run | match | 07 | cron/jobs/s15-budgets.ts |
| 2759 | L1 | large reports | match | 07 | lib/payment/mor-engine.ts |
| 2760 | L1 | processing/ready/downloaded | match | 07 | lib/i18n/strings/en/s14-wallet.ts |
| 2761 | L1 | signed URL expiry | match | 07 | scripts/verify/step12-adyen.ts |
| 2762 | L2 | UI admin | manual | 07 | - |
| 2763 | L2 | per plan/tenant/user | manual | 07 | - |
| 2764 | L2 | global toggles | some-match | 07 | components/layout/topbar.tsx |
| 2765 | L2 | global toggle | some-match | 07 | components/layout/topbar.tsx |
| 2766 | L2 | per tenant | manual | 07 | - |
| 2767 | L2 | feature flag kill switch | match | 07 | app/(admin)/admin/system/_components/system-panel.tsx |
| 2768 | L3 | cron dead man s switch | match | 07 | services/payment/webhook-core.ts |
| 2769 | L3 | external status page | some-match | 07 | scripts/verify/step16-settlement.ts |
| 2770 | L3 | monthly | some-match | 07 | app/sitemap.ts |
| 2771 | L3 | configurable | no-match | 07 | - |
| 2772 | L3 | email/Slack/Webhook | match | 07 | scripts/verify/step04-core.ts |
