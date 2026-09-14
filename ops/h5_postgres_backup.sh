#!/usr/bin/env bash
set -euo pipefail

backup_dir="/www/backup/postgres"
password_file="/root/h5_vote_pg_password"
database="h5_vote"
username="h5_vote_user"
host="127.0.0.1"
port="5432"
date_tag="$(date +%F)"
target_file="${backup_dir}/postgres_${date_tag}.sql"
tmp_file="${backup_dir}/.postgres_${date_tag}.$$.tmp"

umask 077
mkdir -p "$backup_dir"

if [[ ! -s "$password_file" ]]; then
  echo "[$(date '+%F %T')] missing PostgreSQL password file: $password_file" >&2
  exit 1
fi

if [[ -e "$target_file" ]]; then
  echo "[$(date '+%F %T')] backup already exists, keeping existing file: $target_file"
  exit 0
fi

cleanup() {
  rm -f "$tmp_file"
}
trap cleanup EXIT

export PGPASSWORD
PGPASSWORD="$(<"$password_file")"

echo "[$(date '+%F %T')] starting pg_dump: $database -> $target_file"
nice -n 10 ionice -c2 -n7 pg_dump \
  --host="$host" \
  --port="$port" \
  --username="$username" \
  --dbname="$database" \
  --format=plain \
  --no-owner \
  --no-privileges \
  --file="$tmp_file"

mv "$tmp_file" "$target_file"
chmod 600 "$target_file"
echo "[$(date '+%F %T')] backup completed: $target_file"
