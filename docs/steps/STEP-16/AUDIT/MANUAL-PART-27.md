<!-- path: docs/steps/STEP-16/AUDIT/MANUAL-PART-27.md -->
# Manual reading, part 27 (features 2575 to 2673, the lines that are Bengali only)

Read against the code and the STEP 06 and 16 notes on 2026-10-27; nothing was opened in a browser. The first row of the setup wizard (16.19) was built in this session.

| No | Feature | Result | Evidence or note |
|---|---|---|---|
| 2582 | Every tracking ID set from the admin panel | present | `/api/analytics/pixels`, `app/(admin)/admin/analytics` |
| 2592 | Referrer source tracking | not found | the public analytics count pages and events |
| 2593 | Conversion funnel visualisation | not found | funnel code exists only in the estimate reports |
| 2594 | Bounce rate and session duration | not found | |
| 2599 | A/B test traffic split (50/50, 70/30) | check in browser | `lib/marketing/ab-store.ts`, `/api/public-site/ab`; weights were not seen |
| 2604 | Multi-variant test (A, B, C, D) | check in browser | |
| 2606 | Pricing page A/B test | check in browser | |
| 2607 | Headline A/B test | present | `components/marketing/blocks/ab-hero.tsx` |
| 2615 | Testimonial video support | not found | |
| 2630 | Campaign template library | partial | `/api/marketing/campaigns`; STEP 06 D26: no separate template library |
| 2635 | Campaign conversion report | check in browser | `app/(admin)/admin/marketing` |
| 2643 | Drip sequence performance report | not found | STEP 06 D26: drip steps are not editable per segment |
| 2648 | Lead to tenant conversion tracking | not found | |
| 2654 | Super admin setup wizard on the first sign-in | partial | built in 16.19 (`/admin/setup`); it does not open by itself at the first sign-in |
| 2655 | Setup step 1: platform branding | present | 16.19 |
| 2663 | Setup completion checklist | present | 16.19 |

## Not found: 2592, 2593, 2594, 2615, 2643, 2648. Partly built: 2630, 2654.
