<!-- path: docs/steps/STEP-16/AUDIT/PART-21.md -->
# Audit part 21 of 41: features 1981 to 2079

First pass, made by a script: the words of each feature are looked for in the code (paths and contents of `app`, `components`, `lib`, `services`, `config`, `cron`, `migrations`, `scripts`, `sql`, `public`).
It is a map to the likely files, not a verdict: a match does not prove that the feature works, and a missing word does not prove that it is missing (the code may use other words, and a line in Bengali only has nothing to look for).

| Status | Meaning |
|---|---|
| match | at least three of its words meet in one file |
| some-match | two words meet, or its one specific word is found |
| generic-match | only common words are found, nothing specific |
| no-match | none of its words is found in the code |
| manual | the line has no English word, a person must read it |

Totals: match 51, some-match 33, generic-match 2, no-match 0, manual 13. Features outside every STEP line range: 0.

| No | Section | English words of the feature | Status | STEP | Best file |
|---|---|---|---|---|---|
| 1981 | A4 | invoice.sent WhatsApp to client | some-match | 16 | app/robots.ts |
| 1982 | A4 | invoice.overdue.7d WhatsApp reminder | match | 16 | sql/assertions/s09_011_dunning.sql |
| 1983 | A4 | invoice.overdue.14d WhatsApp escalation | match | 16 | migrations/S02_005_approvals.sql |
| 1984 | A4 | payment.received WhatsApp thank you | some-match | 16 | lib/ocr/extract-rules.ts |
| 1985 | A4 | estimate.approved WhatsApp confirmation | match | 16 | services/estimate/public.ts |
| 1986 | A4 | subscription.renewal WhatsApp reminder | match | 16 | cron/jobs/s14-subscriptions.ts |
| 1987 | A4 | if amount X if client tag Y | match | 16 | services/messaging/campaigns.ts |
| 1988 | A4 | business hours only | match | 16 | services/contract/library.ts |
| 1989 | A4 | WhatsApp fail Email SMS | match | 16 | scripts/verify/step16-messaging.ts |
| 1990 | A4 | enable/disable per rule | match | 16 | app/(admin)/admin/retention/_components/retention-manager.tsx |
| 1991 | A4 | per trigger per message | some-match | 16 | scripts/verify/step16-automation.ts |
| 1992 | A4 | dry-run mode | match | 16 | lib/migration/rules.ts |
| 1993 | A5 | select clients send all | some-match | 16 | services/payroll/runs.ts |
| 1994 | A5 | date time | some-match | 16 | services/payroll/run-rules.ts |
| 1995 | A5 | by tag balance last invoice | match | 16 | sql/assertions/s08_002_client_search.sql |
| 1996 | A5 | approved template | match | 16 | services/payroll/runs.ts |
| 1997 | A5 | before send | manual | 16 | - |
| 1998 | A5 | real-time | manual | 16 | - |
| 1999 | A5 | sent/delivered/read/failed | match | 16 | migrations/S05_006_email.sql |
| 2000 | A5 | A/B two templates split audience | match | 16 | lib/messaging/rules.ts |
| 2001 | A5 | Meta tier-based | match | 16 | services/whatsapp/accounts.ts |
| 2002 | A5 | (Bengali only) | manual | 16 | - |
| 2003 | A6 | sent delivered read | some-match | 16 | migrations/S05_006_email.sql |
| 2004 | A6 | per status change | some-match | 16 | services/payroll/runs.ts |
| 2005 | A6 | blue tick timestamp | match | 16 | lib/payment/adapters/bluesnap/webhook.ts |
| 2006 | A6 | invalid number blocked rate limit | match | 16 | lib/errors/app-error.ts |
| 2007 | A6 | failed retry schedule | match | 16 | services/payout/payouts.ts |
| 2008 | A6 | per message per campaign | some-match | 16 | sql/assertions/s06_007_marketing.sql |
| 2009 | A6 | WhatsApp per conversation Meta pricing | match | 16 | scripts/verify/step16-whatsapp-campaigns.ts |
| 2010 | A6 | WhatsApp per tenant per month | some-match | 16 | services/payroll/run-rules.ts |
| 2011 | A7 | WhatsApp client messages | match | 16 | app/api/admin/system/tenant-export/route.ts |
| 2012 | A7 | per client per invoice | manual | 16 | - |
| 2013 | A7 | owner in-app | some-match | 16 | app/robots.ts |
| 2014 | A7 | owner client from dashboard | some-match | 16 | app/(dashboard)/suppliers/new/page.tsx |
| 2015 | A7 | rule-based | manual | 16 | - |
| 2016 | A7 | to support ticket | some-match | 16 | lib/helpdesk/rules.ts |
| 2017 | A7 | client sent files | some-match | 16 | services/payroll/run-rules.ts |
| 2018 | A7 | client shared location | match | 16 | app/(dashboard)/accounting/assets/page.tsx |
| 2019 | A8 | WhatsApp opt-in per client | some-match | 16 | scripts/verify/step09-calc.ts |
| 2020 | A8 | WhatsApp opt-in timestamp method | match | 16 | scripts/verify/step16-gateway.ts |
| 2021 | A8 | WhatsApp opt-out STOP keyword | match | 16 | services/whatsapp/inbound.ts |
| 2022 | A8 | WhatsApp opt-out do not message | match | 16 | migrations/S08_002_client_search.sql |
| 2023 | A8 | WhatsApp 24-hour window Meta policy | match | 16 | lib/i18n/strings/en/s16-whatsapp.ts |
| 2024 | A8 | WhatsApp outside 24h window | match | 16 | services/gateway/ingest.ts |
| 2025 | A8 | WhatsApp Meta dashboard | match | 16 | lib/env/s16.ts |
| 2026 | A8 | WhatsApp keep 2 | some-match | 16 | scripts/verify/step11-verifone.ts |
| 2027 | B1 | OAuth2 per platform | some-match | 16 | services/storage/drive-link.ts |
| 2028 | B1 | OAuth AES-256 encrypted | match | 16 | services/encryption/encryption-service.ts |
| 2029 | B1 | OAuth auto before expiry | match | 16 | lib/auth/session.ts |
| 2030 | B1 | connected/expired/error | match | 16 | migrations/S05_003_storage_adapters.sql |
| 2031 | B1 | one-click | some-match | 16 | lib/middleware/bot-detector.ts |
| 2032 | B1 | revoke access | match | 16 | services/payroll/portal.ts |
| 2033 | B1 | multiple pages per platform | some-match | 16 | scripts/verify/step11-stripe.ts |
| 2034 | B1 | post/read/analytics | some-match | 16 | cron/jobs/s16-social-hourly.ts |
| 2035 | B2 | Facebook Page Graph API | match | 16 | config/s16-social.ts |
| 2036 | B2 | Instagram Business Graph API | match | 16 | lib/social/meta-oauth.ts |
| 2037 | B2 | LinkedIn Company Page Marketing API | match | 16 | config/s16-social.ts |
| 2038 | B2 | X Twitter v2 API | some-match | 16 | app/layout.tsx |
| 2039 | B2 | Threads Meta API | match | 16 | config/s16-social.ts |
| 2040 | B2 | Telegram Channel Bot API | match | 16 | lib/i18n/strings/en/s16-social.ts |
| 2041 | B2 | Pinterest v5 API | some-match | 16 | migrations/S16_013_social_networks.sql |
| 2042 | B2 | character limits image sizes | match | 16 | lib/i18n/strings/en/s08-crm.ts |
| 2043 | B2 | (Bengali only) | manual | 16 | - |
| 2044 | B2 | (Bengali only) | manual | 16 | - |
| 2045 | B3 | monthly/weekly view | match | 16 | app/sitemap.ts |
| 2046 | B3 | (Bengali only) | manual | 16 | - |
| 2047 | B3 | rich text emoji hashtags | match | 16 | lib/social/rules.ts |
| 2048 | B3 | image/video/carousel | generic-match | 16 | lib/middleware/bot-detector.ts |
| 2049 | B3 | Google Drive integration | match | 16 | lib/cms/defaults/features.ts |
| 2050 | B3 | per platform accurate rendering | some-match | 16 | services/email/templates.ts |
| 2051 | B3 | per platform limit | some-match | 16 | services/payroll/runs.ts |
| 2052 | B3 | trending saved | some-match | 16 | services/payroll/runs.ts |
| 2053 | B3 | saved groups | match | 16 | app/(dashboard)/subscriptions/billing/_components/retention-flow.tsx |
| 2054 | B3 | CTA trackable UTM | some-match | 16 | migrations/S06_007_marketing.sql |
| 2055 | B3 | optional | some-match | 16 | services/payroll/run-rules.ts |
| 2056 | B3 | username | some-match | 16 | lib/payment/adapters/bluesnap/api.ts |
| 2057 | B4 | date time timezone | some-match | 16 | app/(dashboard)/account/profile/page.tsx |
| 2058 | B4 | (Bengali only) | manual | 16 | - |
| 2059 | B4 | upcoming scheduled posts | generic-match | 16 | components/invoice/recurring-form.tsx |
| 2060 | B4 | drag-drop | match | 16 | components/onboarding/logo-upload.tsx |
| 2061 | B4 | scheduled | some-match | 16 | scripts/build-cron-manifest.mjs |
| 2062 | B4 | engagement-based | some-match | 16 | migrations/S05_006_email.sql |
| 2063 | B4 | per platform per day | some-match | 16 | services/payroll/run-rules.ts |
| 2064 | B4 | recurring patterns | match | 16 | scripts/verify/step12-nmi.ts |
| 2065 | B5 | (Bengali only) | manual | 16 | - |
| 2066 | B5 | Instagram Facebook | match | 16 | config/s16-social.ts |
| 2067 | B5 | LinkedIn X | some-match | 16 | services/project/billing.ts |
| 2068 | B5 | (Bengali only) | manual | 16 | - |
| 2069 | B5 | event platforms template | match | 16 | services/payroll/runs.ts |
| 2070 | B5 | enable/disable | match | 16 | app/(admin)/admin/retention/_components/retention-manager.tsx |
| 2071 | B5 | (Bengali only) | manual | 16 | - |
| 2072 | B6 | old posts recycle | match | 16 | migrations/S16_006_social_schedule.sql |
| 2073 | B6 | every X days/weeks | match | 16 | services/budget/forecast.ts |
| 2074 | B6 | shuffle text change image | match | 16 | services/company/logo.ts |
| 2075 | B6 | add/remove/prioritize | some-match | 16 | services/payout/schedule.ts |
| 2076 | B6 | minimum posts in queue | match | 16 | config/permissions/s14-payouts.ts |
| 2077 | B7 | staff draft owner approve auto publish | match | 16 | services/payroll/runs.ts |
| 2078 | B7 | draft/pending/approved/rejected | match | 16 | services/contract/send-gate.ts |
| 2079 | B7 | owner | manual | 16 | - |
