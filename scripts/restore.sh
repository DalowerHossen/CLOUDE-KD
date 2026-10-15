#!/usr/bin/env bash
# path: scripts/restore.sh
# Restores an encrypted backup made by scripts/backup.sh into the database in TARGET_DATABASE_URL.
# Usage: scripts/restore.sh backups/kd-<timestamp>.dump.enc --yes
set -euo pipefail
cd "$(dirname "$0")/.."
file="${1:?backup file required}"
[ "${2:-}" = "--yes" ] || { echo "Restoring overwrites data. Re-run with --yes to confirm." >&2; exit 2; }
: "${TARGET_DATABASE_URL:?TARGET_DATABASE_URL is required}"
: "${BACKUP_PASSPHRASE:?BACKUP_PASSPHRASE is required}"
[ -f "$file" ] || { echo "backup file not found" >&2; exit 2; }
if [ -f "${file}.sha256" ]; then sha256sum --check "${file}.sha256"; fi
openssl enc -d -aes-256-cbc -pbkdf2 -iter 600000 -pass env:BACKUP_PASSPHRASE -in "$file" \
  | pg_restore --clean --if-exists --no-owner --no-privileges --dbname="$TARGET_DATABASE_URL"
echo "restore finished"
