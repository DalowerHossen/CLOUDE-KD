#!/usr/bin/env bash
# path: scripts/check-english-only.sh
# Rule 1: no non-ASCII text in the repository (docs/bn and docs/source keep the owner's original wording).
GUARD_NAME=english-only
source "$(dirname "$0")/lib/common.sh"

mapfile -t files < <(all_files | grep -vE '^(docs/bn/|docs/source/)|(^|/)package-lock\.json$|^public/.*\.(png|jpg|jpeg|webp|avif|ico|woff2?)$')
for f in "${files[@]}"; do
  [ -f "$f" ] || continue
  if printf '%s' "$f" | LC_ALL=C grep -q '[^ -~]'; then
    fail "non-ASCII file name: $f"
    continue
  fi
  if LC_ALL=C grep -Iq -P '[^\x00-\x7F]' "$f"; then
    first="$(LC_ALL=C grep -InP '[^\x00-\x7F]' "$f" | head -n 1 | cut -c1-120)"
    fail "non-ASCII text in $f (first hit: $first)"
  fi
done
finish
