#!/usr/bin/env bash
# path: scripts/verify/step01-guards.sh
# Proves that each guard script passes on a clean tree and fails on a seeded violation.
# Works in a temporary git repository, never in the real tree.
set -uo pipefail
real_root="$(cd "$(dirname "$0")/../.." && pwd)"
tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT
mkdir -p "$tmp/scripts" "$tmp/config" "$tmp/lib" "$tmp/components/payment" "$tmp/app/(dashboard)/dashboard" "$tmp/migrations"
cp -r "$real_root/scripts/." "$tmp/scripts/"
cp "$real_root/config/ownership.json" "$tmp/config/"
cp "$real_root/.gitignore" "$tmp/"
git -C "$tmp" init -q
export GUARD_ROOT="$tmp"
pass=0
bad=0

run_guard() { # run_guard <command...>  -> exit code
  "$@" > /dev/null 2>&1
}
expect_pass() {
  if run_guard "${@:2}"; then pass=$((pass + 1)); printf 'ok    %s\n' "$1"; else bad=$((bad + 1)); printf 'FAIL  %s (expected pass)\n' "$1"; fi
}
expect_fail() {
  if run_guard "${@:2}"; then bad=$((bad + 1)); printf 'FAIL  %s (expected failure)\n' "$1"; else pass=$((pass + 1)); printf 'ok    %s\n' "$1"; fi
}

for g in english-only no-tests no-todo no-coming-soon path-comment no-any no-console no-pan no-brand-names money secrets; do
  expect_pass "clean tree: check-$g" bash "$tmp/scripts/check-$g.sh"
done
expect_pass "clean tree: check-migrations" node "$tmp/scripts/check-migrations.mjs"
expect_pass "clean tree: check-dead-links" node "$tmp/scripts/check-dead-links.mjs"

seed() { # seed <path> <content>
  mkdir -p "$(dirname "$tmp/$1")"
  printf '%b' "$2" > "$tmp/$1"
}
unseed() { rm -f "$tmp/$1"; }

seed lib/accent.ts '// path: lib/accent.ts\nexport const a = "caf\xc3\xa9";\n'
expect_fail "english-only detects non-ASCII" bash "$tmp/scripts/check-english-only.sh"; unseed lib/accent.ts

seed lib/a.test.ts '// path: lib/a.test.ts\nexport const a = 1;\n'
expect_fail "no-tests detects a test file" bash "$tmp/scripts/check-no-tests.sh"; unseed lib/a.test.ts

marker="TO""DO"
seed lib/mark.ts "// path: lib/mark.ts\n// $marker finish this\nexport const a = 1;\n"
expect_fail "no-todo detects a marker" bash "$tmp/scripts/check-no-todo.sh"; unseed lib/mark.ts

phrase="Coming ""Soon"
seed lib/soon.ts "// path: lib/soon.ts\nexport const a = '$phrase';\n"
expect_fail "no-coming-soon detects the phrase" bash "$tmp/scripts/check-no-coming-soon.sh"; unseed lib/soon.ts

seed lib/nopath.ts 'export const a = 1;\n'
expect_fail "path-comment detects a missing comment" bash "$tmp/scripts/check-path-comment.sh"; unseed lib/nopath.ts

seed lib/anyt.ts '// path: lib/anyt.ts\nexport const a: any = 1;\n'
expect_fail "no-any detects any" bash "$tmp/scripts/check-no-any.sh"; unseed lib/anyt.ts

seed lib/con.ts '// path: lib/con.ts\nconsole.log("x");\n'
expect_fail "no-console detects console" bash "$tmp/scripts/check-no-console.sh"; unseed lib/con.ts

seed components/payment/form.tsx '// path: components/payment/form.tsx\nexport const cardNumber = "";\n'
expect_fail "no-pan detects card fields" bash "$tmp/scripts/check-no-pan.sh"; unseed components/payment/form.tsx
seed components/payment/keys.tsx '// path: components/payment/keys.tsx\nexport const x = { onKeyDown: () => undefined };\n'
expect_fail "no-pan detects key tracking" bash "$tmp/scripts/check-no-pan.sh"; unseed components/payment/keys.tsx

brand="bk""ash"
seed lib/brand.ts "// path: lib/brand.ts\nexport const a = '$brand';\n"
expect_fail "no-brand-names detects a brand" bash "$tmp/scripts/check-no-brand-names.sh"; unseed lib/brand.ts

