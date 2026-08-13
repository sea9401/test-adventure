#!/usr/bin/env bash
# 운영 DB를 건드리지 않고 최신 pg_dump를 임시 데이터베이스에 복원해 실제 복구 가능성을
# 검증한다. 임시 DB는 성공·실패와 관계없이 EXIT trap에서 제거한다.
set -euo pipefail

cd "$(dirname "$0")/.."

ENV_PATH="${PRODUCTION_ENV_PATH:-/run/adventure-rpg/production.env}"
BACKUP_DIR="${BACKUP_DIR:-$HOME/backups}"

read_env_value() {
  local key="$1"
  [ -f "$ENV_PATH" ] || return 0
  grep -E "^${key}=" "$ENV_PATH" | tail -1 | cut -d= -f2- | \
    sed -e 's/^"//' -e 's/"$//' || true
}

DATABASE_URL="${RESTORE_TEST_DATABASE_URL:-${DATABASE_URL:-$(read_env_value DATABASE_URL)}}"
if [ -z "$DATABASE_URL" ]; then
  echo "RESTORE VERIFY FAIL: DATABASE_URL 없음" >&2
  exit 2
fi

BACKUP_PATH="${RESTORE_TEST_BACKUP_PATH:-}"
if [ -z "$BACKUP_PATH" ]; then
  BACKUP_PATH="$(find "$BACKUP_DIR" -maxdepth 1 -type f \
    \( -name 'auto_*.sql.gz' -o -name 'auto_*.sql' \) \
    -printf '%T@ %p\n' 2>/dev/null | sort -nr | head -1 | cut -d' ' -f2-)"
fi
if [ -z "$BACKUP_PATH" ] || [ ! -f "$BACKUP_PATH" ]; then
  echo "RESTORE VERIFY FAIL: 검증할 자동백업 파일 없음" >&2
  exit 2
fi

for command_name in node createdb dropdb psql; do
  if ! command -v "$command_name" >/dev/null 2>&1; then
    echo "RESTORE VERIFY FAIL: 필수 명령 없음 ($command_name)" >&2
    exit 2
  fi
done

if [[ "$BACKUP_PATH" == *.gz ]]; then
  if ! command -v gunzip >/dev/null 2>&1; then
    echo "RESTORE VERIFY FAIL: 필수 명령 없음 (gunzip)" >&2
    exit 2
  fi
  if ! gunzip -t "$BACKUP_PATH"; then
    echo "RESTORE VERIFY FAIL: gzip 무결성 검사 실패" >&2
    exit 1
  fi
fi

RESTORE_DB="${RESTORE_TEST_DATABASE_NAME:-restore_verify_$(date -u +%Y%m%d_%H%M%S)_$$}"
if [[ ! "$RESTORE_DB" =~ ^restore_verify_[A-Za-z0-9_]+$ ]]; then
  echo "RESTORE VERIFY FAIL: 안전하지 않은 임시 DB 이름" >&2
  exit 2
fi

TARGET_URL="$(node -e '
  const url = new URL(process.argv[1]);
  url.pathname = `/${encodeURIComponent(process.argv[2])}`;
  process.stdout.write(url.toString());
' "$DATABASE_URL" "$RESTORE_DB")"

CREATED=0
cleanup() {
  local status=$?
  trap - EXIT
  if [ "$CREATED" -eq 1 ]; then
    if ! dropdb --if-exists --force --maintenance-db="$DATABASE_URL" "$RESTORE_DB"; then
      echo "RESTORE VERIFY WARN: 임시 DB 자동 제거 실패 ($RESTORE_DB)" >&2
      [ "$status" -ne 0 ] || status=1
    fi
  fi
  exit "$status"
}
trap cleanup EXIT

createdb --maintenance-db="$DATABASE_URL" "$RESTORE_DB"
CREATED=1

if [[ "$BACKUP_PATH" == *.gz ]]; then
  gunzip -c "$BACKUP_PATH" | \
    psql "$TARGET_URL" --no-psqlrc --set=ON_ERROR_STOP=on --single-transaction
else
  psql "$TARGET_URL" --no-psqlrc --set=ON_ERROR_STOP=on --single-transaction \
    < "$BACKUP_PATH"
fi

VALIDATION_SQL="
SELECT
  (SELECT count(*) FROM pg_tables WHERE schemaname = 'public')::text
  || '|' || (to_regclass('public.users') IS NOT NULL)::int::text
  || '|' || (to_regclass('drizzle.__drizzle_migrations') IS NOT NULL)::int::text;
"
VALIDATION_RESULT="$(psql "$TARGET_URL" --no-psqlrc --set=ON_ERROR_STOP=on \
  --tuples-only --no-align --command "$VALIDATION_SQL" | tr -d '[:space:]')"
IFS='|' read -r TABLE_COUNT USERS_PRESENT MIGRATIONS_PRESENT <<< "$VALIDATION_RESULT"

if [[ ! "${TABLE_COUNT:-}" =~ ^[0-9]+$ ]] || \
  [ "$TABLE_COUNT" -lt 1 ] || \
  [ "${USERS_PRESENT:-0}" != "1" ] || \
  [ "${MIGRATIONS_PRESENT:-0}" != "1" ]; then
  echo "RESTORE VERIFY FAIL: 복원 스키마 검증 실패 (tables=${TABLE_COUNT:-invalid}, users=${USERS_PRESENT:-0}, migrations=${MIGRATIONS_PRESENT:-0})" >&2
  exit 1
fi

if ! dropdb --if-exists --force --maintenance-db="$DATABASE_URL" "$RESTORE_DB"; then
  echo "RESTORE VERIFY WARN: 임시 DB 자동 제거 실패 ($RESTORE_DB)" >&2
  exit 1
fi
CREATED=0

printf 'RESTORE VERIFY OK: backup=%s tables=%s temporary_database_removed=yes\n' \
  "$(basename "$BACKUP_PATH")" "$TABLE_COUNT"
