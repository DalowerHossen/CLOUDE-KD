#!/usr/bin/env bash
# path: scripts/backup.sh
# Encrypted PostgreSQL backup.  Needs DATABASE_URL and BACKUP_PASSPHRASE (at least 20 characters).
# Output: backups/kd-<UTC timestamp>.dump.enc plus a .sha256 checksum file.
set -euo pipefail
cd "$(dirname "$0")/.."
: "${DATABASE_URL:?DATABASE_URL is required}"
: "${BACKUP_PASSPHRASE:?BACKUP_PASSPHRASE is required}"
[ "${#BACKUP_PASSPHRASE}" -ge 20 ] || { echo "BACKUP_PASSPHRASE must have at least 20 characters" >&2; exit 2; }
command -v pg_dump >/dev/null 2>&1 || { echo "pg_dump is required" >&2; exit 2; }
mkdir -p backups
stamp="$(date -u +%Y%m%dT%H%M%SZ)"
out="backups/kd-${stamp}.dump.enc"
pg_dump --format=custom --no-owner --no-privileges "$DATABASE_URL" \
  | openssl enc -aes-256-cbc -pbkdf2 -iter 600000 -salt -pass env:BACKUP_PASSPHRASE -out "$out"
sha256sum "$out" > "${out}.sha256"
echo "backup written: $out"
