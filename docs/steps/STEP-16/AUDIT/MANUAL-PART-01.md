<!-- path: docs/steps/STEP-16/AUDIT/MANUAL-PART-01.md -->
# Manual reading, part 1 (features 1 to 99, the lines that are Bengali only)

Read by a person against the code on 2026-10-27. Nothing was opened in a browser. Results: present (a file does it), partial (some of it), not found (searched, nothing), check in browser (the code is there, the look or behaviour needs eyes).

| No | Feature | Result | Evidence or note |
|---|---|---|---|
| 2 | Custom design system | present | `config/design-tokens.json`, `tailwind.config.ts`, `components/ui` |
| 3 | Branded sidebar and top bar | present | `components/layout/sidebar.tsx`, `topbar.tsx` |
| 4 | Logo component and favicon | present | `components/layout/logo.tsx`, `public/favicon.svg` |
| 10 | Brand voice guide | not found | no document in `docs` |
| 11 | Brand asset library | partial | `public/brand` holds three logos only |
| 12 | Favicon pack 16, 32, 180, 192, 512 | present | all five PNG files exist with the right sizes |
| 13 | Apple touch icon | present | `public/apple-touch-icon.png` (180 by 180) |
| 16 | One spacing scale 4 to 64 | present | `config/design-tokens.json` has 4, 8, 12, 16, 24, 32, 48, 64 |
| 18 | One shadow scale sm to 2xl | present | the same file |
| 21 | Consistent colour tokens | present | colour roles in `tailwind.config.ts` |
| 26 | Hover and transition micro-interactions | present | `components/ui/button.tsx`, `badge.tsx`, `dropdown-menu.tsx` |
| 29 | Smooth page-to-page transition | present | `app/(dashboard)/template.tsx` (public and admin groups have none) |
| 30 | Button press feedback | present | `button.tsx` |
| 31 | Scale and fade animation | present | `components/shared/motion.tsx` |
| 32 | Stagger animation for lists | present | `components/shared/motion.tsx`, `lib/utils/motion.ts` |
| 36 | Happy-path animation | present | `components/shared/confetti.tsx`, onboarding wizard |
| 38 | Dark and light toggle | present | `components/layout/theme-toggle.tsx` |
| 41 | High contrast mode | present | toggle in `theme-toggle.tsx`, rules in `styles/globals.css` |
| 42 | Custom theme builder per tenant | partial | the branding editor (`components/client/branding-form.tsx`) restyles the client-facing pages (colours, font, logo, accessibility check, history); a company cannot restyle its own dashboard |
| 43 | Real-time theme preview | present | the branding editor shows a live preview of a client page |
| 48 | Sticky top bar, 64 px | present | `topbar.tsx` has `sticky top-0 h-16` |
| 52 | Sidebar state kept | present | `useUiStore` `sidebarCollapsed` in `sidebar.tsx` |
| 54 | Flexible container component | check in browser | no single container component found; pages set their own widths |
| 58 | Primary action button on the right of the header | present | `components/shared/page-header.tsx` |
| 60 | Dashboard layout template | present | `app-shell.tsx` and the dashboard pages |
| 61 | List and table layout template | present | `components/shared/data-table.tsx` |
| 63 | Settings layout with tabs | present | `components/settings/section-page.tsx` |
| 64 | Form layout, single or multi column | present | `components/shared/form-wrapper.tsx` |
| 65 | Empty container layout | present | `components/shared/state-views.tsx` |
| 68 | Public hero section | present | `components/marketing/blocks` |
| 71 | Blog page template | present | `app/(public)/blog`, `components/marketing/blog` |
| 72 | Landing page A/B variants | present | `components/marketing/blocks/ab-hero.tsx`, `lib/marketing/ab-store.ts`, `/api/public-site/ab` |
| 73 | Auth page: centre card plus brand panel | partial | centre card only (`components/layout/auth-shell.tsx`), no brand panel |
| 77 | Responsive 320 to 1920 px | present | breakpoints in the tokens; base styles start at 320 |
| 78 | Breakpoints 320, 375, 430, 768, 1024, 1280, 1920 | present | tokens: xs 375, sm 430, md 768, lg 1024, xl 1280, 2xl 1920 |
| 80 | Landscape handling | not found | no orientation rules |
| 81 | Tablet-specific layout | partial | `md` and `lg` grid classes; no tablet-only design |
| 82 | Ultra-wide support above 1920 px | check in browser | no rule for it found |
| 83 | Hamburger and slide drawer | present | `components/layout/mobile-drawer.tsx` |
| 84 | Bottom navigation bar | present | `components/layout/bottom-nav.tsx` |
| 88 | Home indicator space on iOS | present | `safe-bottom` in `dialog.tsx`, `sheet.tsx`, shells |
| 90 | Nav toggle animation | check in browser | |
| 91 | Touch targets 44 by 44 px everywhere | check in browser | many controls set `min-h-[44px]`; "everywhere" cannot be proved by reading |
| 92 | Actions in the thumb zone | partial | bottom bulk bar and bottom nav only |
| 93 | Swipe actions on list items | not found | |
| 94 | Pull to refresh | not found | |
| 95 | Long-press context menu | not found | |
| 99 | Table turns into a card list on mobile | present | `data-table.tsx` renders a card list below `md` |

## Differences from the spec

- Sidebar widths: spec 264 px open and 72 px collapsed; code `w-64` (256 px) and `w-20` (80 px).
- Not built: 10, 80, 93, 94, 95; partly built: 11, 42, 73, 81, 92. (Features 42 and 43 were first marked less complete and corrected after reading the branding editor; theme import and export, feature 44, exist there too: `/api/portal/branding/import` and `history`.)
