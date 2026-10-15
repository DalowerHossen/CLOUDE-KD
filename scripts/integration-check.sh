#!/usr/bin/env bash
# path: scripts/integration-check.sh
# Baseline and merge check.  --quick: generators, lint, typecheck, guards.  Full: also migrations, build and bundle scan.
set -euo pipefail
cd "$(dirname "$0")/.."
quick=0
[ "${1:-}" = "--quick" ] && quick=1

step() { printf '\n== %s ==\n' "$1"; }

step "generated files are current"
node scripts/gen.mjs --check
step "lint"
npm run --silent lint
step "typecheck"
npm run --silent typecheck
step "guards"
bash scripts/check-all.sh

if [ "$quick" -eq 0 ]; then
  step "migrations from zero + assertions"
  bash scripts/db-apply.sh --clean
  step "production build"
  SKIP_ENV_VALIDATION=1 npm run --silent build
  step "client bundle secret scan"
  bash scripts/check-bundle-secrets.sh
fi
printf '\nintegration-check: ok\n'
