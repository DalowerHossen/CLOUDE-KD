#!/usr/bin/env bash
# path: scripts/check-ownership.sh
# Usage: scripts/check-ownership.sh <step-number> [ref] [base]
set -euo pipefail
exec node "$(dirname "$0")/check-ownership.mjs" "$@"
