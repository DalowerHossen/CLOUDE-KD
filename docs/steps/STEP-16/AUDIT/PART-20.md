<!-- path: docs/steps/STEP-16/AUDIT/PART-20.md -->
# Audit part 20 of 41: features 1882 to 1980

First pass, made by a script: the words of each feature are looked for in the code (paths and contents of `app`, `components`, `lib`, `services`, `config`, `cron`, `migrations`, `scripts`, `sql`, `public`).
It is a map to the likely files, not a verdict: a match does not prove that the feature works, and a missing word does not prove that it is missing (the code may use other words, and a line in Bengali only has nothing to look for).

| Status | Meaning |
|---|---|
| match | at least three of its words meet in one file |
| some-match | two words meet, or its one specific word is found |
| generic-match | only common words are found, nothing specific |
| no-match | none of its words is found in the code |
| manual | the line has no English word, a person must read it |

Totals: match 43, some-match 36, generic-match 5, no-match 2, manual 13. Features outside every STEP line range: 0.

| No | Section | English words of the feature | Status | STEP | Best file |
|---|---|---|---|---|---|
| 1882 | G2 | SLA auto-escalate if not approved in X hours | match | 09,13 | migrations/S02_005_approvals.sql |
| 1883 | G2 | (Bengali only) | manual | 09,13 | - |
| 1884 | G3 | estimate approval client signs | match | 09,13 | lib/company/sections.ts |
| 1885 | G3 | draw touch-friendly | match | 09,13 | components/client/signature-pad.tsx |
| 1886 | G3 | typed name | some-match | 09,13 | lib/payment/adapters/fastspring/webhook.ts |
| 1887 | G3 | (Bengali only) | manual | 09,13 | - |
| 1888 | G3 | IP device | some-match | 09,13 | migrations/S04_003_signals_down.sql |
| 1889 | G3 | immutable | some-match | 09,13 | migrations/S05_006_email.sql |
| 1890 | G3 | PDF tamper-proof | match | 09,13 | lib/pdf/evidence-pack-pdf.tsx |
| 1891 | G4 | multi-select invoices send all | some-match | 13 | services/payroll/runs.ts |
| 1892 | G4 | background processing | match | 13 | lib/i18n/strings/en/s16-system.ts |
| 1893 | G4 | real-time | manual | 13 | - |
| 1894 | G4 | (Bengali only) | manual | 13 | - |
| 1895 | G4 | one-click | some-match | 13 | lib/middleware/bot-detector.ts |
| 1896 | G4 | send later | some-match | 13 | lib/middleware/rate-limit.ts |
| 1897 | G4 | (Bengali only) | manual | 13 | - |
| 1898 | G4 | (Bengali only) | manual | 13 | - |
| 1899 | G4 | per email | manual | 13 | - |
| 1900 | G4 | all emails all channels | some-match | 13 | scripts/verify/step12-adyen.ts |
| 1901 | H1 | owner-only send critical emails | some-match | 13 | app/(admin)/admin/security/page.tsx |
| 1902 | H1 | staff draft only | some-match | 13 | scripts/verify/step16-automation.ts |
| 1903 | H1 | Request send staff owner approve send | match | 13 | services/payroll/runs.ts |
| 1904 | H1 | staff- send until approved | match | 13 | services/payroll/runs.ts |
| 1905 | H1 | UI- | manual | 13 | - |
| 1906 | H1 | owner | manual | 13 | - |
| 1907 | H1 | (Bengali only) | manual | 13 | - |
| 1908 | H1 | with reason | some-match | 13 | services/payroll/run-rules.ts |
| 1909 | I1 | dunning UI visual escalation stages | generic-match | 13 | config/permissions.ts |
| 1910 | I1 | UI color-coded | generic-match | 13 | components/marketing/charts/bar-chart.tsx |
| 1911 | I1 | PDF branded | generic-match | 13 | services/payroll/run-rules.ts |
| 1912 | I1 | UI internal per client | some-match | 13 | services/payroll/runs.ts |
| 1913 | I1 | Promise-to-pay UI client commitment tracking | match | 13 | components/payment/secure-form-types.ts |
| 1914 | I1 | outstanding by age | generic-match | 13 | migrations/S08_002_client_search_down.sql |
| 1915 | I1 | call email WhatsApp | some-match | 13 | lib/middleware/idempotency.ts |
| 1916 | J1 | service/retail/medical/freelance/agency | match | 13 | lib/company/sections.ts |
| 1917 | J1 | COA industry-based | some-match | 13 | services/accounting/accounts.ts |
| 1918 | J1 | industry-based | some-match | 13 | services/accounting/accounts.ts |
| 1919 | J1 | industry-based | some-match | 13 | services/accounting/accounts.ts |
| 1920 | J1 | pre-written terms selectable | some-match | 13 | components/client/views/invoice-view.tsx |
| 1921 | J1 | pre-written notes selectable | some-match | 13 | app/(dashboard)/disputes/[id]/page.tsx |
| 1922 | J1 | templates | some-match | 13 | services/payroll/runs.ts |
| 1923 | K1 | owner new owner | manual | 13 | - |
| 1924 | K1 | owner separate | some-match | 13 | scripts/verify/step11-verifone.ts |
| 1925 | K1 | exit survey | match | 13 | sql/assertions/s16_036_retention.sql |
| 1926 | K1 | churned special discount | match | 13 | lib/i18n/strings/en/s08-crm.ts |
| 1927 | K1 | What s new | manual | 13 | - |
| 1928 | K1 | vote on features | no-match | 13 | - |
| 1929 | K1 | role event configurable | some-match | 13 | services/payroll/run-rules.ts |
| 1930 | K1 | self-service GDPR | generic-match | 13 | scripts/verify/step16-automation.ts |
| 1931 | K1 | 30 days after cancel | match | 13 | app/(client-portal)/p/[token]/page.tsx |
| 1932 | K1 | data preserved | no-match | 13 | - |
| 1933 | L1 | name email fuzzy match | match | 13 | services/product/search.ts |
| 1934 | L1 | merge two records preserve history | match | 13 | services/accounting/accounts.ts |
| 1935 | L1 | soft-hide data preserved | match | 13 | lib/i18n/strings/en/s07-company.ts |
| 1936 | L1 | Do-not-contact per client all channels | match | 13 | services/messaging/channels.ts |
| 1937 | L1 | opt-out per client | match | 13 | migrations/S08_002_client_search.sql |
| 1938 | L1 | multi-select edit fields | some-match | 13 | services/payroll/runs.ts |
| 1939 | L1 | per user per list | manual | 13 | - |
| 1940 | L1 | drag to select | some-match | 13 | components/onboarding/logo-upload.tsx |
| 1941 | A1 | Meta Cloud API WhatsApp Business Platform | match | 16 | lib/whatsapp/client.ts |
| 1942 | A1 | WhatsApp Business Account WABA | match | 16 | services/whatsapp/accounts.ts |
| 1943 | A1 | Meta App ID App Secret encrypted storage | match | 16 | lib/i18n/strings/en/s07-company.ts |
| 1944 | A1 | WhatsApp Business Phone Number ID | match | 16 | services/whatsapp/accounts.ts |
| 1945 | A1 | WhatsApp Access Token system user long-lived | match | 16 | services/social/meta-connect.ts |
| 1946 | A1 | WhatsApp Webhook Verify Token | match | 16 | scripts/verify/step12-nmi.ts |
| 1947 | A1 | WhatsApp Webhook Endpoint auto-setup | match | 16 | scripts/verify/step12-nmi.ts |
| 1948 | A1 | WhatsApp API v18.0+ | match | 16 | app/sitemap.ts |
| 1949 | A1 | WhatsApp | some-match | 16 | app/robots.ts |
| 1950 | A1 | WhatsApp API Meta billing | match | 16 | scripts/verify/step11-verifone.ts |
| 1951 | A1 | WhatsApp connection status | some-match | 16 | scripts/verify/step12-nmi.ts |
| 1952 | A1 | WhatsApp | some-match | 16 | app/robots.ts |
| 1953 | A1 | WhatsApp enable/disable | match | 16 | app/(admin)/admin/retention/_components/retention-manager.tsx |
| 1954 | A2 | WhatsApp text/image/document/video | match | 16 | scripts/verify/step16-ocr.ts |
| 1955 | A2 | WhatsApp | some-match | 16 | app/robots.ts |
| 1956 | A2 | WhatsApp Meta approval | match | 16 | services/cms/cms-service.ts |
| 1957 | A2 | WhatsApp pending/approved/rejected | match | 16 | services/payroll/portal.ts |
| 1958 | A2 | WhatsApp invoice_no amount due_date client_name | match | 16 | services/bnpl/offers.ts |
| 1959 | A2 | WhatsApp before submit | some-match | 16 | app/(dashboard)/suppliers/[id]/statement/page.tsx |
| 1960 | A2 | WhatsApp MARKETING/UTILITY/AUTHENTICATION | match | 16 | services/whatsapp/templates.ts |
| 1961 | A2 | WhatsApp English only per platform policy | match | 16 | lib/i18n/strings/en/s16-whatsapp.ts |
| 1962 | A2 | WhatsApp pre-built templates | match | 16 | services/contract/templates.ts |
| 1963 | A2 | WhatsApp clone modify | some-match | 16 | services/invoice/invoices.ts |
| 1964 | A2 | WhatsApp delivery/open/click rate | match | 16 | app/api/email/webhooks/[provider]/route.ts |
| 1965 | A3 | WhatsApp PDF payment link | match | 16 | services/payroll/runs.ts |
| 1966 | A3 | WhatsApp approval link | match | 16 | services/payroll/runs.ts |
| 1967 | A3 | WhatsApp overdue/pending | match | 16 | scripts/verify/step16-automation.ts |
| 1968 | A3 | WhatsApp post-payment | match | 16 | app/api/plans/manage/route.ts |
| 1969 | A3 | WhatsApp monthly | some-match | 16 | app/sitemap.ts |
| 1970 | A3 | WhatsApp | some-match | 16 | app/robots.ts |
| 1971 | A3 | WhatsApp | some-match | 16 | app/robots.ts |
| 1972 | A3 | WhatsApp PDF invoice/receipt | match | 16 | scripts/verify/step16-ocr.ts |
| 1973 | A3 | WhatsApp QR code | some-match | 16 | app/robots.ts |
| 1974 | A3 | WhatsApp interactive buttons Pay Now View Invoice | match | 16 | lib/i18n/strings/en/s13-portal.ts |
| 1975 | A3 | WhatsApp quick reply buttons Yes No Contact | match | 16 | lib/i18n/strings/en/s07-company.ts |
| 1976 | A3 | WhatsApp list message multiple invoices | some-match | 16 | scripts/verify/step11-stripe.ts |
| 1977 | A3 | WhatsApp PDF/ WhatsApp Cloud API | match | 16 | scripts/verify/step16-ocr.ts |
| 1978 | A3 | WhatsApp client sent files | some-match | 16 | services/payroll/run-rules.ts |
| 1979 | A4 | event action | some-match | 16 | services/payroll/run-rules.ts |
| 1980 | A4 | invoice.created WhatsApp notification | some-match | 16 | scripts/verify/step11-verifone.ts |
