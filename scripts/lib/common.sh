#!/usr/bin/env bash
# path: scripts/lib/common.sh
# Shared helpers for guard scripts. Source this file; do not execute it.
# GUARD_ROOT (optional) points the guards at another directory (used by scripts/verify/step01-guards.sh).
ROOT="${GUARD_ROOT:-$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)}"
cd "$ROOT" || exit 2
FAILED=0
GUARD_NAME="${GUARD_NAME:-guard}"

fail() {
  printf 'FAIL [%s]: %s\n' "$GUARD_NAME" "$1" >&2
  FAILED=1
}

# Lists tracked and untracked (not ignored) files, one per line.
all_files() {
  git ls-files -co --exclude-standard | sort -u
}

# Lists files whose path matches the given extended regex.
files_matching() {
  all_files | grep -E "$1" || true
}

# Directories that contain application code (tests, docs and tooling excluded).
CODE_DIRS_REGEX='^(app|components|lib|services|config|cron|workers|types|schemas|stores|emails|pdf-templates|migrations|seeds|styles|public|sql|supabase)/|^(middleware|instrumentation)\.ts$'

finish() {
  if [ "$FAILED" -ne 0 ]; then
    printf 'RESULT [%s]: FAILED\n' "$GUARD_NAME" >&2
    exit 1
  fi
  printf 'RESULT [%s]: ok\n' "$GUARD_NAME"
  exit 0
}
