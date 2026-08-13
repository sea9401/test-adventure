#!/usr/bin/env bash
# 일일 DB 백업을 실행하고 결과를 로그에 남긴다. 실패는 운영 webhook으로 알리되
# backup-db.sh의 원래 종료 코드를 보존한다.
set -uo pipefail

cd "$(dirname "$0")/.."

ENV_PATH="${PRODUCTION_ENV_PATH:-/run/adventure-rpg/production.env}"
BACKUP_SCRIPT="${BACKUP_SCRIPT_PATH:-deploy/backup-db.sh}"
LOG_PATH="${BACKUP_LOG_PATH:-$HOME/backups/backup.log}"

mkdir -p "$(dirname "$LOG_PATH")" || exit 1

bash "$BACKUP_SCRIPT" >> "$LOG_PATH" 2>&1
BACKUP_STATUS=$?
if [ "$BACKUP_STATUS" -eq 0 ]; then
  if ! node scripts/ops-heartbeat.mjs record "backup:database" >> "$LOG_PATH" 2>&1; then
    echo "BACKUP WARN: 성공 heartbeat 기록 실패" | tee -a "$LOG_PATH" >&2
  fi
  exit 0
fi

MESSAGE="🚨 데이터베이스 백업 실패
운영 DB 자동 백업을 완료하지 못했습니다.

- 종료 코드: $BACKUP_STATUS
- 로그: $LOG_PATH

확인할 일
백업 로그와 S3 접근 상태, EC2 디스크 여유 공간을 확인하세요."
printf '%s %s\n' "$(date -u +%FT%TZ)" "$MESSAGE" | tee -a "$LOG_PATH" >&2

read_env_value() {
  local key="$1"
  [ -f "$ENV_PATH" ] || return 0
  grep -E "^${key}=" "$ENV_PATH" | tail -1 | cut -d= -f2- | \
    sed -e 's/^"//' -e 's/"$//' || true
}

WEBHOOK_URL="${OPS_ALERT_WEBHOOK_URL:-$(read_env_value OPS_ALERT_WEBHOOK_URL)}"
if [ -z "$WEBHOOK_URL" ]; then
  echo "BACKUP ALERT WARN: OPS_ALERT_WEBHOOK_URL 미설정 — 로그에만 기록합니다" | \
    tee -a "$LOG_PATH" >&2
  exit "$BACKUP_STATUS"
fi

if ! PAYLOAD="$(node -e '
  const [message, rawStatus] = process.argv.slice(1);
  const exitStatus = Number(rawStatus);
  process.stdout.write(JSON.stringify({
    text: message,
    content: message,
    detail: { source: "db-backup", exitStatus },
    at: new Date().toISOString(),
  }));
' "$MESSAGE" "$BACKUP_STATUS")"; then
  echo "BACKUP ALERT WARN: 운영 알림 payload 생성 실패" | \
    tee -a "$LOG_PATH" >&2
  exit "$BACKUP_STATUS"
fi

if ! curl -fsS --max-time 10 -X POST \
  -H 'Content-Type: application/json' --data "$PAYLOAD" "$WEBHOOK_URL" \
  >/dev/null; then
  echo "BACKUP ALERT WARN: 운영 webhook 전송 실패" | \
    tee -a "$LOG_PATH" >&2
fi

exit "$BACKUP_STATUS"
