#!/usr/bin/env bash
# 일일 자동 백업 — EC2 crontab 에서 실행. RDS → 로컬 ~/backups (gzip · N일 로테이션).
#   무결성 검증(gzip 정상 + pg_dump 완결 마커) 실패 시 비정상 종료(exit≠0) →
#   cron 메일/모니터가 잡게 한다. "백업 떴는데 깨진 파일" 이 조용히 쌓이는 걸 방지.
#   S3 업로드는 추후(EC2 에 IAM 역할 부착 후 `aws s3 cp "$OUT" s3://...` 한 줄 추가).
#
# 수동 실행:  cd ~/adventure-rpg && bash deploy/backup-db.sh
# 환경변수:   BACKUP_DIR(기본 ~/backups) · BACKUP_KEEP_DAYS(기본 14)
set -eo pipefail
cd "$(dirname "$0")/.."

DBURL=$(grep "^DATABASE_URL=" .env.production.local | cut -d= -f2- | tr -d '"')
if [ -z "$DBURL" ]; then echo "BACKUP FAIL: DATABASE_URL 없음" >&2; exit 1; fi

DIR="${BACKUP_DIR:-$HOME/backups}"
KEEP_DAYS="${BACKUP_KEEP_DAYS:-14}"
mkdir -p "$DIR"

TS=$(date +%F_%H%M%S)
OUT="$DIR/auto_${TS}.sql.gz"

# 덤프 → gzip (pipefail 이라 pg_dump 실패 시 파이프라인 실패 → set -e 종료)
pg_dump "$DBURL" --no-owner --no-acl | gzip > "$OUT"

# 무결성 1: gzip 정상
if ! gzip -t "$OUT" 2>/dev/null; then
  echo "BACKUP FAIL: gzip 손상 — $OUT" >&2; rm -f "$OUT"; exit 1
fi
# 무결성 2: pg_dump 완결 마커 존재
if ! zcat "$OUT" | tail -8 | grep -q "PostgreSQL database dump complete"; then
  echo "BACKUP FAIL: 덤프 미완결(잘림?) — $OUT" >&2; exit 1
fi

echo "$(date -u +%FT%TZ) BACKUP OK: $OUT ($(du -h "$OUT" | cut -f1))"

# 로테이션: KEEP_DAYS 보다 오래된 자동백업 삭제(수동 prebeta_* 는 보존)
find "$DIR" -maxdepth 1 -name 'auto_*.sql.gz' -mtime "+${KEEP_DAYS}" -print -delete
