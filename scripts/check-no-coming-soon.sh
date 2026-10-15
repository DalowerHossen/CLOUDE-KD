#!/usr/bin/env bash
# path: scripts/check-no-coming-soon.sh
# Rule 5: no filler or unfinished-feature wording in code.
GUARD_NAME=no-coming-soon
source "$(dirname "$0")/lib/common.sh"

p1="coming ""soon"
p2="lorem ""ipsum"
p3="not yet ""implemented"
p4="to be ""implemented"
p5="under ""construction"
pattern="(${p1}|${p2}|${p3}|${p4}|${p5})"
while IFS= read -r f; do
  [ -f "$f" ] || continue
  if grep -IniE "$pattern" "$f" > /tmp/guard-cs.$$ 2>/dev/null; then
    fail "placeholder wording in $f: $(head -n 1 /tmp/guard-cs.$$ | cut -c1-100)"
  fi
done < <(files_matching "($CODE_DIRS_REGEX|^scripts/)" | grep -vE '\.(png|jpg|jpeg|webp|avif|ico|woff2?)$')
rm -f /tmp/guard-cs.$$
finish
