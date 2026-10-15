#!/usr/bin/env bash
# path: scripts/apply-dependency-requests.sh
# Integrator tool. Reads docs/steps/STEP-*/DEPENDENCY_REQUESTS.md and installs requested packages.
# Request line format:   - <package>@<exact-version> [dev]: <reason> (files: <paths>)
# Applied lines get the suffix " [APPLIED]" so they are never installed twice.
set -euo pipefail
cd "$(dirname "$0")/.."

applied=0
shopt -s nullglob
for file in docs/steps/STEP-*/DEPENDENCY_REQUESTS.md; do
  while IFS= read -r line; do
    case "$line" in
      "- "*"[APPLIED]"*) continue ;;
      "- "*) ;;
      *) continue ;;
    esac
    spec="$(printf '%s' "$line" | sed -E 's/^- ([^ :]+).*/\1/')"
    flag=""
    if printf '%s' "$line" | grep -qE '^- [^ ]+ dev:'; then flag="--save-dev"; fi
    if ! printf '%s' "$spec" | grep -qE '^(@[a-z0-9._-]+/)?[a-z0-9._-]+@[0-9]+\.[0-9]+\.[0-9]+([-+][A-Za-z0-9.-]+)?$'; then
      printf 'Skipping malformed request in %s: %s\n' "$file" "$line" >&2
      exit 2
    fi
    printf 'Installing %s (requested in %s)\n' "$spec" "$file"
    # shellcheck disable=SC2086
    npm install --ignore-scripts --no-audit --no-fund --save-exact $flag "$spec"
    escaped_line="$(printf '%s' "$line" | sed -e 's/[][\/.*^$&]/\\&/g')"
    sed -i "s/^${escaped_line}\$/${escaped_line} [APPLIED]/" "$file"
    applied=$((applied + 1))
  done < "$file"
done
printf 'Dependency requests applied: %d\n' "$applied"
