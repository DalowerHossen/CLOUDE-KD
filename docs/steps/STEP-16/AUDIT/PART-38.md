<!-- path: docs/steps/STEP-16/AUDIT/PART-38.md -->
# Audit part 38 of 41: features 3664 to 3762

First pass, made by a script: the words of each feature are looked for in the code (paths and contents of `app`, `components`, `lib`, `services`, `config`, `cron`, `migrations`, `scripts`, `sql`, `public`).
It is a map to the likely files, not a verdict: a match does not prove that the feature works, and a missing word does not prove that it is missing (the code may use other words, and a line in Bengali only has nothing to look for).

| Status | Meaning |
|---|---|
| match | at least three of its words meet in one file |
| some-match | two words meet, or its one specific word is found |
| generic-match | only common words are found, nothing specific |
| no-match | none of its words is found in the code |
| manual | the line has no English word, a person must read it |

Totals: match 64, some-match 20, generic-match 10, no-match 3, manual 2. Features outside every STEP line range: 0.

| No | Section | English words of the feature | Status | STEP | Best file |
|---|---|---|---|---|---|
| 3664 | B | integrity check client hash vs server hash | match | 05 | services/storage/storage-core.ts |
| 3665 | B | signed URL short-lived 1 hour | match | 05 | services/payroll/runs.ts |
| 3666 | B | prevent bulk exfiltration | match | 05 | config/security.ts |
| 3667 | B | who downloaded what when | match | 05 | lib/i18n/strings/en/s13-portal.ts |
| 3668 | B | export files tenant ID embedded | match | 05 | scripts/verify/step05-files.ts |
| 3669 | B | retention policy auto-delete after N years | match | 05 | app/api/subscriptions/change/route.ts |
| 3670 | B | quarantine suspicious files isolated for review | match | 05 | services/storage/prepare.ts |
| 3671 | C1 | append-only no update no delete | some-match | 02,04 | services/incident/incident-service.ts |
| 3672 | C1 | hash-chain each entry hash of previous current | match | 02,04 | migrations/S02_004_audit.sql |
| 3673 | C1 | Merkle tree root periodic tamper-proof | match | 02,04 | sql/assertions/s02_004_audit.sql |
| 3674 | C1 | write-once storage Google Drive immutable bucket | match | 02,04 | services/storage/providers.ts |
| 3675 | C1 | cryptographic signing Ed25519 per entry | match | 02,04 | services/audit/checkpoint.ts |
| 3676 | C1 | timestamp authority NTP-synced UTC | some-match | 02,04 | lib/utils/date.ts |
| 3677 | C1 | sequence number gap detection | match | 02,04 | sql/assertions/s02_004_audit.sql |
| 3678 | C1 | integrity check periodic hash verification | match | 02,04 | services/audit/checkpoint.ts |
| 3679 | C1 | export CSV/JSON/SIEM format | match | 02,04 | lib/compliance/audit-export.ts |
| 3680 | C1 | retention 7 years minimum configurable | match | 02,04 | config/storage.ts |
| 3681 | C1 | search filter by user action resource time | match | 02,04 | services/export/exports.ts |
| 3682 | C1 | alert suspicious pattern detection | some-match | 02,04 | services/company/admin.ts |
| 3683 | C2 | SIEM log forwarding Syslog CEF LEEF format | match | 02,04 | scripts/verify/step04-core.ts |
| 3684 | C2 | SIEM integration Splunk HEC API | match | 02,04 | scripts/verify/step04-core.ts |
| 3685 | C2 | SIEM integration Elastic SIEM Elasticsearch | match | 02,04 | config/ownership.json |
| 3686 | C2 | SIEM integration Datadog Logs API | some-match | 02,04 | config/ownership.json |
| 3687 | C2 | SIEM integration AWS CloudWatch Logs | match | 02,04 | lib/i18n/strings/en/s04-security.ts |
| 3688 | C2 | SIEM integration Azure Sentinel Log Analytics | match | 02,04 | config/ownership.json |
| 3689 | C2 | SIEM integration Google Chronicle UDM format | match | 02,04 | lib/security/siem/formats.ts |
| 3690 | C2 | SIEM correlation rules cross-event pattern detection | match | 02,04 | scripts/verify/step04-core.ts |
| 3691 | C2 | SIEM dashboard security events overview | match | 02,04 | config/ownership.json |
| 3692 | C2 | SIEM alert escalation critical super_admin CEO | match | 02,04 | lib/i18n/strings/en/s04-security.ts |
| 3693 | C2 | Real-time event streaming Kafka/Redis Streams ready | some-match | 02,04 | services/contract/send-gate.ts |
| 3694 | C2 | Event normalization common schema for all log sources | match | 02,04 | scripts/check-no-pan.sh |
| 3695 | C2 | Threat intelligence feed integration IOC matching | match | 02,04 | services/bankfeed/ports.ts |
| 3696 | D1 | login time IP device actions | match | 04 | sql/assertions/s04_003_signals.sql |
| 3697 | D1 | deviation from baseline | some-match | 04 | scripts/integration-check.sh |
| 3698 | D1 | unusual hours | match | 04 | lib/integrations/api-key-rules.ts |
| 3699 | D1 | impossible travel | match | 04 | lib/security/signals.ts |
| 3700 | D1 | sudden spike | no-match | 04 | - |
| 3701 | D1 | unusual data access pattern | match | 04 | services/auth/actor.ts |
| 3702 | D1 | unusual amount/frequency/recipient | match | 04 | scripts/verify/step09-core.ts |
| 3703 | D1 | ATO signals | some-match | 04 | scripts/verify/step12-nmi.ts |
| 3704 | D1 | mid-session IP/device change | match | 04 | services/auth/session-service.ts |
| 3705 | D1 | admin_staff unusual activity | match | 04 | services/auth/actor.ts |
| 3706 | D2 | 0-100 | manual | 04,10 | - |
| 3707 | D2 | BIN country bank card type | match | 04,10 | scripts/verify/step12-rapyd.ts |
| 3708 | D2 | IP- | manual | 04,10 | - |
| 3709 | D2 | known device for this card | match | 04,10 | lib/cms/defaults/legal.ts |
| 3710 | D2 | cards per hour transactions per day | match | 04,10 | scripts/verify/step10-flow.ts |
| 3711 | D2 | per transaction per day per month | match | 04,10 | lib/i18n/strings/en/s16-system.ts |
| 3712 | D2 | new client new card high amount | match | 04,10 | services/bnpl/offers.ts |
| 3713 | D2 | just below threshold | some-match | 04,10 | app/(dashboard)/payroll/settings/page.tsx |
| 3714 | D2 | excessive refund requests | match | 04,10 | scripts/verify/step12-nmi.ts |
| 3715 | D2 | friendly fraud signals | match | 04,10 | migrations/S04_003_signals_down.sql |
| 3716 | D2 | tenant risk level | some-match | 04,10 | scripts/verify/step16-tenant-insight.ts |
| 3717 | D2 | payer risk level | match | 04,10 | scripts/verify/step16-public-api.ts |
| 3718 | D2 | connected suspicious accounts | generic-match | 04,10 | config/s16-social.ts |
| 3719 | D2 | configurable if/then rules | no-match | 04,10 | - |
| 3720 | D2 | A/B shadow mode | some-match | 04,10 | components/ui/card.tsx |
| 3721 | D2 | investigation workflow | some-match | 04,10 | migrations/S13_007_owner_workflows.sql |
| 3722 | D2 | card IP device email phone | match | 04,10 | scripts/verify/step13-portal.ts |
| 3723 | D2 | trusted clients | some-match | 04,10 | lib/storage/validate/magic.ts |
| 3724 | D2 | daily/weekly/monthly | match | 04,10 | lib/payment/payout.ts |
| 3725 | D3 | fake name real SSN | generic-match | 03,04 | scripts/verify/step12-nmi.ts |
| 3726 | D3 | new account higher risk | match | 03,04 | services/kyc/review.ts |
| 3727 | D3 | same device/IP/bank | match | 03,04 | lib/i18n/strings/en/s07-company.ts |
| 3728 | D3 | login anomaly 2FA | generic-match | 03,04 | scripts/verify/step16-tenant-insight.ts |
| 3729 | D3 | known breach passwords | match | 03,04 | services/auth/password-hash.ts |
| 3730 | D3 | behavioral signals | match | 03,04 | lib/cms/defaults/legal.ts |
| 3731 | E1 | public/internal/confidential/restricted | match | 02 | migrations/S02_007_compliance.sql |
| 3732 | E1 | data origin processing storage | match | 02 | scripts/verify/step16-automation.ts |
| 3733 | E1 | per data type per jurisdiction | some-match | 02 | lib/compliance/retention.ts |
| 3734 | E1 | cron delete | some-match | 02 | cron/jobs/s09-overdue.ts |
| 3735 | E1 | collect only what s needed | match | 02 | lib/cms/defaults/legal.ts |
| 3736 | E1 | DSAR | some-match | 02 | lib/auth/roles.ts |
| 3737 | E1 | machine-readable GDPR Art. 20 | match | 02 | services/compliance/dsar.ts |
| 3738 | E1 | GDPR Art. 17 complete data wipe | some-match | 02 | lib/i18n/strings/en/s06-public.ts |
| 3739 | E1 | GDPR Art. 16 | generic-match | 02 | lib/compliance/jurisdictions.ts |
| 3740 | E1 | GDPR Art. 18 | generic-match | 02 | lib/compliance/jurisdictions.ts |
| 3741 | E1 | GDPR Art. 21 | generic-match | 02 | lib/compliance/jurisdictions.ts |
| 3742 | E1 | per user per purpose timestamped | generic-match | 02 | lib/domain/hostnames.ts |
| 3743 | E1 | instant all channels | generic-match | 02 | lib/integrations/mapping-rules.ts |
| 3744 | E1 | for regulators | no-match | 02 | - |
| 3745 | E2 | GDPR EU | some-match | 02 | lib/compliance/jurisdictions.ts |
| 3746 | E2 | CCPA/CPRA California | match | 02 | lib/compliance/jurisdictions.ts |
| 3747 | E2 | LGPD Brazil | match | 02 | lib/compliance/jurisdictions.ts |
| 3748 | E2 | PDPA Singapore | match | 02 | lib/compliance/jurisdictions.ts |
| 3749 | E2 | PDPA Thailand | match | 02 | lib/compliance/jurisdictions.ts |
| 3750 | E2 | PIPEDA Canada | match | 02 | lib/compliance/jurisdictions.ts |
| 3751 | E2 | APPI Japan | match | 02 | lib/compliance/jurisdictions.ts |
| 3752 | E2 | PDPB India | some-match | 02 | lib/compliance/jurisdictions.ts |
| 3753 | E2 | POPIA South Africa | match | 02 | lib/compliance/jurisdictions.ts |
| 3754 | E2 | DIFC UAE | match | 02 | lib/compliance/jurisdictions.ts |
| 3755 | E2 | PIPL China | match | 02 | lib/compliance/jurisdictions.ts |
| 3756 | E2 | COPPA US children 13 | some-match | 02 | app/layout.tsx |
| 3757 | E2 | FERPA US education ready | some-match | 02 | services/project/billing.ts |
| 3758 | E2 | HIPAA US healthcare ready BAA template | match | 02 | lib/tax/templates.ts |
| 3759 | E2 | PCI DSS SAQ-A | generic-match | 02 | config/processors.ts |
| 3760 | E2 | SOC 2 Type II ready | generic-match | 02 | sql/assertions/s16_005_social.sql |
| 3761 | E2 | ISO 27001 ready | match | 02 | lib/payment/mor-engine.ts |
| 3762 | E2 | ISO 27701 Privacy ready | match | 02 | lib/payment/mor-engine.ts |
