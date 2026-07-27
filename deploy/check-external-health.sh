#!/usr/bin/env bash
# 서버 밖에서 공개 health/version 경로를 재시도하고 실패를 webhook으로 알린다.
set -euo pipefail

BASE_URL="${UPTIME_BASE_URL:-https://msmsge.com}"
RETRIES="${UPTIME_RETRIES:-3}"
RETRY_DELAY="${UPTIME_RETRY_DELAY:-5}"
FAILED=()

check_path() {
  local path="$1"
  local code="000"
  for attempt in $(seq 1 "$RETRIES"); do
    code="$(curl -sS -o /dev/null -w '%{http_code}' --connect-timeout 5 --max-time 12 "$BASE_URL$path" || true)"
    if [ "$code" = "200" ]; then
      echo "UPTIME OK: $path 200 (try $attempt)"
      return 0
    fi
    echo "UPTIME RETRY: $path ${code:-000} ($attempt/$RETRIES)" >&2
    [ "$attempt" = "$RETRIES" ] || sleep "$RETRY_DELAY"
  done
  FAILED+=("${path}:${code:-000}")
}

check_path /api/health
check_path /api/version

if [ "${#FAILED[@]}" -eq 0 ]; then
  exit 0
fi

MESSAGE="[ops] external uptime failed: ${BASE_URL} (${FAILED[*]})"
echo "$MESSAGE" >&2
if [ -n "${OPS_ALERT_WEBHOOK_URL:-}" ]; then
  PAYLOAD="$(node -e '
    const message = process.argv[1];
    process.stdout.write(JSON.stringify({
      text: message,
      content: message,
      detail: { source: "github-uptime" },
      at: new Date().toISOString(),
    }));
  ' "$MESSAGE")"
  if ! curl -fsS --max-time 10 -X POST \
    -H 'Content-Type: application/json' --data "$PAYLOAD" "$OPS_ALERT_WEBHOOK_URL" >/dev/null; then
    echo "UPTIME WARN: 운영 webhook 전송 실패" >&2
  fi
else
  echo "UPTIME WARN: OPS_ALERT_WEBHOOK_URL 미설정 — GitHub Actions 실패 알림만 사용합니다" >&2
fi
exit 1
