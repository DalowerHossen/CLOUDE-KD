#!/usr/bin/env bash
# path: scripts/check-no-tests.sh
# Rule 4: no test files, test folders, test configs or test dependencies.
GUARD_NAME=no-tests
source "$(dirname "$0")/lib/common.sh"

while IFS= read -r f; do
  [ -n "$f" ] && fail "test file: $f"
done < <(files_matching '\.(test|spec)\.(ts|tsx|js|jsx|mjs|cjs)$|(^|/)(tests?|__tests__|e2e|cypress)/|(^|/)(jest|vitest|playwright|cypress|karma)\.config\.')

if [ -f package.json ]; then
  if grep -qE '"(jest|ts-jest|vitest|mocha|ava|cypress|playwright|@playwright/test|supertest|@testing-library/[a-z-]+)"' package.json; then
    fail "test framework dependency found in package.json"
  fi
fi
finish