seed lib/invoice-total.ts '// path: lib/invoice-total.ts\nexport const a = parseFloat("1.5");\n'
expect_fail "money detects parseFloat" bash "$tmp/scripts/check-money.sh"; unseed lib/invoice-total.ts

key="AKIA""ABCDEFGHIJKLMNOP"
seed lib/leak.ts "// path: lib/leak.ts\nexport const a = '$key';\n"
expect_fail "secrets detects a key" bash "$tmp/scripts/check-secrets.sh"; unseed lib/leak.ts

# migrations
seed migrations/S99_001_bad.sql '-- path: migrations/S99_001_bad.sql\ncreate table if not exists demo_items (\n  id uuid primary key,\n  amount numeric(10,2)\n);\n'
seed migrations/S99_001_bad_down.sql '-- path: migrations/S99_001_bad_down.sql\ndrop table if exists demo_items;\n'
expect_fail "migrations detects a bad table" node "$tmp/scripts/check-migrations.mjs"
rm -f "$tmp"/migrations/*
seed migrations/S99_001_good.sql '-- path: migrations/S99_001_good.sql\ncreate table if not exists demo_items (\n  id uuid primary key default uuid_generate_v7(),\n  company_id uuid null,\n  amount numeric(18,4) not null,\n  created_at timestamptz not null default now(),\n  updated_at timestamptz not null default now(),\n  deleted_at timestamptz null,\n  version integer not null default 0\n);\nselect rls_enable_default_deny(\x27demo_items\x27);\n'
seed migrations/S99_001_good_down.sql '-- path: migrations/S99_001_good_down.sql\ndrop table if exists demo_items;\n'
expect_pass "migrations accepts a good table" node "$tmp/scripts/check-migrations.mjs"
seed migrations/S99_002_nodown.sql '-- path: migrations/S99_002_nodown.sql\nselect 1;\n'
expect_fail "migrations detects a missing rollback" node "$tmp/scripts/check-migrations.mjs"
rm -f "$tmp"/migrations/*

# ownership
own() { printf '%s\n' "$2" | node "$tmp/scripts/check-ownership.mjs" "$1" --files; }
expect_pass "ownership: step 11 owns the stripe adapter" own 11 "lib/payment/adapters/stripe.ts"
expect_fail "ownership: step 5 does not own the stripe adapter" own 5 "lib/payment/adapters/stripe.ts"
expect_pass "ownership: step 1 owns route-group layouts" own 1 "app/(public)/layout.tsx"
expect_fail "ownership: step 6 does not own route-group layouts" own 6 "app/(public)/layout.tsx"
expect_pass "ownership: step 6 owns public pages" own 6 "app/(public)/pricing/page.tsx"
expect_pass "ownership: step 15 owns the employee portal" own 15 "app/(client-portal)/p/[token]/page.tsx"
expect_fail "ownership: step 13 does not own the employee portal" own 13 "app/(client-portal)/p/[token]/page.tsx"
expect_pass "ownership: step 3 owns its migrations" own 3 "migrations/S03_001_auth.sql"
expect_fail "ownership: package.json is not a step file" own 9 "package.json"
expect_pass "ownership: anyone may add .gitkeep" own 9 "lib/supabase/.gitkeep"
expect_pass "ownership: fragments belong to their step" own 9 "config/nav/s09.ts"
expect_fail "ownership: foreign fragments are refused" own 9 "config/nav/s08.ts"

# dead links
seed config/nav/s99.ts '// path: config/nav/s99.ts\nexport const nav = [{ label: "x", href: "/missing-page" }];\n'
expect_fail "dead-links detects a missing page" node "$tmp/scripts/check-dead-links.mjs"
seed 'app/(dashboard)/missing-page/page.tsx' '// path: app/(dashboard)/missing-page/page.tsx\nexport default function Page() { return null; }\n'
expect_pass "dead-links accepts an existing page" node "$tmp/scripts/check-dead-links.mjs"
rm -rf "$tmp/config/nav" "$tmp/app"

# commit messages
msg() { printf '%s\n' "$1" > "$tmp/msg"; bash "$tmp/scripts/check-commit-msg.sh" "$tmp/msg"; }
expect_pass "commit-msg accepts conventional commits" msg "feat(step01): 01.1 scaffold"
expect_fail "commit-msg rejects free text" msg "updated stuff"
expect_fail "commit-msg rejects the test type" msg "test: add cases"

printf '\nguards verified: %d passed, %d failed\n' "$pass" "$bad"
[ "$bad" -eq 0 ]
