# STEP 06 verification record

Date: 2026-10-16. Branch: claude/clever-goldberg-8ncdae. PostgreSQL 16 (plain, with `supabase/local-shim.sql`).

## A. Automated checks (run in this session)

| Command                                                                                                                                                  | Result                                                                    |
| -------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| `PGHOST=/tmp/pgsock bash scripts/integration-check.sh` (generators, lint, typecheck, guards, migrations from zero twice, assertions, build, bundle scan) | ok                                                                        |
| `bash scripts/db-apply.sh --clean`                                                                                                                       | S01 to S06 migrations applied and re-applied cleanly (S06_001 to S06_007) |
| `sql/assertions/s06_001` to `s06_007`                                                                                                                    | ok                                                                        |
| `npx tsx scripts/verify/step06-core.ts`                                                                                                                  | 11 checks ok                                                              |
| `npx tsx scripts/verify/step06-seo.ts`                                                                                                                   | 5 checks ok                                                               |
| `node scripts/verify/step06-scripts.mjs`                                                                                                                 | ok (tracking code reachable only from the public frame)                   |
| `node scripts/verify/step04-static.mjs`                                                                                                                  | ok                                                                        |
| `bash scripts/check-all.sh`                                                                                                                              | ok                                                                        |

Database assertions prove: contact message checks and 24-month purge; CMS versions (one open and one live version per page, content fixed after the draft stage, publish, schedule, release when due, revert); legal acceptance (one row per subject, document and version; never changed or deleted); blog (slug rules, edit history trigger, view counter only for published posts, scheduled release, full-text search); search settings (one row per key, object value); analytics counters (adding up, path and event checks); marketing (one lead per address, lower-case address, A/B counting only while an experiment runs and has no winner). Every `kd_*` function is closed to `authenticated`; every table has RLS and is closed to clients.

`step06-core.ts` proves: cookie consent round trip and junk handling; all eleven core pages, twelve legal pages and eight help articles have valid blocks, unique titles, ASCII text and no brand names; safe links only; editor templates produce valid blocks; rich text is cleaned on save; blog helpers and input shapes; tracking providers start only with the right consent and a well-formed identifier; free-tool arithmetic is exact (invoice totals, late fee, sales tax) and refuses bad input; A/B significance (z-test) and input shapes; status page states, 90-day bars and the uptime estimate; reserved addresses; the pricing table matches the plan catalogue.

`step06-seo.ts` proves: the eight structured-data types are built with the right type and fields (no invented offer); script text cannot close the tag; page data per slug; search settings accept only tokens and https profiles; every route folder of the product, sign-in and portal groups is disallowed in robots and no public page is.

`step06-scripts.mjs` proves by static scan: the tracking loader and the provider starter are imported only by the public frame and the marketing code; no protected area (`(auth)`, `(client-portal)`, `(dashboard)`, `(admin)`) imports them or the public frame; provider addresses appear only in the provider list; the loader reads the consent cookie and filters providers before it starts any, and refuses private prefixes.

Production build smoke (server started with test environment values): `/`, `/features`, `/industries`, `/pricing`, `/about`, `/contact`, `/careers`, `/security`, `/legal`, twelve `/legal/*` pages, `/blog`, `/blog/rss.xml`, `/help`, `/help/<category>/<article>`, `/faq`, `/roadmap`, `/changelog`, `/status`, `/tools` and its three tools answer 200 with their own title; unknown addresses under `/blog`, `/legal`, `/help` and `/<slug>` answer a real 404; `/robots.txt`, `/sitemap.xml` (indexable pages only), `/.well-known/security.txt` and the share images answer correctly. The status page says "We are having a major problem" in this environment because the database is unreachable, which is the intended behavior.

## B. Manual script (needs a Supabase project, the merged STEPs 02 to 05, and for 6 to 9 external accounts)

Not run here: no Supabase project and no provider accounts. Record the result next to each line.

1. Sign in as `super_admin`, open `/admin/cms`, edit the home page hero text, preview, save, publish: the front page shows the new text within 5 minutes (or at once after a refresh). Revert to the earlier version.
2. Schedule a page for 3 minutes ahead: it appears after the `cms-publish` cron job runs. As a content manager, publish: the version shows "waiting for approval"; after the CEO approves it, the page goes live within 5 minutes.
3. Upload an image in the editor media picker; use it in an image block and as a blog cover; open `/api/cms/media/<id>` without a session: the image shows. A non-image upload is refused.
4. `/admin/blog`: add an author, a category and two tags; write a post with a heading, a list and a link; paste `<script>alert(1)</script>` through the HTML of a link field: the stored text has no script. Publish and check `/blog`, the post page, `/blog/rss.xml`, related posts and search (`/blog?q=word`). Schedule another post.
5. `/legal/terms`: press "I accept this version"; the row appears in `legal_acceptances`; publish a new version of the page in the CMS and accept again: a second row with the new version.
6. Cookie banner: reject all and reload: no request to any provider address (browser network tab). Accept all with identifiers saved in `/admin/analytics`: the providers load; open `/login`, `/pay/<token>` and `/admin`: no provider request.
7. Meta conversions API (needs `META_CAPI_ACCESS_TOKEN`): send a contact message with marketing allowed; the event shows in Meta's test events once (browser and server share the event id). Check each provider in its own test tool (Tag Assistant, Meta Pixel Helper, TikTok Pixel Helper, LinkedIn, X, Pinterest, Clarity), because the loaders were written from the public snippet shapes without live documentation access.
8. `/admin/marketing`: create an A/B experiment on the home hero (key put into the hero block in the page editor), start it, visit as two different visitors who allow analytics: exposures count up; click the main button: a goal counts. Pick a winner: the home page then shows the winning text for everyone.
9. Free tools: build an invoice, print to PDF (the header, footer and banner do not print); use the late fee and sales tax calculators; submit the e-mail box without ticking the agreement: the lead is stored without e-mails; tick it: three queued messages (now, +3 days, +7 days).
10. Campaign: add a campaign draft, send a test to yourself, send to all: only leads who agreed receive it; the unsubscribe link of the message puts the address on the suppression list.
11. `/admin/seo`: run the audit, fix a reported problem; save verification tags as CEO (step-up needed); check the tags in the page source of `/`.
12. Search Console: submit `/sitemap.xml`; check `/robots.txt` and the structured data with the rich results test.
13. `/status`: open an incident in `/admin/incidents` (STEP 04): it appears with its title and state, without summary or notes; resolve it and see the 90-day bar.
