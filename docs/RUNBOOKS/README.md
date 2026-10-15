# Runbooks

Operational procedures. Each runbook states the trigger, the steps, who is on call and how to confirm recovery.

| Runbook | Owner STEP | Status |
|---|---|---|
| Backup and restore: `scripts/backup.sh`, `scripts/restore.sh` (encrypted, checksum verified) | 01 | Available below |
| Security incident response (`security-*`) | 04 | Written by STEP 04 |
| Payment processor outage | 10 | Written by STEP 10 |
| Disaster recovery (RTO under 4 hours, RPO under 1 hour) | Release Gate | Written at the Release Gate |

## Backup and restore

1. Set `DATABASE_URL` and `BACKUP_PASSPHRASE` (at least 20 characters, stored in a password manager, different from every other secret).
2. Run `bash scripts/backup.sh`. The encrypted file and its `.sha256` appear in `backups/`.
3. Copy both files to storage outside the production environment.
4. Rehearse restores quarterly: create an empty database, set `TARGET_DATABASE_URL`, run `bash scripts/restore.sh backups/<file> --yes`, then run `bash scripts/run-assertions.sh all`.

## Scheduled jobs

Jobs are defined as `cron/jobs/sNN-*.ts` fragments and called through `/api/cron/<job>` with the `CRON_SECRET`. On Netlify use scheduled functions or Supabase `pg_cron` with `pg_net` to call the route. With Docker use the host scheduler to call the same route.
