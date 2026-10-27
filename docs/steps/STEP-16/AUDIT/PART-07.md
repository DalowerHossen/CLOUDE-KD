<!-- path: docs/steps/STEP-16/AUDIT/PART-07.md -->
# Audit part 7 of 41: features 595 to 693

First pass, made by a script: the words of each feature are looked for in the code (paths and contents of `app`, `components`, `lib`, `services`, `config`, `cron`, `migrations`, `scripts`, `sql`, `public`).
It is a map to the likely files, not a verdict: a match does not prove that the feature works, and a missing word does not prove that it is missing (the code may use other words, and a line in Bengali only has nothing to look for).

| Status | Meaning |
|---|---|
| match | at least three of its words meet in one file |
| some-match | two words meet, or its one specific word is found |
| generic-match | only common words are found, nothing specific |
| no-match | none of its words is found in the code |
| manual | the line has no English word, a person must read it |

Totals: match 42, some-match 29, generic-match 6, no-match 1, manual 21. Features outside every STEP line range: 0.

| No | Section | English words of the feature | Status | STEP | Best file |
|---|---|---|---|---|---|
| 595 | E1 | active/suspended/invited | match | 07 | migrations/S02_002_tenancy.sql |
| 596 | E1 | with data retention | some-match | 07 | config/storage.ts |
| 597 | E1 | keep data block access | match | 07 | lib/cms/defaults/support.ts |
| 598 | E1 | (Bengali only) | manual | 07 | - |
| 599 | E1 | per plan | manual | 07 | - |
| 600 | E1 | used/available | some-match | 07 | scripts/verify/step16-settlement.ts |
| 601 | E1 | (Bengali only) | manual | 07 | - |
| 602 | E2 | (Bengali only) | manual | 07 | - |
| 603 | E2 | owner | manual | 07 | - |
| 604 | E2 | resource action | match | 07 | services/payroll/runs.ts |
| 605 | E2 | role hierarchy | some-match | 07 | migrations/S15_001_chart_journals.sql |
| 606 | E2 | per individual staff | some-match | 07 | lib/whatsapp/rules.ts |
| 607 | E2 | who changed what | match | 07 | services/payroll/runs.ts |
| 608 | E3 | (Bengali only) | manual | 07 | - |
| 609 | E3 | owner view | manual | 07 | - |
| 610 | E3 | per staff | manual | 07 | - |
| 611 | E3 | task assigned to staff | generic-match | 07 | services/hr/hr-rules.ts |
| 612 | E3 | per staff | manual | 07 | - |
| 613 | E3 | invoices created payments collected | some-match | 07 | config/security.ts |
| 614 | E4 | 2FA owner toggle | some-match | 07 | components/layout/topbar.tsx |
| 615 | E4 | owner | manual | 07 | - |
| 616 | E4 | amount cap per action | match | 07 | services/payroll/structures.ts |
| 617 | E4 | IP optional | some-match | 07 | services/payroll/run-rules.ts |
| 618 | E4 | separate from owner | some-match | 07 | scripts/verify/step11-verifone.ts |
| 619 | E4 | owner staff request owner approve | match | 07 | services/payroll/runs.ts |
| 620 | E4 | owner | manual | 07 | - |
| 621 | E4 | Request send staff draft owner approve send | match | 07 | services/payroll/runs.ts |
| 622 | E4 | staff- send until approved | match | 07 | services/payroll/runs.ts |
| 623 | E4 | owner-only send critical emails | some-match | 07 | app/(admin)/admin/security/page.tsx |
| 624 | F1 | KYC ID front Google Drive encrypted | match | 07 | lib/i18n/strings/en/s05-storage.ts |
| 625 | F1 | KYC ID back Google Drive encrypted | match | 07 | lib/i18n/strings/en/s05-storage.ts |
| 626 | F1 | (Bengali only) | manual | 07 | - |
| 627 | F1 | (Bengali only) | manual | 07 | - |
| 628 | F1 | utility bill bank statement | match | 07 | config/s15-accounting.ts |
| 629 | F1 | 5MB max image/PDF only | match | 07 | scripts/verify/step16-ocr.ts |
| 630 | F1 | in-app | some-match | 07 | app/robots.ts |
| 631 | F1 | KYC docs | match | 07 | sql/assertions/s16_020_sub_merchant_kyc.sql |
| 632 | F1 | magic byte verification | match | 07 | lib/storage/validate/magic.ts |
| 633 | F1 | (Bengali only) | manual | 07 | - |
| 634 | F1 | minimum quality | generic-match | 07 | config/auth-lock.ts |
| 635 | F1 | KYC | some-match | 07 | scripts/verify/step14-settlement.ts |
| 636 | F1 | KYC if rejected | match | 07 | scripts/verify/step14-settlement.ts |
| 637 | F1 | KYC pending/approved/rejected/expired | match | 07 | scripts/verify/step14-settlement.ts |
| 638 | F2 | KYC pending submissions | match | 07 | migrations/S07_003_kyc.sql |
| 639 | F2 | KYC encrypted admin only | match | 07 | migrations/S07_003_kyc.sql |
| 640 | F2 | KYC Approve Reject with reason | match | 07 | components/gateway/kyc-forms.tsx |
| 641 | F2 | KYC internal | match | 07 | lib/notifications/rules.ts |
| 642 | F2 | KYC to owner | some-match | 07 | scripts/verify/step14-settlement.ts |
| 643 | F2 | KYC annual/bi-annual | match | 07 | lib/i18n/strings/en/s07-company.ts |
| 644 | F2 | KYC 30 days before expiry | match | 07 | services/kyc/review.ts |
| 645 | F2 | KYC who reviewed when decision | match | 07 | migrations/S07_003_kyc.sql |
| 646 | F2 | four-eyes | generic-match | 07 | scripts/verify/step16-settlement.ts |
| 647 | F2 | Maker-checker one admin reviews another approves | match | 07 | services/kyc/review.ts |
| 648 | F2 | KYC | some-match | 07 | scripts/verify/step14-settlement.ts |
| 649 | F2 | KYC low/medium/high | match | 07 | scripts/verify/step14-settlement.ts |
| 650 | F3 | KYC verified MoR auto | match | 07 | scripts/verify/step14-settlement.ts |
| 651 | F3 | KYC not verified own gateway only | match | 07 | lib/i18n/strings/en/s07-company.ts |
| 652 | F3 | KYC | some-match | 07 | scripts/verify/step14-settlement.ts |
| 653 | F3 | KYC | some-match | 07 | scripts/verify/step14-settlement.ts |
| 654 | F3 | KYC | some-match | 07 | scripts/verify/step14-settlement.ts |
| 655 | F3 | KYC MoR auto | some-match | 07 | scripts/verify/step14-settlement.ts |
| 656 | F3 | KYC | some-match | 07 | scripts/verify/step14-settlement.ts |
| 657 | G1 | per tenant | manual | 07 | - |
| 658 | G1 | CNAME/TXT record | match | 07 | scripts/verify/step07-core.ts |
| 659 | G1 | DNS step-by-step guide | match | 07 | lib/i18n/strings/en/s07-company.ts |
| 660 | G1 | DNS periodic verification | match | 07 | services/domain/domains.ts |
| 661 | G1 | SSL Let s Encrypt | match | 07 | services/email/settings-store.ts |
| 662 | G1 | SSL auto | some-match | 07 | services/email/settings-store.ts |
| 663 | G1 | SSL | some-match | 07 | services/email/settings-store.ts |
| 664 | G1 | (Bengali only) | manual | 07 | - |
| 665 | G1 | multiple domains | generic-match | 07 | scripts/verify/step11-stripe.ts |
| 666 | G1 | billing.example.com | match | 07 | scripts/verify/step12-nmi.ts |
| 667 | G1 | (Bengali only) | manual | 07 | - |
| 668 | H1 | bell icon | match | 05 | components/layout/icon-map.tsx |
| 669 | H1 | real-time | manual | 05 | - |
| 670 | H1 | chronological | no-match | 05 | - |
| 671 | H1 | single/all | manual | 05 | - |
| 672 | H1 | payment/invoice/system/team | some-match | 05 | services/bnpl/settings.ts |
| 673 | H1 | read/unread/type | some-match | 05 | app/(dashboard)/notifications/page.tsx |
| 674 | H1 | (Bengali only) | manual | 05 | - |
| 675 | H1 | Supabase Realtime instant notification | match | 05 | services/mor/settle.ts |
| 676 | H2 | event channel role | match | 05 | config/permissions/s04-security.ts |
| 677 | H2 | email/WhatsApp/SMS/in-app | some-match | 05 | migrations/S04_006_alerting_incidents.sql |
| 678 | H2 | per user per hour | some-match | 05 | services/payroll/run-rules.ts |
| 679 | H2 | daily summary email | match | 05 | app/(admin)/admin/analytics/page.tsx |
| 680 | H2 | per topic per duration | generic-match | 05 | config/s16-commerce.ts |
| 681 | H2 | (Bengali only) | manual | 05 | - |
| 682 | H2 | preview before save | match | 05 | app/(admin)/admin/blog/_components/post-editor.tsx |
| 683 | H3 | Invoice created owner notification | some-match | 05 | scripts/verify/step11-verifone.ts |
| 684 | H3 | Invoice sent owner confirmation | some-match | 05 | app/api/auth/2fa/enroll/begin/route.ts |
| 685 | H3 | Invoice viewed owner notification | match | 05 | services/contract/send.ts |
| 686 | H3 | Invoice paid owner celebration | generic-match | 05 | services/payroll/run-rules.ts |
| 687 | H3 | Invoice overdue owner alert | match | 05 | services/dispute/deadlines.ts |
| 688 | H3 | Payment received owner notification | some-match | 05 | scripts/verify/step11-verifone.ts |
| 689 | H3 | Payment failed owner alert | match | 05 | services/fraud/reaction.ts |
| 690 | H3 | Estimate approved owner notification | match | 05 | lib/notifications/rules.ts |
| 691 | H3 | Client created owner notification | some-match | 05 | scripts/verify/step11-verifone.ts |
| 692 | H3 | Staff invited staff email | some-match | 05 | services/team/invitations.ts |
| 693 | H3 | KYC status change owner notification | match | 05 | lib/notifications/rules.ts |
