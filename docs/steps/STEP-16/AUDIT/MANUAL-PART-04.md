<!-- path: docs/steps/STEP-16/AUDIT/MANUAL-PART-04.md -->
# Manual reading, part 4 (features 298 to 396, the lines that are Bengali only)

Read against the code on 2026-10-27; nothing was opened in a browser. Results: present, partial, not found, check in browser.

| No | Feature | Result | Evidence or note |
|---|---|---|---|
| 299 | Translation management structure | partial | one string catalogue (`lib/i18n`, `t()`); no translation manager |
| 300 | Multi-language e-mail template structure | not found | templates hold one language |
| 302 | Dynamic gradient backgrounds | present | `HeroBackdrop` in `components/marketing/art/illustrations.tsx`, hero block |
| 313 | Heatmap visualisation | not found | |
| 316 | Dashboard chart gallery | present | `components/charts` (dashboard board, ageing, sent against paid) |
| 318 | Milestone celebration animation | present | `components/shared/confetti.tsx` |
| 319 | Achievement badges | not found | project milestones are billing milestones, not badges |
| 322 | Form pattern guide | partial | `form-wrapper.tsx`, `FormField`, `ui-gallery.tsx`; no guide text |
| 323 | Table density standard | not found | |
| 325 | Button size scale sm, md, lg | present | `components/ui/button.tsx` (default, sm, lg, icon) |
| 326 | Input variants guide | partial | `components/ui/input.tsx`; no guide |
| 327 | Base component guide | partial | `components/shared/ui-gallery.tsx` shows the components |
| 328 | Modal and drawer pattern | present | `dialog.tsx` (full screen on phones), `sheet.tsx` |
| 330 | Central number format | present | `lib/utils/formatting.ts`, `lib/utils/currency.ts` |
| 332 | Time zone display per user | partial | a company time zone setting exists (`lib/company/sections.ts`); pages show UTC, no per-user zone |
| 333 | Consistent toast position | partial | one `Toaster`, but no code emits a toast (see 146) |
| 334 | Consistent confirmation wording | check in browser | |
| 335 | Visual regression snapshots in CI | not found | |
| 339 | Mobile 320 px test on every page | not found | no automated check |
| 341 | Empty-state illustration library | present | `Illustration` kinds empty, search, document, secure, success, error |
| 342 | Onboarding illustrations | not found | no onboarding kind |
| 343 | Error-state illustration | present | kind `error` |
| 344 | Success-state illustration | present | kind `success` |
| 345 | Marketing illustrations | partial | hero backdrop and the kinds above |
| 347 | Custom illustration style guide | not found | |
| 356 | Legal links in the footer | present | `config/nav/s06.ts` (`foot-legal` and the legal pages) |
| 364 | Dropdown system | present | `components/ui/dropdown-menu.tsx` |
| 365 | Tooltip system | present | `components/ui/tooltip.tsx` |
| 366 | Popover system | present | `components/ui/popover.tsx` |
| 370 | Progress bar component | partial | progress bars appear on pages (storage, batches, migration), no shared component in `components/ui` |
| 374 | Print preview mode | partial | print rules in `styles/globals.css`; no preview mode |
| 379 | Resend verification e-mail | present | `/api/auth/resend-verification`, `resend-form.tsx` |
| 380 | Verification link expires after 24 hours | partial | `EMAIL_VERIFICATION_TTL_SECONDS` (86400) in `config/auth-lock.ts` is never used; the link is a Supabase one-time token, so its life is the Supabase "Email OTP expiration" setting (one hour by default) |
| 382 | Reset-password link expires after 1 hour | present | `PASSWORD_RESET_TTL_SECONDS` = 3600 in `services/auth/reset-flow.ts` |
| 385 | Password show and hide toggle | present | `app/(auth)/_components/password-field.tsx` |
| 389 | Captcha on forgot password | present | the schema needs `turnstileToken` |
| 396 | Log out of all devices | present | `/api/auth/sessions/revoke-others`, sessions panel |

## Worth a decision: 380 (set the Supabase e-mail OTP expiry to 24 hours, or use our own token). Not built: 300, 313, 319, 323, 335, 339, 342, 347.
