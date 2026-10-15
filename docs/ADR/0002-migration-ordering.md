# ADR 0002 - Migration ordering

Status: accepted

## Context

Parallel chats cannot agree on timestamps, and timestamp collisions or wrong orders break foreign keys.

## Decision

Migration files are named `S{NN}_{seq3}_{description}.sql` with a matching `_down.sql`. The order is the STEP number, then the sequence. A STEP may reference tables of lower-numbered STEPs only; references to higher-numbered STEPs go through contracts. Tables are owned by one STEP (OWNERSHIP_MAP section 4). Migrations are idempotent and verified by applying them twice (`scripts/db-apply.sh --clean`).

## Consequences

Names never collide, the apply order is deterministic, and dependency direction is enforced by review and `scripts/check-migrations.mjs`.
