<!-- path: docs/steps/STEP-16/AUDIT/PART-37.md -->
# Audit part 37 of 41: features 3565 to 3663

First pass, made by a script: the words of each feature are looked for in the code (paths and contents of `app`, `components`, `lib`, `services`, `config`, `cron`, `migrations`, `scripts`, `sql`, `public`).
It is a map to the likely files, not a verdict: a match does not prove that the feature works, and a missing word does not prove that it is missing (the code may use other words, and a line in Bengali only has nothing to look for).

| Status | Meaning |
|---|---|
| match | at least three of its words meet in one file |
| some-match | two words meet, or its one specific word is found |
| generic-match | only common words are found, nothing specific |
| no-match | none of its words is found in the code |
| manual | the line has no English word, a person must read it |

Totals: match 39, some-match 42, generic-match 3, no-match 3, manual 12. Features outside every STEP line range: 0.

| No | Section | English words of the feature | Status | STEP | Best file |
|---|---|---|---|---|---|
| 3565 | R3 | in-flight messages snapshot | generic-match | 09,10,14,15 | services/expense/categories.ts |
| 3566 | R3 | historical invoices unchanged | generic-match | 09,10,14,15 | migrations/S09_001_tax_fx.sql |
| 3567 | R3 | slow network | match | 09,10,14,15 | scripts/verify/step16-gateway.ts |
| 3568 | R3 | preserve | some-match | 09,10,14,15 | components/marketing/art/illustrations.tsx |
| 3569 | R4 | Supabase read-only mode | some-match | 09,10,14,15 | services/payroll/runs.ts |
| 3570 | R4 | Google Drive Supabase Storage | match | 09,10,14,15 | migrations/S05_003_storage_adapters.sql |
| 3571 | R4 | SMTP queue retry | match | 09,10,14,15 | sql/assertions/s05_006_email.sql |
| 3572 | R4 | (Bengali only) | manual | 09,10,14,15 | - |
| 3573 | R4 | (Bengali only) | manual | 09,10,14,15 | - |
| 3574 | R4 | monitoring | some-match | 09,10,14,15 | scripts/verify/step06-core.ts |
| 3575 | R4 | auto-scale | some-match | 09,10,14,15 | components/marketing/charts/bar-chart.tsx |
| 3576 | S | request-id | some-match | 04 | services/payroll/runs.ts |
| 3577 | S | payment success rate | match | 04 | services/payroll/runs.ts |
| 3578 | S | API response time p50/p95/p99 | some-match | 04 | app/(client-portal)/p/[token]/payslip/[itemId]/route.ts |
| 3579 | S | email delivery rate | match | 04 | services/integration/commerce-webhook.ts |
| 3580 | S | webhook success rate | match | 04 | services/payment/reports.ts |
| 3581 | S | cron job duration | match | 04 | services/webhookout/dispatch.ts |
| 3582 | S | configurable | no-match | 04 | - |
| 3583 | S | Slack/email | some-match | 04 | scripts/verify/step04-core.ts |
| 3584 | S | cron | some-match | 04 | cron/jobs/s09-overdue.ts |
| 3585 | S | external UptimeRobot/Better Stack | some-match | 04 | scripts/verify/step16-checkout.ts |
| 3586 | S | incident status page | some-match | 04 | services/incident/incident-service.ts |
| 3587 | S | monthly | some-match | 04 | app/sitemap.ts |
| 3588 | S | per incident type | some-match | 04 | services/incident/incident-service.ts |
| 3589 | S | RTO 4h RPO 1h | no-match | 04 | - |
| 3590 | S | quarterly | some-match | 04 | services/payroll/report-rules.ts |
| 3591 | S | (Bengali only) | manual | 04 | - |
| 3592 | S | (Bengali only) | manual | 04 | - |
| 3593 | S | assignment | some-match | 04 | scripts/verify/step04-static.mjs |
| 3594 | S | PagerDuty/Opsgenie | match | 04 | lib/i18n/strings/en/s04-security.ts |
| 3595 | S | (Bengali only) | manual | 04 | - |
| 3596 | S | SLA uptime 99.9 | match | 04 | lib/i18n/strings/en/s06-public.ts |
| 3597 | T | Definition of Done | match | 01 | cron/jobs/s10-webhook-retry.ts |
| 3598 | T | tsc noEmit CI | some-match | 01 | scripts/gen.mjs |
| 3599 | T | next build CI | some-match | 01 | scripts/verify/step16-automation.ts |
| 3600 | T | ESLint error CI | some-match | 01 | app/(public)/blog/[slug]/page.tsx |
| 3601 | T | Bengali-scan CI lint guard | match | 01 | scripts/integration-check.sh |
| 3602 | T | Placeholder-scan TODO/FIXME/... | match | 01 | lib/i18n/strings/en/s08-crm.ts |
| 3603 | T | Dead-link scan CI | match | 01 | scripts/check-all.sh |
| 3604 | T | px CI | manual | 01 | - |
| 3605 | T | a11y axe-core CI | generic-match | 01 | lib/pdf/invoice-pdf.tsx |
| 3606 | T | CI | manual | 01 | - |
| 3607 | T | Chromatic/Percy | no-match | 01 | - |
| 3608 | T | E2E per test run | match | 01 | services/payroll/run-rules.ts |
| 3609 | A2 | CEO | some-match | 02 | lib/api/with-api.ts |
| 3610 | A2 | CEO | some-match | 02 | lib/api/with-api.ts |
| 3611 | A2 | CEO KYC | match | 02 | services/company/admin.ts |
| 3612 | A2 | CEO threshold above | match | 02 | lib/i18n/strings/en/s10-payments.ts |
| 3613 | A2 | CEO admin_staff | some-match | 02 | lib/api/with-api.ts |
| 3614 | A2 | CEO | some-match | 02,07 | lib/api/with-api.ts |
| 3615 | A2 | CEO | some-match | 02,07 | lib/api/with-api.ts |
| 3616 | A2 | CEO | some-match | 02,07 | lib/api/with-api.ts |
| 3617 | A2 | CEO | some-match | 02,07 | lib/api/with-api.ts |
| 3618 | A2 | CEO | some-match | 02,07 | lib/api/with-api.ts |
| 3619 | A2 | CEO super_admin approval | match | 02,07 | services/cms/cms-service.ts |
| 3620 | A2 | CEO super_admin | some-match | 02,07 | lib/api/with-api.ts |
| 3621 | A3 | admin_staff kyc_reviewer KYC | match | 02,07 | app/(admin)/admin/staff/_components/staff-manager.tsx |
| 3622 | A3 | admin_staff payment_processor | some-match | 02,07 | services/payment/review-store.ts |
| 3623 | A3 | admin_staff support_agent | some-match | 02,07 | app/robots.ts |
| 3624 | A3 | admin_staff content_manager CMS/ | match | 02,07 | services/cms/cms-service.ts |
| 3625 | A3 | admin_staff compliance_officer | match | 02,07 | scripts/create-platform-user.mjs |
| 3626 | A3 | admin_staff fraud_analyst | match | 02,07 | scripts/create-platform-user.mjs |
| 3627 | A3 | admin_staff finance_analyst | match | 02,07 | lib/auth/roles.ts |
| 3628 | A3 | admin_staff CEO/super_admin | some-match | 02,07 | lib/api/with-api.ts |
| 3629 | A3 | admin_staff resource action approval_level | some-match | 02,07 | scripts/verify/step16-automation.ts |
| 3630 | A3 | admin_staff | manual | 02,07 | - |
| 3631 | A3 | admin_staff 24/7 | manual | 02,07 | - |
| 3632 | A3 | admin_staff staff CEO super_admin | some-match | 02,07 | lib/api/with-api.ts |
| 3633 | A4 | L1 staff L2 CEO L3 super_admin | some-match | 02 | lib/api/with-api.ts |
| 3634 | A4 | visual drag-drop | match | 02 | components/onboarding/logo-upload.tsx |
| 3635 | A4 | SLA X | some-match | 02 | lib/helpdesk/rules.ts |
| 3636 | A4 | CEO super_admin auto | some-match | 02 | lib/api/with-api.ts |
| 3637 | A4 | (Bengali only) | manual | 02 | - |
| 3638 | A4 | (Bengali only) | manual | 02 | - |
| 3639 | A4 | CEO/super_admin | some-match | 02 | lib/api/with-api.ts |
| 3640 | A4 | in-app email WhatsApp | some-match | 02 | app/robots.ts |
| 3641 | A4 | pending/approved/rejected per level | match | 02 | services/payroll/portal.ts |
| 3642 | A4 | CEO super_admin | some-match | 02 | lib/api/with-api.ts |
| 3643 | B | (Bengali only) | manual | 05 | - |
| 3644 | B | MIME | some-match | 05 | services/payroll/runs.ts |
| 3645 | B | PDF PNG JPG DOCX | match | 05 | lib/storage/validate/mime.ts |
| 3646 | B | SVG XML entity script tag removal | match | 05 | lib/storage/validate/svg.ts |
| 3647 | B | SVG re-encoding rasterize to PNG for untrusted sources | match | 05 | lib/storage/validate/svg.ts |
| 3648 | B | Image metadata strip EXIF GPS camera info | match | 05 | lib/storage/validate/image.ts |
| 3649 | B | Image re-encoding server-side prevent steganography | some-match | 05 | lib/cms/defaults/legal.ts |
| 3650 | B | PDF JavaScript removal embedded scripts strip | match | 05 | lib/storage/validate/pdf.ts |
| 3651 | B | PDF embedded file extraction block | match | 05 | sql/assertions/s15_005_expenses.sql |
| 3652 | B | Office macro removal DOCX XLSX macro strip | match | 05 | scripts/verify/step05-files.ts |
| 3653 | B | ZIP/Archive bomb detection decompression ratio check | match | 05 | lib/storage/validate/zip.ts |
| 3654 | B | ZIP slip vulnerability prevention path traversal check | match | 05 | scripts/verify/step05-files.ts |
| 3655 | B | Polyglot file detection file that is valid as multiple types | match | 05 | scripts/verify/step05-files.ts |
| 3656 | B | per type image 5MB PDF 10MB KYC 5MB | match | 05 | migrations/S07_003_kyc.sql |
| 3657 | B | per user per minute | some-match | 05 | cron/jobs/s09-overdue.ts |
| 3658 | B | per tenant per month | some-match | 05 | services/payroll/run-rules.ts |
| 3659 | B | ClamAV/malware signature | match | 05 | lib/storage/scanner.ts |
| 3660 | B | known malware hash DB | match | 05 | sql/assertions/s05_002_files.sql |
| 3661 | B | path traversal special chars | match | 05 | scripts/verify/step05-files.ts |
| 3662 | B | 30 seconds | some-match | 05 | app/api/plans/migrate/route.ts |
| 3663 | B | large files resume support | match | 05 | services/storage/upload-sessions.ts |
