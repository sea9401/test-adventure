#!/usr/bin/env bash
# 일일 자동 백업 — EC2 crontab 에서 실행. RDS → 로컬 ~/backups (gzip · N일 로테이션).
#   무결성 검증(gzip 정상 + pg_dump 완결 마커) 실패 시 비정상 종료(exit≠0) →
#   cron 메일/모니터가 잡게 한다. "백업 떴는데 깨진 파일" 이 조용히 쌓이는 걸 방지.
#   BACKUP_S3_URI가 있으면 로컬 검증 후 암호화해 S3에도 복제한다.
#
# 수동 실행:  cd ~/adventure-rpg && bash deploy/backup-db.sh
# 환경변수:   BACKUP_DIR(기본 ~/backups) · BACKUP_KEEP_DAYS(기본 14)
set -eo pipefail
cd "$(dirname "$0")/.."

DBURL=$(grep "^DATABASE_URL=" .env.production.local | cut -d= -f2- | tr -d '"')
if [ -z "$DBURL" ]; then echo "BACKUP FAIL: DATABASE_URL 없음" >&2; exit 1; fi
CA_PATH="${DATABASE_CA_CERT_PATH:-$(grep '^DATABASE_CA_CERT_PATH=' .env.production.local | cut -d= -f2- | tr -d '"' || true)}"
if [ -z "$CA_PATH" ] || [ ! -r "$CA_PATH" ]; then
  echo "BACKUP FAIL: DATABASE_CA_CERT_PATH가 없거나 읽을 수 없음" >&2
  exit 1
fi

DIR="${BACKUP_DIR:-$HOME/backups}"
KEEP_DAYS="${BACKUP_KEEP_DAYS:-14}"
mkdir -p "$DIR"

TS=$(date +%F_%H%M%S)
OUT="$DIR/auto_${TS}.sql.gz"

# 덤프 → gzip. verify-full로 CA 체인과 RDS 호스트명을 모두 검증한다.
# DATABASE_URL에는 sslmode/sslrootcert를 넣지 않는다(연결 문자열이 환경변수보다 우선함).
PGSSLMODE=verify-full PGSSLROOTCERT="$CA_PATH" \
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

S3_URI="${BACKUP_S3_URI:-$(grep '^BACKUP_S3_URI=' .env.production.local | cut -d= -f2- | tr -d '"' || true)}"
if [ -n "$S3_URI" ]; then
  command -v aws >/dev/null 2>&1 || {
    echo "BACKUP FAIL: BACKUP_S3_URI가 있지만 aws CLI가 없음" >&2
    exit 1
  }
  aws s3 cp "$OUT" "${S3_URI%/}/$(basename "$OUT")" --sse AES256 --only-show-errors
  echo "$(date -u +%FT%TZ) OFFSITE BACKUP OK: ${S3_URI%/}/$(basename "$OUT")"
else
  echo "BACKUP WARN: BACKUP_S3_URI 미설정 — 로컬 백업만 생성됨" >&2
fi

# 로테이션: KEEP_DAYS 보다 오래된 자동백업 삭제(수동 prebeta_* 는 보존)
find "$DIR" -maxdepth 1 -name 'auto_*.sql.gz' -mtime "+${KEEP_DAYS}" -print -delete
