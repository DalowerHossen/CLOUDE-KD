#!/usr/bin/env bash
# path: scripts/check-secrets.sh
# Secret scan. Uses gitleaks when installed; always runs the built-in pattern scan.
GUARD_NAME=secrets
source "$(dirname "$0")/lib/common.sh"

if command -v gitleaks >/dev/null 2>&1 && [ -z "${GUARD_ROOT:-}" ]; then
  if ! gitleaks detect --no-banner --redact --config .gitleaks.toml >/dev/null 2>&1; then
    fail "gitleaks reported findings (run: gitleaks detect --config .gitleaks.toml)"
  fi
fi

patterns=(
  'AKIA[0-9A-Z]{16}'
  '-----BEGIN (RSA |EC |OPENSSH |DSA )?PRIVATE KEY-----'
  'sk_live_[0-9A-Za-z]{16,}'
  'rk_live_[0-9A-Za-z]{16,}'
  'xox[baprs]-[0-9A-Za-z-]{10,}'
  'ghp_[0-9A-Za-z]{30,}'
  'AIza[0-9A-Za-z_-]{35}'
  'eyJ[A-Za-z0-9_-]{20,}\.eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}'
  '(SERVICE_ROLE_KEY|ENCRYPTION_KEY|HMAC_TOKEN_SECRET|AUDIT_SIGNING_KEY|CRON_SECRET|SMTP_PASSWORD)[[:space:]]*=[[:space:]]*[A-Za-z0-9+/=_-]{16,}'
)
while IFS= read -r f; do
  [ -f "$f" ] || continue
  case "$f" in .env.example|docs/*|package-lock.json) continue ;; esac
  for p in "${patterns[@]}"; do
    if grep -IqE "$p" "$f"; then
      fail "possible secret in $f (pattern: ${p:0:30})"
    fi
  done
done < <(all_files)
finish
