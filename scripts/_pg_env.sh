# Sourced by backup.sh / restore.sh: derives libpq settings from DATABASE_URL (or sane local defaults).
# Usage: source _pg_env.sh   ->  exports PGHOST PGPORT PGUSER [PGPASSWORD] and sets PG_DB, PGBIN
PGBIN=${PG_BIN:-}
if [ -z "$PGBIN" ]; then
  if command -v pg_dump >/dev/null 2>&1; then PGBIN=$(dirname "$(command -v pg_dump)"); else PGBIN=/Library/PostgreSQL/18/bin; fi
fi
URL=${DATABASE_URL:-postgresql://dantes@localhost:5434/dantes}
URL=${URL%%\?*}
if [[ "$URL" =~ ^postgres(ql)?://([^:@/]+)(:([^@]*))?@([^:/]+)(:([0-9]+))?/([^/]+)$ ]]; then
  export PGUSER=${BASH_REMATCH[2]} PGHOST=${BASH_REMATCH[5]} PGPORT=${BASH_REMATCH[7]:-5432}
  [ -n "${BASH_REMATCH[4]}" ] && export PGPASSWORD=${BASH_REMATCH[4]}
  PG_DB=${BASH_REMATCH[8]}
else
  echo "Cannot parse DATABASE_URL (expected postgresql://user[:password]@host[:port]/db)" >&2
  exit 2
fi
