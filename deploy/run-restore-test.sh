#!/usr/bin/env bash
# 주기 복원 검증 wrapper. 검증 스크립트의 종료 코드를 보존하고 실패만 운영 webhook으로
# 알린다. 실제 timer 설치·활성화는 운영 승인 뒤 별도로 수행한다.
set -uo pipefail

cd "$(dirname "$0")/.."

ENV_PATH="${PRODUCTION_ENV_PATH:-/run/adventure-rpg/production.env}"
VERIFY_SCRIPT="${RESTORE_VERIFY_SCRIPT_PATH:-deploy/verify-backup-restore.sh}"
LOG_PATH="${RESTORE_TEST_LOG_PATH:-$HOME/backups/restore-test.log}"

mkdir -p "$(dirname "$LOG_PATH")" || exit 1
bash "$VERIFY_SCRIPT" >> "$LOG_PATH" 2>&1
VERIFY_STATUS=$?
if [ "$VERIFY_STATUS" -eq 0 ]; then
  exit 0
fi

MESSAGE="🚨 데이터베이스 백업 복원 검증 실패
최신 자동백업을 임시 DB에 복원하거나 핵심 스키마를 확인하지 못했습니다.

- 종료 코드: $VERIFY_STATUS
- 로그: $LOG_PATH

확인할 일
복원 검증 로그, 최신 백업 무결성, RDS 용량과 DB 생성 권한을 확인하세요."
printf '%s %s\n' "$(date -u +%FT%TZ)" "$MESSAGE" | tee -a "$LOG_PATH" >&2

read_env_value() {
  local key="$1"
  [ -f "$ENV_PATH" ] || return 0
  grep -E "^${key}=" "$ENV_PATH" | tail -1 | cut -d= -f2- | \
    sed -e 's/^"//' -e 's/"$//' || true
}

WEBHOOK_URL="${OPS_ALERT_WEBHOOK_URL:-$(read_env_value OPS_ALERT_WEBHOOK_URL)}"
if [ -z "$WEBHOOK_URL" ]; then
  echo "RESTORE TEST ALERT WARN: OPS_ALERT_WEBHOOK_URL 미설정 — 로그에만 기록합니다" | \
    tee -a "$LOG_PATH" >&2
  exit "$VERIFY_STATUS"
fi

PAYLOAD="$(node -e '
  const [message, rawStatus] = process.argv.slice(1);
  process.stdout.write(JSON.stringify({
    text: message,
    content: message,
    detail: { source: "db-restore-test", exitStatus: Number(rawStatus) },
    at: new Date().toISOString(),
  }));
' "$MESSAGE" "$VERIFY_STATUS")"

if ! curl -fsS --max-time 10 -X POST \
  -H 'Content-Type: application/json' --data "$PAYLOAD" "$WEBHOOK_URL" \
  >/dev/null; then
  echo "RESTORE TEST ALERT WARN: 운영 webhook 전송 실패" | tee -a "$LOG_PATH" >&2
fi

exit "$VERIFY_STATUS"
