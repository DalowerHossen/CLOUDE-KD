#!/usr/bin/env bash
# path: scripts/check-path-comment.sh
# Rule 8: every source file starts with its path as a comment.
GUARD_NAME=path-comment
source "$(dirname "$0")/lib/common.sh"

while IFS= read -r f; do
  [ -f "$f" ] || continue
  case "$f" in
    next-env.d.ts|docs/*|node_modules/*) continue ;;
    *.ts|*.tsx|*.js|*.mjs|*.cjs)
      first="$(head -n 1 "$f")"
      [ "$first" = "// path: $f" ] || fail "$f must start with: // path: $f"
      ;;
    *.sql)
      first="$(head -n 1 "$f")"
      [ "$first" = "-- path: $f" ] || fail "$f must start with: -- path: $f"
      ;;
    *.css)
      first="$(head -n 1 "$f")"
      [ "$first" = "/* path: $f */" ] || fail "$f must start with: /* path: $f */"
      ;;
    *.sh)
      first="$(head -n 1 "$f")"
      second="$(sed -n '2p' "$f")"
      if [ "${first#\#!}" != "$first" ]; then
        [ "$second" = "# path: $f" ] || fail "$f must have '# path: $f' on line 2"
      else
        [ "$first" = "# path: $f" ] || fail "$f must start with: # path: $f"
      fi
      ;;
  esac
done < <(all_files)
finish
