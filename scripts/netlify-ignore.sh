#!/usr/bin/env bash
# path: scripts/netlify-ignore.sh
# Netlify runs this before a build (`ignore` in netlify.toml): exit code 1 means "build", exit code 0 means "skip this build".
# Only the production branch is built. Pull request previews and other branch deploys are skipped: every build uses up the plan's
# allowance, and the site answered 503 "usage_exceeded" after many previews. The checks of a pull request run in GitHub Actions.
set -u
if [ "${CONTEXT:-production}" = "production" ]; then
  exit 1
fi
printf 'Skipping the %s build: only production is built.\n' "${CONTEXT:-unknown}"
exit 0
