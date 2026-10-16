# STEP 06 - Public Site, CMS, SEO and Marketing

Wave B. Depends on: STEP 01. Contract use: tenant, audit, permissions, approval, security, email, storage, entitlement. Provides: public pages and CMS services (no contract consumed by others except `consent`-aware analytics loader).

## Feature sources

- Part 1 lines 266-344 (G public pages, legal, support, special, lead generation, SEO), 378-403 (I visuals, charts, polish items), 428-444 (K illustrations and images), 445-465 (L footer only)
- Part 7 lines 2924-3035 (C CMS, blog, templates view only, status page UI; D SEO), 3037-3156 (E analytics and pixels, F conversion, G marketing), 3180-3239 (I-J monetization pages, legal and trust pages), 3303-3326 (M growth and retention tools)
- Part 6 lines 2757-2781 (J1 help center)
- Part 10 lines 4409-4435 (I final polish, J differentiators: public parts)
- MASTER_PROMPT: 45 public pages, SEO module
- REQUIREMENTS_SPEC: REQ-CARD item 1 (analytics are never loaded on payment or token pages)

## Owned paths and migrations

OWNERSHIP_MAP.md rows 06 and section 4. Migration block `S06_*`.

## Sub-steps

- 06.1 Public layout: header, mega menu, footer, cookie consent banner connected to the consent contract, theme toggle, language policy (English only).
- 06.2 Core marketing pages: home (hero, trust signals, features, pricing teaser, testimonials, FAQ, CTA), features, industries, pricing (reads plan data through the entitlement contract), about, contact (honeypot, Turnstile, email), careers, security and trust pages.
- 06.3 CMS core: block system (hero, features, testimonials, CTA, FAQ), page versions, draft, schedule, preview, revert, media via the storage contract, approval through the approval contract for content_manager, admin pages `(admin)/admin/cms`.
- 06.4 Legal pages (CMS-editable): terms, privacy, refund policy, cookie, DPA, acceptable use, with version history and acceptance tracking for later evidence use.
- 06.5 Blog: Tiptap editor with DOMPurify, categories, tags, authors, cover images, scheduling, RSS, related posts, admin `(admin)/admin/blog`.
- 06.6 SEO: eight JSON-LD schema types, meta manager, OG image generation, sitemap, robots, canonical rules, noindex rule for token and app pages, SEO audit report, verification tags, admin `(admin)/admin/seo`.
- 06.7 Analytics and pixels: GA4, GTM, Meta Pixel with conversions API, TikTok, LinkedIn, X, Clarity, Pinterest; loaded only after consent and never on `(auth)`, payment, `(client-portal)` or `(admin)` routes; in-app product analytics; admin `(admin)/admin/analytics`.
- 06.8 Conversion and marketing: A/B testing framework (traffic split, goal, significance, winner), trust signals, testimonials manager, lead generation tools (free invoice generator, calculators, template library), lead capture and `leads` admin, email campaigns and drip sequences using the email contract, retention tools, admin `(admin)/admin/marketing`.
- 06.9 Support content: help center and knowledge base, FAQ, public status page UI fed by the incident service, public roadmap, changelog page ("What's new").
- 06.10 Visual polish: illustrations, empty-state art, charts style guide for marketing, easter eggs from the list, print styles for public pages.

## Security notes

All CMS input sanitized. Forms use Turnstile and honeypot. Public APIs rate limited. No tracking script is reachable from sensitive routes (verified by script).

## Verification

Every public route registered in nav fragments, returns 200, has unique title and description, JSON-LD validates, sitemap lists indexable pages only, consent withheld means zero pixel requests, lighthouse budget met, scripts absent on payment and portal routes.

## Handoff must list

Routes, CMS block types, SEO schemas, consent categories, env keys for analytics.
