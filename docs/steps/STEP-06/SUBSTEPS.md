# STEP 06 - Sub-steps plan

Session branch: claude/clever-goldberg-8ncdae (contains STEPs 01 to 05). Migrations `S06_001` onward with `_down.sql`; assertions `sql/assertions/s06_*.sql`; logic checks `scripts/verify/step06-*`. Per sub-step: prettier, lint, typecheck, `scripts/check-all.sh`, `PGHOST=/tmp/pgsock bash scripts/db-apply.sh --clean` when a migration exists, security checklist Z1 to Z14, one commit `feat(step06): 06.k <summary>`.

Owned paths (OWNERSHIP_MAP row 06): `app/(public)/`, `lib/seo/`, `lib/analytics/`, `services/{cms,blog,seo,marketing,leads,abtest}/`, `app/(admin)/admin/{cms,blog,seo,analytics,marketing,leads}/`, `app/api/{public-site,cms,blog,leads,seo}/`, `app/sitemap.ts`, `app/robots.ts`, `components/marketing/`, `emails/marketing/`, `migrations/S06_*`. Anything else (for example `lib/cms/`, `config/seo.ts`) is added to `config/ownership.json` and named in the handoff.

Design rule: a public page is a list of typed blocks. Built-in defaults live in code (`lib/cms/defaults`), so every page works before anything is stored; the CMS (06.3) stores edited versions that win over the defaults. Pages are server rendered, static where possible, and contain no tracking script unless consent allows it.

| Id | Goal | Main files | Migration | Done when |
|---|---|---|---|---|
| 06.1 | Public layout and consent | app/(public)/layout.tsx, components/marketing/{mega-menu,site-footer,consent-banner,visitor}.tsx, lib/analytics/consent.ts, app/api/public-site/consent | none | header with mega menu, footer, banner with categories (necessary, analytics, marketing), choice kept in a cookie and recorded through the consent contract, theme toggle, English only |
| 06.2 | Block system and core pages | lib/cms/blocks.ts, components/marketing/blocks/*, lib/cms/defaults/*, app/(public)/{page,features,industries,pricing,about,contact,careers,security}, app/api/public-site/contact | none | home, features, industries, pricing (from entitlements), about, contact (honeypot, Turnstile, e-mail), careers, security; unique title and description |
| 06.3 | CMS core | services/cms/*, app/(admin)/admin/cms/*, app/api/cms/* | S06_001 | page versions, draft, schedule, preview, revert, blocks editor, media through storage, approval for content_manager |
| 06.4 | Legal pages | lib/cms/defaults/legal, services/cms/legal.ts, app/(public)/legal/*, acceptance API | S06_002 | twelve legal pages editable in the CMS, version history, acceptance tracking |
| 06.5 | Blog | services/blog/*, app/(public)/blog/*, app/(admin)/admin/blog/*, app/api/blog/*, RSS | S06_003 | editor with sanitizing, categories, tags, authors, cover image, scheduling, RSS, related posts |
| 06.6 | SEO | lib/seo/*, services/seo/*, app/sitemap.ts, app/robots.ts, app/(admin)/admin/seo/* | S06_004 | eight JSON-LD types, meta manager, OG image, sitemap of indexable pages, robots, canonical, noindex for token and app pages, audit report |
| 06.7 | Analytics and pixels | lib/analytics/*, components/marketing/pixels, services/marketing/analytics.ts, app/(admin)/admin/analytics/* | S06_005 | GA4, GTM, Meta (with conversions API), TikTok, LinkedIn, X, Clarity, Pinterest only after consent and never on sensitive routes; product analytics events; script check |
| 06.8 | Conversion and marketing | services/{leads,abtest,marketing}/*, app/(public)/tools/*, app/(admin)/admin/{leads,marketing}/*, emails/marketing | S06_006 | A/B framework, testimonials, lead capture and leads admin, free invoice generator and calculators, campaigns and drip sequences, retention tools |
| 06.9 | Support content | services/cms/help.ts, app/(public)/{help,status,roadmap,changelog,faq} | S06_007 | help center with search, knowledge base, FAQ, status page fed by the incident service, roadmap, changelog |
| 06.10 | Visual polish | components/marketing/art/*, print styles, charts style guide | none | illustrations, empty-state art, print styles for public pages |
| 06.11 | Assertions, checks, closure | sql/assertions/s06_*, scripts/verify/step06-*, VERIFY.md, HANDOFF.md, DEPENDENCY_REQUESTS.md | none | all recorded |

Security notes: all CMS input is sanitized with the strict allow list; forms use Turnstile and a honeypot; public APIs are rate limited; analytics never reach `(auth)`, payment, `(client-portal)` or `(admin)` routes (verified by `scripts/verify/step06-scripts.mjs`).
