<!-- path: docs/steps/STEP-16/AUDIT/PART-19.md -->
# Audit part 19 of 41: features 1783 to 1881

First pass, made by a script: the words of each feature are looked for in the code (paths and contents of `app`, `components`, `lib`, `services`, `config`, `cron`, `migrations`, `scripts`, `sql`, `public`).
It is a map to the likely files, not a verdict: a match does not prove that the feature works, and a missing word does not prove that it is missing (the code may use other words, and a line in Bengali only has nothing to look for).

| Status | Meaning |
|---|---|
| match | at least three of its words meet in one file |
| some-match | two words meet, or its one specific word is found |
| generic-match | only common words are found, nothing specific |
| no-match | none of its words is found in the code |
| manual | the line has no English word, a person must read it |

Totals: match 31, some-match 37, generic-match 3, no-match 1, manual 27. Features outside every STEP line range: 0.

| No | Section | English words of the feature | Status | STEP | Best file |
|---|---|---|---|---|---|
| 1783 | C3 | pending approval | match | 13 | scripts/verify/step16-automation.ts |
| 1784 | C3 | (Bengali only) | manual | 13 | - |
| 1785 | C3 | post-payment | match | 13 | services/payroll/runs.ts |
| 1786 | C3 | (Bengali only) | manual | 13 | - |
| 1787 | C3 | mandate | no-match | 13 | - |
| 1788 | C3 | (Bengali only) | manual | 13 | - |
| 1789 | C3 | (Bengali only) | manual | 13 | - |
| 1790 | C3 | monthly/quarterly | match | 13 | migrations/S15_008_budgets_entities.sql |
| 1791 | C3 | (Bengali only) | manual | 13 | - |
| 1792 | C3 | (Bengali only) | manual | 13 | - |
| 1793 | C4 | sent/delivered/opened/clicked/bounced | match | 05,13 | migrations/S05_006_email.sql |
| 1794 | C4 | pixel | some-match | 05,13 | app/(admin)/admin/analytics/page.tsx |
| 1795 | C4 | link | some-match | 05,13 | services/payroll/runs.ts |
| 1796 | C4 | hard/soft | match | 05,13 | migrations/S05_006_email.sql |
| 1797 | C4 | spam report | match | 05,13 | scripts/verify/step05-core.ts |
| 1798 | C4 | owner one-click | some-match | 05,13 | lib/middleware/bot-detector.ts |
| 1799 | C4 | copy payment link to clipboard | match | 05,13 | components/payment/links-manager.tsx |
| 1800 | C4 | per client per document complete history | match | 05,13 | lib/cms/defaults/help.ts |
| 1801 | D1 | SVG/PNG auto-optimize | match | 13 | app/layout.tsx |
| 1802 | D1 | (Bengali only) | manual | 13 | - |
| 1803 | D1 | hex picker preview | match | 13 | lib/company/sections.ts |
| 1804 | D1 | (Bengali only) | manual | 13 | - |
| 1805 | D1 | (Bengali only) | manual | 13 | - |
| 1806 | D1 | Inter/Roboto/Poppins/system | match | 13 | lib/branding/theme.ts |
| 1807 | D1 | HTML | some-match | 13 | scripts/verify/step16-automation.ts |
| 1808 | D1 | a11y check | some-match | 13 | lib/pdf/invoice-pdf.tsx |
| 1809 | D1 | auto | manual | 13 | - |
| 1810 | D1 | real-time all surfaces | some-match | 13 | services/branding/brand.ts |
| 1811 | D2 | create auto apply | some-match | 13 | scripts/verify/step16-automation.ts |
| 1812 | D2 | (Bengali only) | manual | 13 | - |
| 1813 | D2 | (Bengali only) | manual | 13 | - |
| 1814 | D2 | (Bengali only) | manual | 13 | - |
| 1815 | D2 | PDF all documents | match | 13 | services/payroll/portal.ts |
| 1816 | D2 | From header footer | some-match | 13 | app/(public)/layout.tsx |
| 1817 | D2 | token link pages | match | 13 | services/payroll/register.ts |
| 1818 | D2 | (Bengali only) | manual | 13 | - |
| 1819 | D2 | (Bengali only) | manual | 13 | - |
| 1820 | D2 | (Bengali only) | manual | 13 | - |
| 1821 | D2 | (Bengali only) | manual | 13 | - |
| 1822 | D2 | logo company name | some-match | 13 | components/layout/sidebar.tsx |
| 1823 | D2 | address unsubscribe | match | 13 | migrations/S05_006_email.sql |
| 1824 | D3 | dedicated | some-match | 13 | lib/utils/currency.ts |
| 1825 | D3 | default KD SOLUTION IT | some-match | 13 | lib/helpdesk/rules.ts |
| 1826 | D3 | JSON | some-match | 13 | services/estimate/public.ts |
| 1827 | D3 | before save | some-match | 13 | services/payroll/structures.ts |
| 1828 | D3 | changes log | match | 13 | services/payroll/runs.ts |
| 1829 | E1 | Powered by KD SOLUTION IT Free tier default | some-match | 13 | lib/i18n/strings/en/s01-core.ts |
| 1830 | E1 | Pro+ | some-match | 13 | config/trial.ts |
| 1831 | E1 | Enterprise | some-match | 13 | scripts/verify/step06-core.ts |
| 1832 | E1 | white-label | some-match | 13 | components/layout/portal-shell.tsx |
| 1833 | E1 | white-label | some-match | 13 | components/layout/portal-shell.tsx |
| 1834 | E1 | URL white-label | match | 13 | services/branding/save.ts |
| 1835 | E1 | white-label | some-match | 13 | components/layout/portal-shell.tsx |
| 1836 | E1 | PDF- white-label | match | 13 | components/marketing/tools/invoice-generator.tsx |
| 1837 | E1 | white-label | some-match | 13 | components/layout/portal-shell.tsx |
| 1838 | E2 | per tenant | manual | 13 | - |
| 1839 | E2 | CNAME/TXT | match | 13 | scripts/verify/step07-core.ts |
| 1840 | E2 | SSL Let s Encrypt | match | 13 | services/email/settings-store.ts |
| 1841 | E2 | SSL auto | some-match | 13 | services/email/settings-store.ts |
| 1842 | E2 | Pro+ | some-match | 13 | config/trial.ts |
| 1843 | E2 | email from own domain | match | 13 | migrations/S02_007_compliance.sql |
| 1844 | E2 | invoice.clientdomain.com | some-match | 13 | scripts/verify/step12-nmi.ts |
| 1845 | E2 | pay.clientdomain.com | match | 13 | scripts/verify/step11-verifone.ts |
| 1846 | F1 | Unsaved-changes warn before leaving | some-match | 13 | components/invoice/invoice-form.tsx |
| 1847 | F1 | beforeunload browser dialog | match | 13 | components/marketing/consent-banner.tsx |
| 1848 | F1 | localStorage | some-match | 13 | scripts/verify/step16-automation.ts |
| 1849 | F1 | warn if same invoice open | some-match | 13 | components/marketing/art/illustrations.tsx |
| 1850 | F1 | realtime | manual | 13 | - |
| 1851 | F1 | (Bengali only) | manual | 13 | - |
| 1852 | F1 | Undo toast | generic-match | 13 | lib/i18n/strings/en/s16-migration.ts |
| 1853 | F1 | Delete 47 items | manual | 13 | - |
| 1854 | F1 | UI instant feedback server sync | match | 13 | lib/integrations/mapping-rules.ts |
| 1855 | F1 | Saving... Saved | match | 13 | components/kyc/settings-form.tsx |
| 1856 | F1 | WebSocket | generic-match | 13 | scripts/verify/step12-adyen.ts |
| 1857 | F1 | John is editing this invoice | match | 13 | scripts/verify/step07-core.ts |
| 1858 | F2 | real-time per field | manual | 13 | - |
| 1859 | F2 | disabled until valid | match | 13 | services/payment/credential-store.ts |
| 1860 | F2 | clear actionable per field | some-match | 13 | services/payroll/runs.ts |
| 1861 | F2 | confirmation | some-match | 13 | app/api/auth/2fa/enroll/begin/route.ts |
| 1862 | F2 | tooltip | some-match | 13 | styles/tokens.generated.css |
| 1863 | F2 | (Bengali only) | manual | 13 | - |
| 1864 | F2 | phone currency date | match | 13 | services/payroll/payroll-rules.ts |
| 1865 | F2 | credit card phone zip | match | 13 | lib/transfer/targets.ts |
| 1866 | G1 | immutable after send | some-match | 09,13 | migrations/S05_006_email.sql |
| 1867 | G1 | immutable after payment | some-match | 09,13 | migrations/S05_006_email.sql |
| 1868 | G1 | every edit tracked | some-match | 09,13 | migrations/S08_006_valuation.sql |
| 1869 | G1 | diff view | some-match | 09,13 | scripts/check-ownership.mjs |
| 1870 | G1 | rollback to previous version | generic-match | 09,13 | lib/migration/rules.ts |
| 1871 | G1 | every 30 seconds | some-match | 09,13 | app/api/plans/migrate/route.ts |
| 1872 | G1 | same client amount date | some-match | 09,13 | services/payroll/run-rules.ts |
| 1873 | G1 | UI 30-day retention | match | 09,13 | services/storage/retention.ts |
| 1874 | G1 | auto Jan 1 | some-match | 09,13 | lib/ocr/extract-rules.ts |
| 1875 | G1 | (Bengali only) | manual | 09,13 | - |
| 1876 | G2 | staff owner | manual | 09,13 | - |
| 1877 | G2 | (Bengali only) | manual | 09,13 | - |
| 1878 | G2 | large amounts | match | 09,13 | scripts/verify/step12-nmi.ts |
| 1879 | G2 | (Bengali only) | manual | 09,13 | - |
| 1880 | G2 | multi-level dollar threshold | match | 09,13 | app/(dashboard)/payroll/settings/page.tsx |
| 1881 | G2 | in-app email | some-match | 09,13 | app/robots.ts |
