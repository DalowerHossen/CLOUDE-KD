<!-- path: docs/steps/STEP-16/AUDIT/PART-01.md -->
# Audit part 1 of 41: features 1 to 99

First pass, made by a script: the words of each feature are looked for in the code (paths and contents of `app`, `components`, `lib`, `services`, `config`, `cron`, `migrations`, `scripts`, `sql`, `public`).
It is a map to the likely files, not a verdict: a match does not prove that the feature works, and a missing word does not prove that it is missing (the code may use other words, and a line in Bengali only has nothing to look for).

| Status | Meaning |
|---|---|
| match | at least three of its words meet in one file |
| some-match | two words meet, or its one specific word is found |
| generic-match | only common words are found, nothing specific |
| no-match | none of its words is found in the code |
| manual | the line has no English word, a person must read it |

Totals: match 21, some-match 22, generic-match 6, no-match 2, manual 48. Features outside every STEP line range: 0.

| No | Section | English words of the feature | Status | STEP | Best file |
|---|---|---|---|---|---|
| 1 | A1 | KD SOLUTION IT | some-match | 01 | lib/helpdesk/rules.ts |
| 2 | A1 | (Bengali only) | manual | 01 | - |
| 3 | A1 | (Bengali only) | manual | 01 | - |
| 4 | A1 | (Bengali only) | manual | 01 | - |
| 5 | A1 | CSS instant swap | match | 01 | config/design-tokens.json |
| 6 | A1 | z-index | some-match | 01 | scripts/verify/step16-automation.ts |
| 7 | A1 | primary/secondary/accent/neutral | match | 01 | lib/branding/theme.ts |
| 8 | A1 | heading/body/caption scales | match | 01 | lib/cms/templates.ts |
| 9 | A1 | light/dark/icon-only | match | 01 | app/layout.tsx |
| 10 | A1 | (Bengali only) | manual | 01 | - |
| 11 | A1 | (Bengali only) | manual | 01 | - |
| 12 | A1 | 16/32/180/192/512 | manual | 01 | - |
| 13 | A1 | (Bengali only) | manual | 01 | - |
| 14 | A1 | PWA | some-match | 01 | scripts/make-brand-assets.mjs |
| 15 | A1 | Open Graph default per page | some-match | 01 | app/layout.tsx |
| 16 | A2 | 4/8/12/16/24/32/48/64 | manual | 01 | - |
| 17 | A2 | none/sm/md/lg/xl/full | some-match | 01 | services/payroll/runs.ts |
| 18 | A2 | sm/md/lg/xl/2xl | manual | 01 | - |
| 19 | A2 | Lucide React | match | 01 | components/layout/sidebar.tsx |
| 20 | A2 | unDraw-inspired in-house | generic-match | 01 | services/payroll/run-rules.ts |
| 21 | A2 | (Bengali only) | manual | 01 | - |
| 22 | A2 | JSON | some-match | 01 | services/estimate/public.ts |
| 23 | A2 | CSS dynamic theming | some-match | 01 | scripts/check-path-comment.sh |
| 24 | A2 | Tailwind | some-match | 01 | styles/globals.css |
| 25 | A2 | shadcn/ui | no-match | 01 | - |
| 26 | A3 | (Bengali only) | manual | 01 | - |
| 27 | A3 | duration/easing tokens | match | 01 | scripts/gen.mjs |
| 28 | A3 | Framer Motion | match | 01 | components/shared/confetti.tsx |
| 29 | A3 | (Bengali only) | manual | 01 | - |
| 30 | A3 | (Bengali only) | manual | 01 | - |
| 31 | A3 | (Bengali only) | manual | 01 | - |
| 32 | A3 | list items | manual | 01 | - |
| 33 | A3 | payment success | some-match | 01 | services/payroll/runs.ts |
| 34 | A3 | Lottie | no-match | 01 | - |
| 35 | A3 | prefers-reduced-motion | match | 01 | styles/globals.css |
| 36 | A3 | (Bengali only) | manual | 01 | - |
| 37 | A3 | subtle pulse | generic-match | 01 | lib/utils/hash.ts |
| 38 | A4 | (Bengali only) | manual | 01 | - |
| 39 | A4 | prefers-color-scheme | match | 01 | app/layout.tsx |
| 40 | A4 | parity | some-match | 01 | scripts/verify/step01-tokens.mjs |
| 41 | A4 | (Bengali only) | manual | 01 | - |
| 42 | A4 | per tenant | manual | 01 | - |
| 43 | A4 | (Bengali only) | manual | 01 | - |
| 44 | A4 | JSON | some-match | 01 | services/estimate/public.ts |
| 45 | A4 | time-of-day based optional | match | 01 | services/payroll/run-rules.ts |
| 46 | A4 | localStorage | some-match | 01 | scripts/verify/step16-automation.ts |
| 47 | B1 | expanded 264px collapsed 72px | generic-match | 01 | lib/team/presets.ts |
| 48 | B1 | h-64px | manual | 01 | - |
| 49 | B1 | max-width 1280px | some-match | 01 | components/layout/sidebar.tsx |
| 50 | B1 | max-width 768px | some-match | 01 | components/layout/sidebar.tsx |
| 51 | B1 | collapse/expand | match | 01 | components/layout/sidebar.tsx |
| 52 | B1 | (Bengali only) | manual | 01 | - |
| 53 | B1 | 12-column gap-24 | some-match | 01 | app/global-error.tsx |
| 54 | B1 | (Bengali only) | manual | 01 | - |
| 55 | B1 | fluid fixed | some-match | 01 | lib/middleware/headers.ts |
| 56 | B1 | spacing utility | generic-match | 01 | lib/email/template-body.ts |
| 57 | B2 | title breadcrumb actions | some-match | 01 | components/layout/topbar.tsx |
| 58 | B2 | (Bengali only) | manual | 01 | - |
| 59 | B2 | optional with pagination | match | 01 | services/audit/search.ts |
| 60 | B2 | (Bengali only) | manual | 01 | - |
| 61 | B2 | (Bengali only) | manual | 01 | - |
| 62 | B2 | two-column | some-match | 01 | services/payroll/run-rules.ts |
| 63 | B2 | tab-based | manual | 01 | - |
| 64 | B2 | single/multi-column | manual | 01 | - |
| 65 | B2 | (Bengali only) | manual | 01 | - |
| 66 | B3 | CMS-editable navigation | match | 01 | app/(admin)/admin/blog/_components/taxonomy-manager.tsx |
| 67 | B3 | CMS-editable | generic-match | 01 | app/robots.ts |
| 68 | B3 | (Bengali only) | manual | 01 | - |
| 69 | B3 | full-width sections | match | 01 | app/(public)/blog/[slug]/page.tsx |
| 70 | B3 | industry-specific | generic-match | 01 | services/accounting/accounts.ts |
| 71 | B3 | (Bengali only) | manual | 01 | - |
| 72 | B3 | A/B | manual | 01 | - |
| 73 | B4 | (Bengali only) | manual | 01 | - |
| 74 | B4 | left form right branding | match | 01 | lib/i18n/strings/en/s13-portal.ts |
| 75 | B4 | mobile | some-match | 01 | app/(dashboard)/suppliers/[id]/page.tsx |
| 76 | B4 | testimonial carousel trust signal | match | 01 | lib/cms/templates.ts |
| 77 | C1 | px | manual | 01 | - |
| 78 | C1 | 320/375/430/768/1024/1280/1920 | manual | 01 | - |
| 79 | C1 | CSS min-width queries | match | 01 | lib/hooks/use-media-query.ts |
| 80 | C1 | (Bengali only) | manual | 01 | - |
| 81 | C1 | (Bengali only) | manual | 01 | - |
| 82 | C1 | 1920px | manual | 01 | - |
| 83 | C2 | (Bengali only) | manual | 01 | - |
| 84 | C2 | (Bengali only) | manual | 01 | - |
| 85 | C2 | Sheet | some-match | 01 | components/layout/mobile-drawer.tsx |
| 86 | C2 | iOS safe-area inset | match | 01 | styles/globals.css |
| 87 | C2 | Android | some-match | 01 | services/portal/device.ts |
| 88 | C2 | iOS | manual | 01 | - |
| 89 | C2 | iOS/Android style | match | 01 | lib/auth/session.ts |
| 90 | C2 | (Bengali only) | manual | 01 | - |
| 91 | C3 | px | manual | 01 | - |
| 92 | C3 | (Bengali only) | manual | 01 | - |
| 93 | C3 | list items | manual | 01 | - |
| 94 | C3 | (Bengali only) | manual | 01 | - |
| 95 | C3 | (Bengali only) | manual | 01 | - |
| 96 | C3 | PDF preview | match | 01 | lib/i18n/strings/en/s07-company.ts |
| 97 | C3 | touch-friendly | match | 01 | components/client/signature-pad.tsx |
| 98 | C3 | optional | some-match | 01 | services/payroll/run-rules.ts |
| 99 | C4 | (Bengali only) | manual | 01 | - |
