<!-- path: docs/steps/STEP-16/AUDIT/MANUAL-PART-02.md -->
# Manual reading, part 2 (features 100 to 198, the lines that are Bengali only)

Read against the code on 2026-10-27; nothing was opened in a browser. Results: present, partial, not found, check in browser.

| No | Feature | Result | Evidence or note |
|---|---|---|---|
| 100 | Sticky first column in horizontally scrolling tables | not found | no `sticky left` in any table |
| 102 | Sticky bottom action bar on forms | partial | only the invoice bulk selection bar (`components/invoice/bulk-selection.tsx`) |
| 105 | Multi-step invoice form on mobile | not found | the invoice form is one page |
| 109 | Offline detection banner | present | `components/layout/offline-banner.tsx` |
| 115 | Shake to undo | not found | |
| 122 | Branded loading skeleton | present | `components/ui/skeleton.tsx`, `state-views.tsx`, `loading.tsx` in the route groups |
| 123 | Inline loading spinner | present | loading state of `components/ui/button.tsx` |
| 125 | Infinite scroll loading | not found | lists use pages |
| 128 | Helpful tips on loading screens | not found | |
| 131 | Friendly error messages | present | `lib/errors`, `components/shared/route-views.tsx`, error pages per group |
| 134 | Branded 404 page with a search bar | partial | branded 404 (`RouteNotFound`) without a search bar |
| 136 | Network error handling | partial | offline banner; forms show a generic message when a request fails |
| 137 | Timeout error handling | partial | payment and gateway code use timeouts; no common UI for a slow request |
| 146 | Success toast notifications | partial | `Toaster` is mounted in `app-providers.tsx`, but no code emits a toast; forms show inline success alerts |
| 150 | No blank white screen | present | `error.tsx` and `global-error.tsx`, `loading.tsx`, `not-found.tsx` |
| 160 | Breadcrumbs on every page | partial | `Breadcrumbs` is in the top bar of the app shell; the auth and portal shells have none |
| 161 | Active and parent-active highlight | check in browser | `components/layout/nav-list.tsx` |
| 162 | Role-based menu filter | present | `visibleNavItems(navMap, group, role)` in the layouts |
| 163 | Permission-based menu filter | partial | the menu filters by role only; no permission check in the navigation code |
| 165 | Zero dead-link audit script in CI | present | `scripts/check-dead-links.mjs` runs in `scripts/check-all.sh` (commit hook and CI) |
| 167 | Tab navigation pattern | present | `components/ui/tabs.tsx`, settings pages |
| 168 | Dropdown menu (user menu) | present | `components/layout/user-menu.tsx` |
| 173 | Keyboard shortcuts on every action | partial | `components/layout/shortcuts-dialog.tsx` covers a few actions |
| 187 | Accessibility statement page | present | legal page `accessibility` in `lib/cms/defaults/legal.ts` |
| 188 | Full keyboard navigation on every page | check in browser | skip link and focus rings exist |
| 189 | Logical tab order | check in browser | |

## Not built: 100, 105, 115, 125, 128. Partly built: 102, 134, 136, 137, 146, 160, 163, 173.
