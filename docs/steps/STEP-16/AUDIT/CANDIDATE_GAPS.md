<!-- path: docs/steps/STEP-16/AUDIT/CANDIDATE_GAPS.md -->
# Candidate gaps from the first pass (2026-10-27)

Only the owner's decision turns a candidate into work. The first pass is a search, not a test: nothing here was run in a browser, and an absence means "no word of the feature appears anywhere in the code" (exact searches of `app`, `components`, `lib`, `services`, `config`, `cron`, `migrations` and `.github`).

## A. Searched for exactly and not found in the code

| No | Feature | Kind | Note |
|---|---|---|---|
| 34 | Lottie animation support | cosmetic | not in `package.json` |
| 1787 | Subscription mandate link e-mail | functional | no mandate flow in the code |
| 1928 | Feature request board with votes | growth | |
| 2308 | Help article feedback (helpful or not) | support | |
| 2310 | In-app help widget (contextual "?" button) | support | |
| 2641 | Feature adoption onboarding sequence | growth | |
| 3312 | Data protection impact assessment (DPIA) | compliance | only a default legal text mentions it |
| 3338 | Dependency licence check in CI (MIT, Apache, BSD only) | CI | |
| 3543 | Legal hold (litigation preservation) | compliance | retention exists, no hold |
| 3589 | Disaster recovery targets (RTO under 4 h, RPO under 1 h) | operations | no runbook with the targets |
| 3607 | Visual regression baseline (Chromatic or Percy) | CI | |
| 3833 | Disaster recovery plan document | operations | |
| 3854 | ASN check in the network policy | security | |

## B. No STEP owns them (outside every `Feature sources` range)

- 1260 Gateway status dashboard per tenant (a gateway page exists under `integrations/gateway`; whether it is a status dashboard needs a look).
- 3357 to 3391 Performance section (J1 to J5, 35 features): Core Web Vitals targets, bundle budget and analyzer, code splitting, lazy loading, font subsetting, critical CSS, image optimisation and srcset, cache layer and invalidation map, ISR, CDN cache headers, service worker, resource hints, N+1 prevention, index audits, cursor pagination, statement timeout, slow query log, materialized views, partitioning, read replica. CI already runs Lighthouse, and several items come from Next.js itself; the rest has no owner and no check.

## C. Not found by the search, but they may exist under other words (a person must look)

206 interactive product screenshot preview, 210 testimonial carousel, 369 removable tag component, 514 logo applies to new invoices only, 540 contextual video tutorials, 1769 configurable invoice e-mail subject, 1932 suspension turns the account read-only with data kept, 2786 instant pricing calculator against a competitor, 3768 data localisation report for regulators.

## D. Features the script missed but that exist (so a no-match is not proof)

Toasts, dialogs and drawers (361 to 363), password strength indicator (383), tooltips (531), notification list (670), chart of accounts and its seed (525, 2960), the lead capture endpoint (257), shadcn components (25), SAST and container scan in `security.yml` (3336, 3343).

## E. Lines with no English word (manual)

About 830 of the 4029 lines are written in Bengali only (for example parts 1, 11 and 12 have about 48 each). The script has nothing to look for there; they need a person to read them against the code, part by part.
