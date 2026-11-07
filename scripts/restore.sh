#!/usr/bin/env bash
# Dante's Pizza: restore a dump made by scripts/backup.sh.
#
#   scripts/restore.sh <dump-file> [target_db]
#
# target_db defaults to the database named in DATABASE_URL. If the target already exists it is DROPPED and recreated,
# so you must confirm: type the database name when prompted, or set FORCE=1 for unattended runs.
# Tip: restore into a scratch database first (e.g. dantes_restore_check) and compare row counts before touching production.
#
# Environment: DATABASE_URL (server/credentials; default postgresql://dantes@localhost:5434/dantes), PG_BIN, FORCE
set -euo pipefail
cd "$(dirname "$0")/.."
FILE=${1:-}
[ -n "$FILE" ] && [ -f "$FILE" ] || { echo "usage: scripts/restore.sh <dump-file> [target_db]" >&2; exit 2; }
# shellcheck source=scripts/_pg_env.sh
source scripts/_pg_env.sh
TARGET=${2:-$PG_DB}
[[ "$TARGET" =~ ^[A-Za-z0-9_]+$ ]] || { echo "target database name may only contain letters, digits and underscores" >&2; exit 2; }

"$PGBIN/pg_restore" --list "$FILE" >/dev/null || { echo "not a readable pg_dump custom-format archive: $FILE" >&2; exit 1; }

EXISTS=$("$PGBIN/psql" -d postgres -Atc "SELECT 1 FROM pg_database WHERE datname = '$TARGET'")
if [ "$EXISTS" = 1 ]; then
  if [ "${FORCE:-}" != 1 ]; then
    [ -t 0 ] || { echo "database $TARGET exists; set FORCE=1 to replace it" >&2; exit 1; }
    read -r -p "Database '$TARGET' on $PGHOST:$PGPORT will be DROPPED and replaced. Type its name to continue: " answer
    [ "$answer" = "$TARGET" ] || { echo "aborted" >&2; exit 1; }
  fi
  "$PGBIN/psql" -d postgres -q -c "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = '$TARGET' AND pid <> pg_backend_pid()" >/dev/null
  "$PGBIN/dropdb" "$TARGET"
fi
"$PGBIN/createdb" "$TARGET"
"$PGBIN/pg_restore" --no-owner --no-privileges --exit-on-error --dbname "$TARGET" "$FILE"
echo "restore ok: $FILE -> $TARGET"
