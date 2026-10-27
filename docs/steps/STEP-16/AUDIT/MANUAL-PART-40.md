<!-- path: docs/steps/STEP-16/AUDIT/MANUAL-PART-40.md -->
# Manual reading, part 40 (features 3862 to 3960, the lines that are Bengali only)

Read against the code on 2026-10-27; nothing was opened in a browser. Two lines of this part (3863 and 3909) are only a row of underscores in the list, not features.

| No | Feature | Result | Evidence or note |
|---|---|---|---|
| 3938 | Browser plugin detection | not found | the device collector (`lib/security/device-collector.ts`) does not read plugins |
| 3942 | Touch support detection | not found | |
| 3944 | Device charging status | not found | |
| 3957 | IP to account mapping (which accounts from which IP) | partial | `lib/security/signals.ts` and `services/fraud/signals.ts` count accounts per address; there is no screen that lists them |

## Not found: 3938, 3942, 3944. Partly built: 3957.
