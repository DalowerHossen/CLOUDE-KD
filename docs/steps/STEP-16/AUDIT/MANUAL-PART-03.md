<!-- path: docs/steps/STEP-16/AUDIT/MANUAL-PART-03.md -->
# Manual reading, part 3 (features 199 to 297, the lines that are Bengali only)

Read against the code on 2026-10-27; nothing was opened in a browser. Results: present, partial, not found, check in browser.

| No | Feature | Result | Evidence or note |
|---|---|---|---|
| 201 | High contrast mode | present | same as feature 41 |
| 209 | Pricing preview section on the home page | present | block `pricing_teaser` in `lib/cms/defaults/home.ts` |
| 214 | Newsletter signup | present | `components/marketing/tools/lead-box.tsx`, `services/marketing/leads.ts` |
| 217 | Feature detail page per feature | partial | one features page; a per-feature page only if an editor adds a CMS page (`app/(public)/[slug]`) |
| 222 | About page | present | `app/(public)/about`, `lib/cms/defaults/about.ts` |
| 226 | Press and brand kit page | not found | |
| 227 | Partner page | not found | can be made as a CMS page, none exists |
| 228 | Integration directory page | not found | |
| 235 | Security page | present | `app/(public)/security` |
| 239 | Sub-processor list | present | legal page `sub-processors` |
| 240 | Accessibility statement page | present | legal page `accessibility` |
| 245 | Video tutorial page | not found | |
| 247 | Live chat widget hook | not found | |
| 248 | Public blog list and detail | present | `app/(public)/blog` |
| 250 | Public changelog page | present | `app/(public)/changelog` |
| 253 | Feature request board | partial | a roadmap page exists, with no voting (see gap 1928) |
| 261 | Webinar or workshop registration | not found | |
| 278 | Zero Bengali or other language in code | present | `scripts/check-english-only.sh` runs at every commit and in CI |
| 280 | E-mail templates in English | present | the same guard; `scripts/verify/step13-emails.ts` |
| 282 | Error messages in English | present | the same guard |
| 284 | Every button, label and tooltip written | check in browser | strings live in `lib/i18n/strings/en/` (39 files) |
| 286 | Every e-mail template has full copy | check in browser | templates are registered; a person must read each |
| 288 | Microcopy guide | not found | |
| 289 | Error message catalogue in one voice | partial | messages come from `lib/errors` and the string files; no catalogue document |
| 293 | Capitalisation consistency | not found | no rule or check |
| 294 | Punctuation consistency | not found | no rule or check |

## Not built: 226, 227, 228, 245, 247, 261, 288, 293, 294. Partly built: 217, 253, 289.
