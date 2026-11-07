# Backup and restore runbook

What is protected: the Postgres database (orders, payments, customers, catalogue, settings, audit log). **Not** protected by `pg_dump`: uploaded product images in `apps/api/uploads/` (back that directory up too, or move uploads to object storage) and the environment secrets (keep them in your secret manager).

Backups contain customer phone numbers, emails and password hashes. Treat them as sensitive: keep them out of git (see "Git" below), restrict access, and encrypt them when they leave the machine.

## Scripts

| Script | Purpose |
| --- | --- |
| `scripts/backup.sh [database_url]` | `pg_dump` in custom format (compressed, `--no-owner --no-privileges`), written to a temp file, validated with `pg_restore --list`, then moved to `backups/<db>_<UTC timestamp>.dump` with mode 600. Prunes to the newest `BACKUP_KEEP` dumps of that database. |
| `scripts/restore.sh <file> [target_db]` | Validates the archive, drops and recreates `target_db` (default: the database in `DATABASE_URL`) and runs `pg_restore`. Refuses to replace an existing database unless you type its name or set `FORCE=1`. |

Environment (both scripts): `DATABASE_URL` (default `postgresql://dantes@localhost:5434/dantes`; the host, port, user and password are taken from it), `PG_BIN` (directory with the Postgres binaries; default is `PATH`, then `/Library/PostgreSQL/18/bin`). Backup only: `BACKUP_DIR` (default `./backups`), `BACKUP_KEEP` (default `14`, `0` keeps everything).

Local database for development: `bash scripts/db.sh start`.

### Git

`backups/` is **not yet in `.gitignore`**. Add `backups/` before running the script inside the repository, or point `BACKUP_DIR` outside the repo (for example `~/dantes-backups`).

## Take a backup

```bash
# development database
DATABASE_URL=postgresql://dantes@localhost:5434/dantes BACKUP_KEEP=14 bash scripts/backup.sh

# production (credentials via the URL; use a read-only backup role if you have one)
DATABASE_URL='postgresql://backup_user:***@db.internal:5432/dantes?sslmode=require' BACKUP_DIR=/var/backups/dantes bash scripts/backup.sh
```

The script exits non-zero on any failure, so cron mail, launchd logs or a CI job will show it.

## Restore

Always rehearse into a scratch database first, then compare row counts:

```bash
bash scripts/restore.sh backups/dantes_20261107T020000Z.dump dantes_restore_check

psql -d dantes_restore_check -Atc "select 'Order', count(*) from \"Order\" union all select 'Payment', count(*) from \"Payment\" union all select 'User', count(*) from \"User\""
# compare with the same query on the live database, then:
dropdb dantes_restore_check
```

Restoring over the real database (disaster recovery):

1. Stop the API (or put the site in maintenance) so nothing writes while you restore.
2. `FORCE=1 bash scripts/restore.sh backups/<file>.dump dantes` (without `FORCE=1` it asks you to type the database name).
3. Start the API and check `GET /api/v1/health/ready` returns `{"status":"ready"}`.
4. Place a test order in the staging storefront, or open the admin and check the latest orders.

Schema compatibility: restore with the same or a newer Postgres major version than the one that took the dump, and run `pnpm --filter @dantes/api exec prisma migrate deploy` afterwards if the code is newer than the dump. The `_prisma_migrations` table is part of the dump, so migration history is preserved.

## Round trip verified (Sprint 10)

`dantes_test` was seeded and dumped with `backup.sh`, restored into the scratch database `dantes_restore_check` with `restore.sh`, and the row count of all 29 tables (including `_prisma_migrations`) and the 50 indexes matched exactly. The scratch database was dropped afterwards. Restoring onto an existing database without `FORCE=1` in a non-interactive shell refuses with exit code 1. Retention (`BACKUP_KEEP=2` with three dumps) pruned only the oldest dump.

## Schedule it

Pick a quiet hour (Nairobi 03:00 is outside opening hours) and keep at least 14 dailies plus offsite copies.

### cron (Linux, or macOS with cron access)

```cron
# m h dom mon dow
0 3 * * * cd /srv/dantespizza && DATABASE_URL='postgresql://backup_user:***@localhost:5432/dantes' BACKUP_DIR=/var/backups/dantes BACKUP_KEEP=14 bash scripts/backup.sh >> /var/log/dantes-backup.log 2>&1
```

Pass the password through `~/.pgpass` (mode 600) instead of the URL where you can.

### launchd (macOS)

`~/Library/LaunchAgents/ke.dantespizza.backup.plist`:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>Label</key><string>ke.dantespizza.backup</string>
  <key>ProgramArguments</key>
  <array><string>/bin/bash</string><string>/Users/you/Desktop/Dantespizza/scripts/backup.sh</string></array>
  <key>EnvironmentVariables</key>
  <dict>
    <key>DATABASE_URL</key><string>postgresql://dantes@localhost:5434/dantes</string>
    <key>BACKUP_DIR</key><string>/Users/you/dantes-backups</string>
    <key>BACKUP_KEEP</key><string>14</string>
  </dict>
  <key>StartCalendarInterval</key><dict><key>Hour</key><integer>3</integer><key>Minute</key><integer>0</integer></dict>
  <key>StandardOutPath</key><string>/Users/you/dantes-backups/backup.log</string>
  <key>StandardErrorPath</key><string>/Users/you/dantes-backups/backup.log</string>
</dict></plist>
```

Load it with `launchctl load ~/Library/LaunchAgents/ke.dantespizza.backup.plist`. The Mac must be awake at that time (launchd runs a missed job when the machine wakes).

### Offsite copy

A backup on the same disk as the database is not a backup. After each run copy the newest file offsite, encrypted, for example `age -r <public-key> -o file.dump.age file.dump && rclone copy file.dump.age remote:dantes-backups/`. Test restoring from the offsite copy at least once a quarter.

## Production note: use managed Postgres with point-in-time recovery

For production run Postgres on a managed service (Neon, Supabase, RDS, Cloud SQL, etc.) and enable **point-in-time recovery (PITR)** and automated daily snapshots. PITR lets you rewind to any second (for example to just before a bad deploy or an accidental delete), which a nightly dump cannot. Keep these scripts as the portable, provider-independent second layer: a nightly logical dump to separate storage protects against provider account loss and lets you move providers. Targets to aim for: recovery point objective of 5 minutes (PITR) and 24 hours (logical dumps); recovery time objective of 1 hour. Run a restore drill after every major schema change and at least quarterly.
