#!/usr/bin/env bash
# Dante's Pizza: logical backup of the Postgres database (pg_dump custom format).
#
#   scripts/backup.sh [database_url]
#
# Environment (all optional):
#   DATABASE_URL  connection string (default postgresql://dantes@localhost:5434/dantes; first argument wins)
#   BACKUP_DIR    where dumps go (default <repo>/backups)
#   BACKUP_KEEP   number of newest dumps of this database to keep (default 14; 0 = keep everything)
#   PG_BIN        directory with pg_dump (default: PATH, then /Library/PostgreSQL/18/bin)
#
# Output: <BACKUP_DIR>/<db>_<UTC timestamp>.dump  (mode 600; written to a temp file first, so a failed run never leaves a partial dump)
set -euo pipefail
cd "$(dirname "$0")/.."
[ "${1:-}" ] && export DATABASE_URL=$1
# shellcheck source=scripts/_pg_env.sh
source scripts/_pg_env.sh

BACKUP_DIR=${BACKUP_DIR:-./backups}
KEEP=${BACKUP_KEEP:-14}
[[ "$KEEP" =~ ^[0-9]+$ ]] || { echo "BACKUP_KEEP must be a whole number" >&2; exit 2; }
mkdir -p "$BACKUP_DIR"
umask 077

STAMP=$(date -u +%Y%m%dT%H%M%SZ)
OUT="$BACKUP_DIR/${PG_DB}_${STAMP}.dump"
TMP="$OUT.partial"
trap 'rm -f "$TMP"' EXIT

"$PGBIN/pg_dump" --format=custom --compress=6 --no-owner --no-privileges --dbname "$PG_DB" --file "$TMP"
# Fail loudly if the archive is unreadable (catches truncated or corrupt dumps)
"$PGBIN/pg_restore" --list "$TMP" >/dev/null
mv "$TMP" "$OUT"
trap - EXIT
echo "backup ok: $OUT ($(wc -c <"$OUT" | tr -d ' ') bytes)"

if [ "$KEEP" -gt 0 ]; then
  # Timestamps sort lexically, so the oldest files come first. The pattern is anchored so "dantes" never prunes "dantes_test" dumps.
  ls -1 "$BACKUP_DIR" | grep -E "^${PG_DB}_[0-9]{8}T[0-9]{6}Z\.dump$" | sort \
    | awk -v keep="$KEEP" '{ a[NR] = $0 } END { for (i = 1; i <= NR - keep; i++) print a[i] }' \
    | while IFS= read -r f; do rm -f -- "$BACKUP_DIR/$f" && echo "pruned: $BACKUP_DIR/$f"; done
fi
