#!/usr/bin/env bash
# Project-local Postgres cluster (port 5434, trust auth, user "dantes").
set -e
cd "$(dirname "$0")/.."
B=${PG_BIN:-/Library/PostgreSQL/18/bin}
case "$1" in
  start) $B/pg_ctl -D .pgdata -o "-p 5434 -k /tmp" -l .pgdata/server.log start ;;
  stop) $B/pg_ctl -D .pgdata stop ;;
  *) echo "usage: db.sh start|stop" ;;
esac
