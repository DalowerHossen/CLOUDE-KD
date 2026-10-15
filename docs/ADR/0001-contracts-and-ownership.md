# ADR 0001 - Contracts and path ownership

Status: accepted

## Context

Sixteen chats build the platform in parallel. Without boundaries they would edit the same files and duplicate helpers.

## Decision

- Every path and table has exactly one owning STEP (`docs/execution/OWNERSHIP_MAP.md`, machine-readable copy in `config/ownership.json`).
- STEPs call each other only through the interfaces in `types/contracts/` and the service container `lib/container.ts`.
- Shared files are generated from per-STEP fragment files (`scripts/gen.mjs`). `package.json` belongs to the Integrator.
- `scripts/check-ownership.sh` fails when a branch touches files of another STEP.

## Consequences

A STEP can be developed and verified alone. Integration is a mechanical merge plus `scripts/integration-check.sh`. A needed contract change goes through the Integrator.
