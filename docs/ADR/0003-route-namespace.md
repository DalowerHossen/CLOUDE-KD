# ADR 0003 - Route namespace

Status: accepted

## Context

Next.js route groups such as `(public)` and `(admin)` do not add URL segments. Two groups with the same page name (for example settings or support) or two home pages would collide at build time.

## Decision

- Public home is `/`; the dashboard home is `/dashboard`; the admin area lives under `/admin`.
- Dashboard pages use root-level paths. Their names are reserved (list in OWNERSHIP_MAP section 7), as are the auth and portal paths.
- Development-only preview pages live under `/dev/...` and `/admin/dev/...`. They return the not-found page unless `APP_ENV=development` and `SHELL_PREVIEW=1`. The middleware (STEP 04) also blocks `/dev/*` when `APP_ENV` is `production`.

## Consequences

Routes never collide. Public pages cannot use reserved names.
