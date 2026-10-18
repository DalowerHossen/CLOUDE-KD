# STEP 13 - Verification record

## 13.1 Portal foundation (2026-10-18)
- `SKIP_ENV_VALIDATION=1 npx tsx --conditions=react-server scripts/verify/step13-portal.ts` -> 6 checks passed: strict request shapes (token and six-digit code), device labels, route to document type map, the code cookie (bound to the link, expires, refuses edits), every state of the one door (ok, wrong document type, invalid, expired, revoked, code needed, limited), and limiter keys that never contain the link.
- `scripts/db-apply.sh --clean`: all migrations apply and re-apply; `sql/assertions/s13_001_portal_core.sql` passes (RLS on, events are a log, one pending re-request per link, decision columns follow the status, token lookup works for an expired link and is closed to anon and authenticated).
- Not run here (needs a running app and database): the browser run of the pages (mobile 320 px, dark mode, zero analytics requests). Recorded for the sandbox run in 13.10.
