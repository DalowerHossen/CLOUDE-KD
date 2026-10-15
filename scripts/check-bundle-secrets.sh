#!/usr/bin/env bash
# path: scripts/check-bundle-secrets.sh
# Client bundle secret-leak scanner. Run after `next build`. Fails when a server-only variable name or value appears in .next/static.
GUARD_NAME=bundle-secrets
source "$(dirname "$0")/lib/common.sh"

if [ ! -d .next/static ]; then
  printf 'no .next/static directory; run "next build" first\n' >&2
  exit 2
fi
names=(SUPABASE_SERVICE_ROLE_KEY ENCRYPTION_KEY HMAC_TOKEN_SECRET AUDIT_SIGNING_KEY CRON_SECRET TURNSTILE_SECRET_KEY SMTP_PASSWORD GOOGLE_OAUTH_CLIENT_SECRET NETWORK_INTEL_API_KEY SENTRY_AUTH_TOKEN)
for n in "${names[@]}"; do
  if grep -rIl --include='*.js' --include='*.map' -e "$n" .next/static >/dev/null 2>&1; then
    fail "server-only variable name $n found in the client bundle"
  fi
  value="${!n:-}"
  if [ -n "$value" ] && [ "${#value}" -ge 12 ]; then
    if grep -rIlF --include='*.js' --include='*.map' -e "$value" .next/static >/dev/null 2>&1; then
      fail "value of $n found in the client bundle"
    fi
  fi
done
finish
