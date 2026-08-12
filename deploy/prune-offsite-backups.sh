#!/usr/bin/env bash
# 새 DB 덤프 전에 S3에 존재하는 자동 백업의 로컬 복제본만 정리한다.
# 수동/스테이징 백업은 auto_*.sql.gz 패턴에 포함되지 않아 건드리지 않는다.
set -euo pipefail

DIR="${BACKUP_DIR:-$HOME/backups}"
S3_URI="${BACKUP_S3_URI:-}"

case "$S3_URI" in
  s3://*) ;;
  *)
    echo "BACKUP PRUNE FAIL: BACKUP_S3_URI must start with s3://" >&2
    exit 2
    ;;
esac

S3_PATH="${S3_URI#s3://}"
case "$S3_PATH" in
  */*)
    BUCKET="${S3_PATH%%/*}"
    PREFIX="${S3_PATH#*/}"
    ;;
  *)
    BUCKET="$S3_PATH"
    PREFIX=""
    ;;
esac
PREFIX="${PREFIX%/}"

if [ -z "$BUCKET" ]; then
  echo "BACKUP PRUNE FAIL: S3 bucket is empty" >&2
  exit 2
fi
command -v aws >/dev/null 2>&1 || {
  echo "BACKUP PRUNE FAIL: aws CLI 없음" >&2
  exit 1
}
[ -d "$DIR" ] || exit 0

verification_failed=0
while IFS= read -r -d '' file; do
  name="${file##*/}"
  if [ -n "$PREFIX" ]; then
    key="$PREFIX/$name"
  else
    key="$name"
  fi
  if aws s3api head-object --bucket "$BUCKET" --key "$key" >/dev/null 2>&1; then
    rm -- "$file"
    echo "BACKUP PRUNE OK: removed S3-verified local copy $file"
  else
    verification_failed=1
    echo "BACKUP PRUNE KEEP: S3 object not verified for $file" >&2
  fi
done < <(find "$DIR" -maxdepth 1 -type f -name 'auto_*.sql.gz' -print0)

if [ "$verification_failed" -ne 0 ]; then
  echo "BACKUP PRUNE FAIL: unverified local automatic backup remains" >&2
  exit 1
fi
