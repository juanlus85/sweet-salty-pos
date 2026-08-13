#!/usr/bin/env bash
set -euo pipefail

: "${DATABASE_URL:?DATABASE_URL is required}"
BACKUP_ROOT="${BACKUP_ROOT:-./backups}"
UPLOADS_DIR="${UPLOADS_DIR:-./uploads}"
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
mkdir -p "$BACKUP_ROOT"

# DATABASE_URL is expected in mysql://user:password@host:port/database form.
url="${DATABASE_URL#mysql://}"
credentials="${url%%@*}"
hostdb="${url#*@}"
user="${credentials%%:*}"
password="${credentials#*:}"
hostport="${hostdb%%/*}"
database="${hostdb#*/}"
host="${hostport%%:*}"
port="${hostport#*:}"
if [[ "$host" == "$port" ]]; then port=3306; fi

MYSQL_PWD="$password" mysqldump --single-transaction --routines --events -h "$host" -P "$port" -u "$user" "$database" | gzip -c > "$BACKUP_ROOT/${database}-${STAMP}.sql.gz"
if [[ -d "$UPLOADS_DIR" ]]; then
  tar -czf "$BACKUP_ROOT/${database}-uploads-${STAMP}.tar.gz" "$UPLOADS_DIR"
fi

# Keep 30 days of local copies; keep older generations off-server as well.
find "$BACKUP_ROOT" -type f -mtime +30 -delete
printf 'Backup created in %s\n' "$BACKUP_ROOT"
