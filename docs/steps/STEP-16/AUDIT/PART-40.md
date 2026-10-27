<!-- path: docs/steps/STEP-16/AUDIT/PART-40.md -->
# Audit part 40 of 41: features 3862 to 3960

First pass, made by a script: the words of each feature are looked for in the code (paths and contents of `app`, `components`, `lib`, `services`, `config`, `cron`, `migrations`, `scripts`, `sql`, `public`).
It is a map to the likely files, not a verdict: a match does not prove that the feature works, and a missing word does not prove that it is missing (the code may use other words, and a line in Bengali only has nothing to look for).

| Status | Meaning |
|---|---|
| match | at least three of its words meet in one file |
| some-match | two words meet, or its one specific word is found |
| generic-match | only common words are found, nothing specific |
| no-match | none of its words is found in the code |
| manual | the line has no English word, a person must read it |

Totals: match 82, some-match 10, generic-match 1, no-match 0, manual 6. Features outside every STEP line range: 0.

| No | Section | English words of the feature | Status | STEP | Best file |
|---|---|---|---|---|---|
| 3862 | H2 | Network fingerprinting TCP/IP stack analysis | match | 04 | scripts/verify/step13-esign.ts |
| 3863 | H2 | (Bengali only) | manual | 04 | - |
| 3864 | I1 | HTML entity encoding | match | 04 | lib/blog/text.ts |
| 3865 | I1 | JavaScript event handler removal on javascript | match | 04 | scripts/verify/step04-core.ts |
| 3866 | I1 | script tag removal | match | 04 | lib/utils/html-text.ts |
| 3867 | I1 | iframe tag removal | match | 04 | components/shared/safe-html.tsx |
| 3868 | I1 | object embed applet removal | match | 04 | components/shared/safe-html.tsx |
| 3869 | I1 | form tag removal in user content | match | 04 | sql/assertions/s16_020_sub_merchant_kyc.sql |
| 3870 | I1 | svg script removal | match | 04 | app/layout.tsx |
| 3871 | I1 | math script removal | match | 04 | scripts/verify/step16-bankfeed.ts |
| 3872 | I1 | data URI scheme block | match | 04 | components/shared/safe-html.tsx |
| 3873 | I1 | vbscript URI scheme block | match | 04 | components/shared/safe-html.tsx |
| 3874 | I1 | expression CSS removal | match | 04 | lib/email/template-body.ts |
| 3875 | I1 | url CSS injection block | match | 04 | config/security.ts |
| 3876 | I1 | import CSS injection block | match | 04 | components/client/branding-form.tsx |
| 3877 | I1 | template literal injection block | match | 04 | lib/invoice/input.ts |
| 3878 | I1 | prototype pollution pattern block | match | 04 | lib/security/sanitizer.ts |
| 3879 | I1 | server-side template injection SSTI block | some-match | 04 | services/accounting/accounts.ts |
| 3880 | I1 | LDAP injection block | match | 04 | lib/security/zero-trust.ts |
| 3881 | I1 | XML External Entity XXE block | match | 04 | scripts/verify/step05-files.ts |
| 3882 | I1 | command injection block | match | 04 | components/layout/topbar.tsx |
| 3883 | I1 | path traversal block | match | 04 | scripts/verify/step04-core.ts |
| 3884 | I1 | null byte injection block | match | 04 | config/security.ts |
| 3885 | I1 | HTTP header injection block CRLF | match | 04 | config/security.ts |
| 3886 | I1 | SMTP header injection block | match | 04 | migrations/S05_006_email.sql |
| 3887 | I1 | Unicode normalization NFC prevent homoglyph | some-match | 04 | lib/security/sanitizer.ts |
| 3888 | I1 | zero-width character removal | match | 04 | lib/security/sanitizer.ts |
| 3889 | I1 | RTL override character removal | match | 04 | types/contracts/security.ts |
| 3890 | I1 | max length enforcement per field | some-match | 04 | scripts/check-no-any.sh |
| 3891 | I1 | type validation Zod strict mode | some-match | 04 | services/payroll/runs.ts |
| 3892 | I2 | Content-Security-Policy strict nonce-based | match | 04 | app/layout.tsx |
| 3893 | I2 | CSP script-src self nonce-xxx no unsafe-inline | match | 04 | lib/security/csp.ts |
| 3894 | I2 | CSP style-src self nonce-xxx no unsafe-inline | match | 04 | lib/security/csp.ts |
| 3895 | I2 | CSP img-src self https data restricted | match | 04 | lib/security/csp.ts |
| 3896 | I2 | CSP connect-src self API only | match | 04 | lib/security/csp.ts |
| 3897 | I2 | CSP frame-ancestors none no embedding | match | 04 | scripts/verify/step04-core.ts |
| 3898 | I2 | CSP form-action self no external form submission | some-match | 04 | scripts/verify/step04-core.ts |
| 3899 | I2 | CSP base-uri self no base tag hijacking | match | 04 | lib/security/csp.ts |
| 3900 | I2 | CSP object-src none no plugins | match | 04 | scripts/verify/step04-core.ts |
| 3901 | I2 | X-Content-Type-Options nosniff | match | 04 | app/.well-known/security.txt/route.ts |
| 3902 | I2 | X-Frame-Options DENY | match | 04 | migrations/S16_025_embed_origins.sql |
| 3903 | I2 | X-XSS-Protection 1 mode block legacy | match | 04 | config/security.ts |
| 3904 | I2 | Referrer-Policy strict-origin-when-cross-origin | match | 04 | scripts/verify/step04-core.ts |
| 3905 | I2 | Permissions-Policy camera microphone geolocation restricted | match | 04 | lib/security/headers.ts |
| 3906 | I2 | Trusted Types API DOM XSS prevention | some-match | 04 | scripts/verify/step04-core.ts |
| 3907 | I2 | Subresource Integrity SRI for external scripts | match | 04 | components/payment/processors/adyen/index.tsx |
| 3908 | I2 | DOMPurify client-side sanitization all rich text | match | 04 | lib/security/rich-text.ts |
| 3909 | I2 | (Bengali only) | manual | 04 | - |
| 3910 | J1 | One-click Evidence Pack generation per dispute | match | 13 | lib/i18n/strings/en/s13-portal.ts |
| 3911 | J1 | Evidence Pack Invoice PDF immutable snapshot | match | 13 | scripts/verify/step13-evidence.ts |
| 3912 | J1 | Evidence Pack Payment receipt timestamped | match | 13 | config/ownership.json |
| 3913 | J1 | Evidence Pack Consent proof checkbox IP timestamp | match | 13 | lib/i18n/strings/en/s13-portal.ts |
| 3914 | J1 | Evidence Pack Delivery proof tracking confirmation | match | 13 | lib/i18n/strings/en/s13-portal.ts |
| 3915 | J1 | Evidence Pack Communication log emails WhatsApp | match | 13 | services/evidence/collect.ts |
| 3916 | J1 | Evidence Pack Client IP device fingerprint | match | 13 | services/evidence/collect.ts |
| 3917 | J1 | Evidence Pack 3DS authentication proof | match | 13 | lib/i18n/strings/en/s13-portal.ts |
| 3918 | J1 | Evidence Pack Terms refund policy versioned | match | 13 | scripts/verify/step13-evidence.ts |
| 3919 | J1 | Evidence Pack Timeline of events chronological | match | 13 | scripts/verify/step13-evidence.ts |
| 3920 | J1 | Evidence Pack Gateway-ready format Stripe/PayPal/Adyen/NMI | match | 13 | sql/assertions/s13_009_evidence_packs.sql |
| 3921 | J1 | Evidence Pack auto-submit to processor API | match | 13 | lib/i18n/strings/en/s13-portal.ts |
| 3922 | J1 | Evidence Pack download PDF ZIP | match | 13 | components/client/evidence-pack-panel.tsx |
| 3923 | J1 | Evidence Pack email to processor auto | match | 13 | sql/assertions/s13_009_evidence_packs.sql |
| 3924 | J1 | Dispute deadline tracker per case countdown | match | 13 | services/dispute/deadlines.ts |
| 3925 | J1 | Dispute status workflow new evidence submitted won/lost | match | 13 | services/dispute/disputes.ts |
| 3926 | J1 | Dispute win/loss analytics per gateway per reason code | match | 13 | services/dispute/disputes.ts |
| 3927 | J1 | Dispute reason code mapping per processor | match | 13 | scripts/verify/step12-rapyd.ts |
| 3928 | J1 | Chargeback reserve calculator per merchant | match | 13 | scripts/verify/step14-settlement.ts |
| 3929 | J1 | Chargeback rate monitoring 0.65 threshold | some-match | 13 | migrations/S14_001_wallet_ledger.sql |
| 3930 | J1 | Chargeback alert rate approaching threshold | match | 13 | services/wallet/ledger.ts |
| 3931 | J1 | Refund policy auto-display checkout page | match | 13 | scripts/verify/step11-stripe.ts |
| 3932 | J1 | Refund request workflow client owner approve process | match | 13 | lib/payment/adapters/paddle/mapping.ts |
| 3933 | J1 | Refund evidence preservation post-refund audit trail | match | 13 | lib/cms/defaults/support.ts |
| 3934 | K1 | browser OS screen fonts plugins | match | 04 | lib/company/sections.ts |
| 3935 | K1 | ID persistent cross-session | match | 04 | components/payment/processors/adyen/index.tsx |
| 3936 | K1 | mobile/tablet/desktop/bot | match | 04 | lib/i18n/strings/en/s05-storage.ts |
| 3937 | K1 | Canvas WebGL AudioContext | match | 04 | lib/kyc/image-prep.ts |
| 3938 | K1 | (Bengali only) | manual | 04 | - |
| 3939 | K1 | color depth | match | 04 | lib/security/device-collector.tsx |
| 3940 | K1 | language detection | match | 04 | scripts/verify/step16-ocr.ts |
| 3941 | K1 | CPU cores | match | 04 | scripts/verify/step03-core.ts |
| 3942 | K1 | (Bengali only) | manual | 04 | - |
| 3943 | K1 | fraud signal | match | 04 | migrations/S04_003_signals_down.sql |
| 3944 | K1 | (Bengali only) | manual | 04 | - |
| 3945 | K1 | known user new device | match | 04 | lib/cms/defaults/legal.ts |
| 3946 | K1 | known vs unknown | some-match | 04 | scripts/verify/step16-automation.ts |
| 3947 | K1 | known fraud devices | match | 04 | lib/cms/defaults/legal.ts |
| 3948 | K2 | IP address logging every action | match | 04 | lib/payment/http-client.ts |
| 3949 | K2 | IP geolocation country city ISP | match | 04 | lib/procurement/suppliers.ts |
| 3950 | K2 | IP type detection residential/datacenter/mobile/proxy/VPN | match | 04 | scripts/verify/step04-core.ts |
| 3951 | K2 | ISP name logging | some-match | 04 | lib/payment/http-client.ts |
| 3952 | K2 | ASN Autonomous System Number logging | some-match | 04 | lib/payment/http-client.ts |
| 3953 | K2 | IP reputation score threat intelligence | match | 04 | migrations/S04_002_network_intel.sql |
| 3954 | K2 | IP change detection mid-session | match | 04 | services/auth/session-service.ts |
| 3955 | K2 | IP velocity multiple logins per hour | match | 04 | config/security.ts |
| 3956 | K2 | IP- known combinations | generic-match | 04 | scripts/verify/step16-automation.ts |
| 3957 | K2 | IP- which accounts from which IP | manual | 04 | - |
| 3958 | K2 | bot signal | match | 04 | scripts/verify/step04-core.ts |
| 3959 | K2 | DNS WebRTC | match | 04 | lib/i18n/strings/en/s07-company.ts |
| 3960 | K3 | URL timestamp duration | match | 04 | services/gateway/forward.ts |
