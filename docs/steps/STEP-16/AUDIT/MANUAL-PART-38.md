<!-- path: docs/steps/STEP-16/AUDIT/MANUAL-PART-38.md -->
# Manual reading, part 38 (features 3664 to 3762, the lines that are Bengali only)

Read against the code and the STEP 10 decision D20 on 2026-10-27; nothing was opened in a browser.

| No | Feature | Result | Evidence or note |
|---|---|---|---|
| 3706 | Real-time payment risk score, 0 to 100 | partial | STEP 10 D20: the engine is smaller than the list; payments are held for review by reasons (`postal_code_mismatch`, `ip_country_mismatch` and others), not by a number |
| 3708 | IP and card country mismatch detection | present | review reason `ip_country_mismatch` (`services/payment/reviews.ts`) |

## Partly built: 3706.
