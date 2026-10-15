#!/usr/bin/env bash
# path: scripts/deploy.sh
# Usage: scripts/deploy.sh netlify|docker
# Refuses to run on Friday after 15:00 UTC, runs the quick integration check first.
set -euo pipefail
cd "$(dirname "$0")/.."
target="${1:?usage: deploy.sh netlify|docker}"

dow="$(date -u +%u)"
hour="$(date -u +%H)"
if [ "$dow" = "5" ] && [ "$((10#$hour))" -ge 15 ]; then
  echo "Deployments are not allowed on Friday after 15:00 UTC." >&2
  exit 1
fi

bash scripts/integration-check.sh --quick

case "$target" in
  netlify)
    : "${NETLIFY_AUTH_TOKEN:?NETLIFY_AUTH_TOKEN is required}"
    : "${NETLIFY_SITE_ID:?NETLIFY_SITE_ID is required}"
    npx --yes netlify-cli@17 deploy --build --prod --site "$NETLIFY_SITE_ID"
    ;;
  docker)
    [ -f .env.production ] || { echo ".env.production is required" >&2; exit 2; }
    docker compose -f docker/docker-compose.prod.yml up -d --build
    ;;
  *)
    echo "unknown target: $target" >&2
    exit 2
    ;;
esac
