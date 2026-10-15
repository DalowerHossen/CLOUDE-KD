#!/usr/bin/env bash
# path: scripts/check-commit-msg.sh
# Conventional commits (the "test" type is not allowed because the project has no tests).
set -euo pipefail
msg_file="${1:?commit message file required}"
subject="$(head -n 1 "$msg_file")"
if printf '%s' "$subject" | grep -qE '^(Merge |Revert )'; then
  exit 0
fi
if ! printf '%s' "$subject" | grep -qE '^(feat|fix|docs|style|refactor|perf|chore|build|ci)(\([a-z0-9-]+\))?!?: .{3,100}$'; then
  printf 'Commit subject must follow: type(scope): summary\nAllowed types: feat fix docs style refactor perf chore build ci\nGot: %s\n' "$subject" >&2
  exit 1
fi
