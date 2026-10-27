<!-- path: docs/steps/STEP-16/AUDIT/PART-39.md -->
# Audit part 39 of 41: features 3763 to 3861

First pass, made by a script: the words of each feature are looked for in the code (paths and contents of `app`, `components`, `lib`, `services`, `config`, `cron`, `migrations`, `scripts`, `sql`, `public`).
It is a map to the likely files, not a verdict: a match does not prove that the feature works, and a missing word does not prove that it is missing (the code may use other words, and a line in Bengali only has nothing to look for).

| Status | Meaning |
|---|---|
| match | at least three of its words meet in one file |
| some-match | two words meet, or its one specific word is found |
| generic-match | only common words are found, nothing specific |
| no-match | none of its words is found in the code |
| manual | the line has no English word, a person must read it |

Totals: match 61, some-match 23, generic-match 8, no-match 3, manual 4. Features outside every STEP line range: 0.

| No | Section | English words of the feature | Status | STEP | Best file |
|---|---|---|---|---|---|
| 3763 | E3 | per tenant US/EU/SG/IN/JP | manual | 02 | - |
| 3764 | E3 | storage location lock | match | 02 | lib/cms/blocks.ts |
| 3765 | E3 | (Bengali only) | manual | 02 | - |
| 3766 | E3 | Standard Contractual Clauses SCC | match | 02 | lib/cms/defaults/legal.ts |
| 3767 | E3 | Binding Corporate Rules BCR ready | generic-match | 02 | lib/email/template-body.ts |
| 3768 | E3 | for regulators | no-match | 02 | - |
| 3769 | F | Software Bill of Materials SBOM auto-generation CycloneDX | some-match | 01 | lib/cms/defaults/about.ts |
| 3770 | F | SBOM vulnerability scanning per dependency | generic-match | 01 | app/.well-known/security.txt/route.ts |
| 3771 | F | npm audit CI gate block on high/critical | match | 01 | migrations/S04_006_alerting_incidents.sql |
| 3772 | F | npm outdated check weekly | generic-match | 01 | scripts/integration-check.sh |
| 3773 | F | Dependabot auto-PR security patches | some-match | 01 | app/layout.tsx |
| 3774 | F | Dependency pinning exact versions lockfile committed | match | 01 | scripts/apply-dependency-requests.sh |
| 3775 | F | Lockfile integrity check CI hash verification | match | 01 | scripts/verify/step12-adyen.ts |
| 3776 | F | Transitive dependency audit deep scan | match | 01 | scripts/verify/step16-module-routes.ts |
| 3777 | F | License compliance check MIT/Apache/BSD only | match | 01 | config/ownership.json |
| 3778 | F | License violation alert GPL/AGPL detection | some-match | 01 | lib/security/network/providers.ts |
| 3779 | F | Container image scanning Trivy/Grype | match | 01 | services/cms/media.ts |
| 3780 | F | Base image vulnerability check Node.js Alpine | match | 01 | app/layout.tsx |
| 3781 | F | CI/CD pipeline secret scanning gitleaks truffleHog | some-match | 01 | scripts/verify/step16-settlement-ingest.ts |
| 3782 | F | Pre-commit secret scan hook | match | 01 | lib/email/content.ts |
| 3783 | F | SAST Static Application Security Testing Semgrep | match | 01 | scripts/verify/step04-static.mjs |
| 3784 | F | DAST Dynamic Application Security Testing OWASP ZAP | some-match | 01 | app/layout.tsx |
| 3785 | F | SCA Software Composition Analysis Snyk/Dependabot | generic-match | 01 | scripts/verify/step11-paypal.ts |
| 3786 | F | IaC scanning Infrastructure as Code Checkov | some-match | 01 | config/features.ts |
| 3787 | F | API security testing OWASP API Top 10 | match | 01 | services/payroll/payroll-rules.ts |
| 3788 | F | Supply chain attack detection typosquatting dependency confusion | some-match | 01 | scripts/verify/step16-ocr.ts |
| 3789 | F | Build reproducibility verification | match | 01 | migrations/S03_002_lock_engine.sql |
| 3790 | F | Artifact signing cosign/sigstore | some-match | 01 | scripts/verify/step12-nmi.ts |
| 3791 | F | Build provenance attestation SLSA Level 2 | some-match | 01 | scripts/verify/step16-automation.ts |
| 3792 | F | Third-party API dependency monitoring uptime deprecation | some-match | 01 | config/security.ts |
| 3793 | F | Vendor security assessment per third-party service | match | 01 | components/payment/processors/paypal/index.tsx |
| 3794 | G1 | Application Performance Monitoring APM Sentry | some-match | 04 | lib/env/s01.ts |
| 3795 | G1 | Real User Monitoring RUM page load interactions | match | 04 | lib/i18n/strings/en/s04-security.ts |
| 3796 | G1 | Synthetic monitoring uptime checks every 60s | match | 04 | scripts/verify/step06-core.ts |
| 3797 | G1 | API endpoint monitoring response time error rate | match | 04 | lib/payment/adapters/stripe.ts |
| 3798 | G1 | Database query monitoring slow queries 1s | match | 04 | scripts/verify/step06-core.ts |
| 3799 | G1 | Payment gateway monitoring success rate latency | match | 04 | services/payment/reports.ts |
| 3800 | G1 | Email delivery monitoring bounce rate spam rate | match | 04 | lib/cms/defaults/legal.ts |
| 3801 | G1 | WhatsApp API monitoring delivery rate block rate | match | 04 | lib/cms/defaults/legal.ts |
| 3802 | G1 | Storage monitoring Google Drive quota API limits | match | 04 | lib/cms/defaults/legal.ts |
| 3803 | G1 | Cron job monitoring dead man s switch | match | 04 | services/payment/webhook-core.ts |
| 3804 | G1 | SSL certificate monitoring expiry alerts | match | 04 | lib/i18n/strings/en/s07-company.ts |
| 3805 | G1 | Domain expiry monitoring | match | 04 | lib/cms/pricing.ts |
| 3806 | G1 | DNS monitoring propagation hijacking | match | 04 | lib/email/dns.ts |
| 3807 | G1 | CDN cache hit ratio monitoring | some-match | 04 | lib/api/with-api.ts |
| 3808 | G1 | Error budget tracking SLO/SLI | match | 04 | lib/project/time.ts |
| 3809 | G2 | threshold anomaly pattern | match | 04 | components/payment/refund-form.tsx |
| 3810 | G2 | Email Slack Discord Webhook PagerDuty SMS | match | 04 | lib/i18n/strings/en/s04-security.ts |
| 3811 | G2 | Critical High Medium Low Info | match | 04 | services/siem/siem-service.ts |
| 3812 | G2 | severity channel on-call person | match | 04 | lib/i18n/strings/en/s04-security.ts |
| 3813 | G2 | same alert within 5 min | match | 04 | services/incident/incident-service.ts |
| 3814 | G2 | unacknowledged next level | some-match | 04 | sql/assertions/s04_006_alerting.sql |
| 3815 | G2 | maintenance window | match | 04 | lib/i18n/strings/en/s07-company.ts |
| 3816 | G2 | all alerts acknowledged/resolved | match | 04 | services/incident/incident-service.ts |
| 3817 | G2 | active alerts overview | match | 04 | services/company/admin.ts |
| 3818 | G2 | On-call weekly rotation | match | 04 | lib/payment/payout.ts |
| 3819 | G2 | On-call handoff shift change summary | match | 04 | services/payment/refunds.ts |
| 3820 | G3 | manual auto from alert | some-match | 04 | services/incident/incident-service.ts |
| 3821 | G3 | SEV1-SEV4 | match | 04 | scripts/verify/step06-core.ts |
| 3822 | G3 | CEO/super_admin | some-match | 04 | lib/api/with-api.ts |
| 3823 | G3 | Slack/Discord auto-create channel | match | 04 | migrations/S04_006_alerting_incidents.sql |
| 3824 | G3 | chronological events | some-match | 04 | services/payroll/run-rules.ts |
| 3825 | G3 | investigating/identified/monitoring/resolved | match | 04 | lib/support/status.ts |
| 3826 | G3 | internal customer-facing | match | 04 | services/branding/brand.ts |
| 3827 | G3 | (Bengali only) | manual | 04 | - |
| 3828 | G3 | (Bengali only) | manual | 04 | - |
| 3829 | G3 | per incident type step-by-step | some-match | 04 | services/incident/incident-service.ts |
| 3830 | G3 | MTTD MTTR MTBF | match | 04 | lib/i18n/strings/en/s04-security.ts |
| 3831 | G3 | post-resolution | some-match | 04 | migrations/S16_014_commerce.sql |
| 3832 | G3 | monthly | some-match | 04 | app/sitemap.ts |
| 3833 | G3 | DRP | no-match | 04 | - |
| 3834 | G3 | DR quarterly documented | generic-match | 04 | services/payroll/report-rules.ts |
| 3835 | G3 | RTO/RPO target vs actual | generic-match | 04 | services/export/exports.ts |
| 3836 | H1 | VPN IP known VPN provider IP ranges | match | 04 | config/security.ts |
| 3837 | H1 | Proxy IP HTTP/SOCKS proxy signatures | match | 04 | config/security.ts |
| 3838 | H1 | Tor exit node | match | 04 | scripts/verify/step16-processor-health.ts |
| 3839 | H1 | Datacenter IP AWS/GCP/Azure IP ranges | generic-match | 04 | scripts/verify/step16-processor-health.ts |
| 3840 | H1 | Residential proxy behavioral analysis | match | 04 | scripts/verify/step04-core.ts |
| 3841 | H1 | IP reputation scoring threat intelligence feed | some-match | 04 | migrations/S04_002_network_intel.sql |
| 3842 | H1 | IP geolocation verification IP country vs billing country | match | 04 | scripts/verify/step12-nmi.ts |
| 3843 | H1 | IP velocity check multiple accounts from same IP | generic-match | 04 | services/payment/card-identities.ts |
| 3844 | H1 | VPN/Proxy strict mode | match | 04 | scripts/verify/step16-processor-health.ts |
| 3845 | H1 | VPN/Proxy warning 2FA enforcement | some-match | 04 | scripts/verify/step16-processor-health.ts |
| 3846 | H1 | VPN/Proxy prevent fake accounts | match | 04 | scripts/verify/step16-processor-health.ts |
| 3847 | H1 | KYC VPN/Proxy prevent fraud | match | 04 | lib/i18n/strings/en/s04-security.ts |
| 3848 | H1 | Admin VPN/Proxy zero tolerance | match | 04 | scripts/verify/step04-core.ts |
| 3849 | H1 | VPN/Proxy admin | match | 04 | scripts/verify/step16-processor-health.ts |
| 3850 | H1 | VPN/Proxy corporate VPN for enterprise clients | match | 04 | scripts/verify/step01-core.ts |
| 3851 | H1 | VPN/Proxy daily per endpoint | match | 04 | lib/i18n/strings/en/s04-security.ts |
| 3852 | H1 | VPN/Proxy API integration IPQualityScore/MaxMind | match | 04 | scripts/verify/step16-api-keys.ts |
| 3853 | H2 | IP DNS hostname verification | match | 04 | scripts/verify/step07-core.ts |
| 3854 | H2 | ASN Autonomous System Number | no-match | 04 | - |
| 3855 | H2 | IP range block CIDR notation | some-match | 04 | app/(dashboard)/suppliers/[id]/statement/page.tsx |
| 3856 | H2 | Country-level IP block admin configurable | match | 04 | lib/compliance/rules.ts |
| 3857 | H2 | IP rate limiting per IP per endpoint per minute | match | 04 | config/s16-api.ts |
| 3858 | H2 | IP ban permanent with reason | match | 04 | migrations/S04_001_rate_limits_events.sql |
| 3859 | H2 | IP unban admin with audit log | some-match | 04 | services/payroll/runs.ts |
| 3860 | H2 | Geo-fencing allow only specific countries | match | 04 | config/security.ts |
| 3861 | H2 | Timezone-IP mismatch detection | match | 04 | scripts/verify/step04-core.ts |
