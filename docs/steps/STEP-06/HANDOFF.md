# STEP 06 handoff - Public Site, CMS, SEO and Marketing

Branch: claude/clever-goldberg-8ncdae (contains STEP 01 to 06).

## FEATURE_LIST items implemented (line ranges of SCOPE.md)

- Part 1 266-344 (public pages, legal, support, lead generation): home, features, industries, pricing (from the plan catalogue), about, contact, careers, security, FAQ, help center and knowledge base, status page, roadmap, changelog, blog, free tools, twelve legal pages.
- Part 7 2924-3035 (CMS, blog, status page UI, SEO): block-based CMS with versions, draft, schedule, preview, revert, media, approval; blog with rich editor; SEO audit, sitemap, robots, structured data, share images, verification tags, security.txt.
- Part 7 3037-3156 (analytics, conversion, marketing): consent-gated providers (GA4, GTM, Meta with conversions API, TikTok, LinkedIn, X, Clarity, Pinterest), first-party cookie-free counters, A/B experiments, testimonials, lead capture and leads list, e-mail campaigns, welcome series.
- Part 7 3180-3239 (legal and trust pages): terms with acceptance log and versions, privacy, refunds, cookies, DPA, sub-processors, acceptable use, SLA, GDPR, CCPA, accessibility, responsible disclosure, security.txt.
- Part 1 378-403 and 428-444 (visuals): illustrations, chart, print styles, surprise. Not built, with reasons: DECISIONS D26, D29. Also not built: blog comments (D16), 301 redirect manager (D20), a separate template library page (D26), drag-and-drop block order (blocks move with buttons), AVIF/WebP image variants (images are served as uploaded).
- REQ-CARD item 1: no tracking script on payment, token, sign-in, portal or admin pages (checked by `scripts/verify/step06-scripts.mjs`).

## Migrations

| File              | Content                                                                                                                                     |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| S06_001_contact   | `contact_messages`; `kd_contact_purge`                                                                                                      |
| S06_002_cms       | `cms_pages`, `cms_page_versions`; `kd_cms_save_draft/publish/mark_pending/to_draft/release_due/revert`                                      |
| S06_003_legal     | `legal_acceptances` (append-only); `kd_legal_accept`                                                                                        |
| S06_004_blog      | `blog_authors`, `blog_categories`, `blog_tags`, `blog_posts`, `blog_post_tags`, `blog_post_versions`; `kd_blog_view`, `kd_blog_release_due` |
| S06_005_seo       | `seo_settings` (keys `site` and `pixels`)                                                                                                   |
| S06_006_analytics | `analytics_daily`; `kd_analytics_hit`                                                                                                       |
| S06_007_marketing | `testimonials`, `leads`, `campaigns`, `ab_experiments`, `ab_stats`; `kd_ab_count`                                                           |

All tables have RLS enabled with default deny and are closed to `authenticated`. Every `down` file is provided.

## Contracts used

`audit`, `approval` (actions `cms.publish`, `blog.publish`), `consent` (purposes `analytics`, `marketing`, `terms`, `refund_policy`, `email_marketing`), `email` (`send`, `enqueue` with `sendAt`; templates `system.contact-received`, `system.contact-ack`, `marketing.welcome`, `marketing.drip-2`, `marketing.drip-3`, `marketing.campaign`), `storage` (category `cms`, platform files), `security` (Turnstile), `auth`, `permissions`. STEP 06 provides no contract. Direct reads of other STEPs: `incidentOverview` (STEP 04) and `databaseReady` (STEP 04) for the status page, plan catalogue `config/plans.ts` (STEP 03/14) for pricing; see DEPENDENCY_REQUESTS.

## Config and environment

Permissions (`config/permissions/s06-site.ts`): `cms.read/edit/publish`, `blog.read/edit/publish`, `seo.read/edit`, `analytics.read/edit`, `marketing.read/edit/send`, `leads.read/edit`. Approval rules: `cms.publish`, `blog.publish` (L2). Cron jobs: `cms-publish` and `blog-publish` (every 5 minutes: apply approval decisions, release scheduled items). Navigation: public header and footer groups, admin items `admin-cms`, `admin-blog`, `admin-seo`, `admin-analytics`, `admin-marketing`. Environment (`lib/env/s06.ts`, `config/env/s06.env.fragment`): `CONTACT_INBOX` (optional), `META_CAPI_ACCESS_TOKEN` (optional). Identifiers of tracking providers, verification tags and social profiles are saved in the admin screens, not in environment variables.

