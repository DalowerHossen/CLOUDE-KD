<!-- path: docs/steps/STEP-16/AUDIT/PART-02.md -->
# Audit part 2 of 41: features 100 to 198

First pass, made by a script: the words of each feature are looked for in the code (paths and contents of `app`, `components`, `lib`, `services`, `config`, `cron`, `migrations`, `scripts`, `sql`, `public`).
It is a map to the likely files, not a verdict: a match does not prove that the feature works, and a missing word does not prove that it is missing (the code may use other words, and a line in Bengali only has nothing to look for).

| Status | Meaning |
|---|---|
| match | at least three of its words meet in one file |
| some-match | two words meet, or its one specific word is found |
| generic-match | only common words are found, nothing specific |
| no-match | none of its words is found in the code |
| manual | the line has no English word, a person must read it |

Totals: match 27, some-match 33, generic-match 9, no-match 4, manual 26. Features outside every STEP line range: 0.

| No | Section | English words of the feature | Status | STEP | Best file |
|---|---|---|---|---|---|
| 100 | C4 | (Bengali only) | manual | 01 | - |
| 101 | C4 | Sheet | some-match | 01 | components/layout/mobile-drawer.tsx |
| 102 | C4 | (Bengali only) | manual | 01 | - |
| 103 | C4 | numeric/email/tel/url | match | 01 | lib/company/forms.ts |
| 104 | C4 | px iOS zoom | some-match | 01 | styles/globals.css |
| 105 | C4 | multi-step | manual | 01 | - |
| 106 | C4 | simplified view | no-match | 01 | - |
| 107 | C4 | PDF native viewer | match | 01 | components/reports/report-viewer.tsx |
| 108 | C4 | Apple/Google Pay priority | match | 01 | scripts/verify/step10-core.ts |
| 109 | C4 | (Bengali only) | manual | 01 | - |
| 110 | C4 | LCP 2.5s | no-match | 01 | - |
| 111 | C4 | px- CI check | some-match | 01 | services/payroll/run-rules.ts |
| 112 | C5 | receipt scan | match | 01 | migrations/S05_002_files.sql |
| 113 | C5 | QR invoice/payment | generic-match | 01 | services/payroll/runs.ts |
| 114 | C5 | notes | some-match | 01 | services/payroll/report-rules.ts |
| 115 | C5 | (Bengali only) | manual | 01 | - |
| 116 | C5 | optional with consent | match | 01 | lib/env/s06.ts |
| 117 | C5 | camera/gallery/documents | match | 01 | lib/i18n/strings/en/s08-crm.ts |
| 118 | C5 | native sharing | generic-match | 01 | scripts/verify/step12-adyen.ts |
| 119 | C5 | PWA install | generic-match | 01 | scripts/make-brand-assets.mjs |
| 120 | C5 | web push | match | 01 | scripts/verify/step12-adyen.ts |
| 121 | D1 | loading skeleton | match | 01 | components/payment/checkout-slot.tsx |
| 122 | D1 | (Bengali only) | manual | 01 | - |
| 123 | D1 | (Bengali only) | manual | 01 | - |
| 124 | D1 | disabled spinner | match | 01 | components/ui/button.tsx |
| 125 | D1 | (Bengali only) | manual | 01 | - |
| 126 | D1 | above-fold first | no-match | 01 | - |
| 127 | D1 | placeholder blur-up | generic-match | 01 | services/contract/templates.ts |
| 128 | D1 | (Bengali only) | manual | 01 | - |
| 129 | D2 | error retry | some-match | 01 | app/api/integrations/settlement/statement/route.ts |
| 130 | D2 | React ErrorBoundary | match | 01 | components/shared/route-views.tsx |
| 131 | D2 | (Bengali only) | manual | 01 | - |
| 132 | D2 | correlation-id | some-match | 01 | scripts/verify/step12-nmi.ts |
| 133 | D2 | Report this error one-click | match | 01 | services/email/sender.ts |
| 134 | D2 | 404 | manual | 01 | - |
| 135 | D2 | 500 auto-report option | generic-match | 01 | services/payroll/run-rules.ts |
| 136 | D2 | (Bengali only) | manual | 01 | - |
| 137 | D2 | (Bengali only) | manual | 01 | - |
| 138 | D2 | exponential backoff | match | 01 | lib/storage/adapters/base.ts |
| 139 | D3 | empty state CTA | match | 01 | scripts/verify/step06-core.ts |
| 140 | D3 | SVG | some-match | 01 | components/marketing/art/illustrations.tsx |
| 141 | D3 | first-time vs filtered | some-match | 01 | components/layout/app-shell.tsx |
| 142 | D3 | No results | some-match | 01 | services/payroll/run-rules.ts |
| 143 | D3 | You don t have access | some-match | 01 | app/api/integrations/settlement/statement/route.ts |
| 144 | D3 | empty state create first | some-match | 01 | services/payroll/run-rules.ts |
| 145 | D4 | success state | some-match | 01 | services/payroll/runs.ts |
| 146 | D4 | (Bengali only) | manual | 01 | - |
| 147 | D4 | major actions | some-match | 01 | supabase/config.toml |
| 148 | D4 | milestones | some-match | 01 | services/project/time.ts |
| 149 | D4 | with countdown | no-match | 01 | - |
| 150 | D5 | (Bengali only) | manual | 01 | - |
| 151 | D5 | Coming soon | match | 01 | scripts/verify/step06-core.ts |
| 152 | D5 | placeholder lorem ipsum | match | 01 | scripts/check-no-coming-soon.sh |
| 153 | D5 | pagination sort filter | match | 01 | services/publicapi/resources.ts |
| 154 | D5 | inline validation disabled submit | match | 01 | components/client/branding-form.tsx |
| 155 | D5 | destructive actions | some-match | 01 | app/(dashboard)/contracts/[id]/page.tsx |
| 156 | D5 | Undo- 5 seconds destructive actions | match | 01 | services/payment/payments.ts |
| 157 | E1 | nav-map single source of truth | match | 01 | lib/i18n/strings/en/s16-whatsapp.ts |
| 158 | E1 | nav-map- | some-match | 01 | app/(dashboard)/subscriptions/page.tsx |
| 159 | E1 | nav-map | some-match | 01 | app/(dashboard)/subscriptions/page.tsx |
| 160 | E1 | every page | manual | 01 | - |
| 161 | E1 | (Bengali only) | manual | 01 | - |
| 162 | E1 | super_admin/owner/staff | manual | 01 | - |
| 163 | E1 | (Bengali only) | manual | 01 | - |
| 164 | E1 | TypeScript | some-match | 01 | scripts/verify/step12-nmi.ts |
| 165 | E1 | CI | manual | 01 | - |
| 166 | E2 | back/cancel | match | 01 | app/(dashboard)/suppliers/[id]/statement/page.tsx |
| 167 | E2 | (Bengali only) | manual | 01 | - |
| 168 | E2 | user menu | manual | 01 | - |
| 169 | E2 | mobile | some-match | 01 | app/(dashboard)/suppliers/[id]/page.tsx |
| 170 | E2 | right-click/long-press | some-match | 01 | lib/cms/defaults/help.ts |
| 171 | E3 | K Ctrl+K | some-match | 01 | components/layout/topbar.tsx |
| 172 | E3 | commands pages entities | generic-match | 01 | components/layout/topbar.tsx |
| 173 | E3 | (Bengali only) | manual | 01 | - |
| 174 | E3 | key | some-match | 01 | app/(client-portal)/p/[token]/page.tsx |
| 175 | E3 | Vim-style navigation power users optional | some-match | 01 | components/layout/bottom-nav.tsx |
| 176 | E3 | accessibility | some-match | 01 | lib/cms/legal-pages.ts |
| 177 | E3 | tab order | some-match | 01 | services/payroll/runs.ts |
| 178 | E3 | modals drawers | generic-match | 01 | styles/tokens.generated.css |
| 179 | F1 | WCAG 2.1 AA | some-match | 01 | scripts/verify/step01-tokens.mjs |
| 180 | F1 | interactive elements | some-match | 01 | app/not-found.tsx |
| 181 | F1 | 4.5 1 normal text | some-match | 01 | lib/helpdesk/rules.ts |
| 182 | F1 | 3 1 large text UI components | some-match | 01 | scripts/verify/step12-nmi.ts |
| 183 | F1 | aria-label | some-match | 01 | app/(dashboard)/subscriptions/billing/page.tsx |
| 184 | F1 | aria-live screen reader | match | 01 | components/shared/state-views.tsx |
| 185 | F1 | aria-expanded aria-controls aria-haspopup | match | 01 | components/payment/admin/processor-panel.tsx |
| 186 | F1 | role attributes proper semantics | generic-match | 01 | services/product/variants.ts |
| 187 | F1 | (Bengali only) | manual | 01 | - |
| 188 | F2 | (Bengali only) | manual | 01 | - |
| 189 | F2 | (Bengali only) | manual | 01 | - |
| 190 | F2 | Enter/Space | match | 01 | lib/cms/defaults/features.ts |
| 191 | F2 | Escape dismisses modals/drawers | generic-match | 01 | services/contract/merge.ts |
| 192 | F2 | Arrow keys list/menu navigation | match | 01 | app/(admin)/admin/cms/_components/page-editor.tsx |
| 193 | F3 | HTML header/nav/main/footer | match | 01 | lib/i18n/strings/en/s13-portal.ts |
| 194 | F3 | h1 h2 h3 no skips | some-match | 01 | scripts/verify/step16-automation.ts |
| 195 | F3 | alt | some-match | 01 | app/layout.tsx |
| 196 | F3 | association htmlFor | some-match | 01 | scripts/verify/step16-automation.ts |
| 197 | F3 | aria-describedby | match | 01 | components/admin/approvals/approval-queue.tsx |
| 198 | F3 | aria-busy | match | 01 | app/(dashboard)/subscriptions/billing/_components/retention-flow.tsx |