## Pages and APIs

Public pages: `/`, `/features`, `/industries`, `/pricing`, `/about`, `/contact`, `/careers`, `/security`, `/faq`, `/roadmap`, `/changelog`, `/status`, `/help`, `/help/<category>/<article>`, `/legal`, `/legal/<name>`, `/blog`, `/blog/<slug>`, `/blog/category/<slug>`, `/blog/tag/<slug>`, `/blog/archive/<yyyy-mm>`, `/blog/rss.xml`, `/tools`, `/tools/invoice-generator`, `/tools/late-fee-calculator`, `/tools/sales-tax-calculator`, `/<slug>` (pages added in the CMS), `/sitemap.xml`, `/robots.txt`, `/.well-known/security.txt`.

Admin pages: `/admin/cms` (tabs: site pages, legal pages, help articles), `/admin/cms/<slug>`, `/admin/blog`, `/admin/blog/<id|new>`, `/admin/seo`, `/admin/analytics`, `/admin/marketing`.

APIs: `/api/public-site/{consent, contact, lead, hit, track, ab, legal/accept, blog/view}`, `/api/cms/{pages, editor, save, publish, media, media/[id]}`, `/api/blog/{posts, post, save, action, taxonomy}`, `/api/seo/{settings, audit, og/[kind]/[...slug]}`, `/api/analytics/{pixels, summary}`, `/api/marketing/{testimonials, leads, campaigns, experiments}`.

## For other STEPs (requirements)

1. STEP 03 (sign-up and sign-in): call `hasAcceptedCurrent(subject, 'terms')` from `services/cms/legal.ts` (subject `user:<id>`) to ask a signed-in person to accept a new version, and record acceptance with `recordAcceptance` or the route `/api/public-site/legal/accept`. The sign-up form should link to `/legal/terms` and `/legal/privacy`.
2. STEP 04: make the incident record usable for a public status page: a field `public_summary` (text) and a flag `public`; add probes for payments and e-mail so the status page can list them. Add the origins of `originsFor(...)` in `lib/analytics/providers.ts` to `connect-src` and `img-src` for public paths when the `kd_consent` cookie allows the category (see DEPENDENCY_REQUESTS).
3. STEP 14 (billing): provide a public price source; until then prices are typed into the `prices` field of the pricing block in the CMS. The "Start free" buttons link to `/signup`.
4. STEP 07 (support): the help center is separate from tickets; link the help center from the ticket screens.
5. Any STEP that adds a page for visitors should add its nav item to its own `config/nav/sNN.ts` with the page, and its address to `indexablePages` only through the CMS (not in `services/seo/pages.ts`).

## Owner steps (outside the code)

1. Legal review: have a lawyer read the twelve built-in legal texts (`lib/cms/defaults/legal.ts`) before launch and edit them in `/admin/cms?kind=legal`. They make no promise the product cannot keep and claim no certification.
2. Google Search Console and Bing Webmaster Tools: add the site, copy the verification codes into `/admin/seo` (CEO or super admin), submit `/sitemap.xml`.
3. Tracking: create the accounts you want (GA4, GTM, Meta, TikTok, LinkedIn, X, Clarity, Pinterest), paste only the identifiers into `/admin/analytics`, test each in the provider's own tool. For Meta server events create a conversions API access token and set `META_CAPI_ACCESS_TOKEN`.
4. Content: replace the sample sentences you do not agree with, add real testimonials (with permission) in `/admin/marketing`, add blog authors before the first post, fill prices in the pricing block when billing publishes them.
5. Status page: after STEP 04 adds public incident wording, review what is shown at `/status`.
6. Cloudflare Turnstile keys (already needed by STEP 03) also protect the contact form and the lead box.

## Commits

06.1 to 06.11 on this branch; see `git log --oneline` (messages start with `feat(step06): 06.k`).
