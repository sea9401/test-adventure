#!/usr/bin/env bash
# 인증이 필요한 로컬 크론 API를 호출하고 실패를 운영 webhook에 알린다.
# 사용: bash deploy/run-cron.sh GET /api/cron/example
set -euo pipefail

cd "$(dirname "$0")/.."

METHOD="${1:-}"
ROUTE="${2:-}"
case "$METHOD" in GET|POST) ;; *) echo "CRON FAIL: method must be GET or POST" >&2; exit 2 ;; esac
[[ "$ROUTE" =~ ^/api/[A-Za-z0-9_./-]+$ ]] || {
  echo "CRON FAIL: invalid route" >&2
  exit 2
}

ENV_PATH="${CRON_ENV_PATH:-.env.production.local}"
SECRET="${CRON_SECRET:-$(grep '^CRON_SECRET=' "$ENV_PATH" | cut -d= -f2- | tr -d '"' || true)}"
if [ -z "$SECRET" ]; then
  echo "CRON FAIL: CRON_SECRET 없음" >&2
  exit 1
fi

RESPONSE_FILE=$(mktemp)
trap 'rm -f "$RESPONSE_FILE"' EXIT
BASE_URL="${CRON_BASE_URL:-http://127.0.0.1:3000}"

set +e
HTTP_STATUS=$(curl -sS --max-time 45 -o "$RESPONSE_FILE" -w '%{http_code}' \
  -X "$METHOD" -H "Authorization: Bearer $SECRET" "$BASE_URL$ROUTE")
CURL_STATUS=$?
set -e

if [ "$CURL_STATUS" -eq 0 ] && [[ "$HTTP_STATUS" =~ ^2[0-9][0-9]$ ]]; then
  exit 0
fi

MESSAGE="[ops] cron failed: $METHOD $ROUTE (curl=$CURL_STATUS, http=${HTTP_STATUS:-000})"
echo "$MESSAGE" >&2

WEBHOOK_URL="${OPS_ALERT_WEBHOOK_URL:-$(grep '^OPS_ALERT_WEBHOOK_URL=' "$ENV_PATH" | cut -d= -f2- | tr -d '"' || true)}"
if [ -z "$WEBHOOK_URL" ]; then
  echo "CRON WARN: OPS_ALERT_WEBHOOK_URL 미설정 — 실패 알림을 보내지 못함" >&2
  exit 1
fi

PAYLOAD=$(node -e '
  const message = process.argv[1];
  process.stdout.write(JSON.stringify({
    text: message,
    content: message,
    detail: { source: "ec2-cron" },
    at: new Date().toISOString(),
  }));
' "$MESSAGE")

if ! curl -fsS --max-time 10 -X POST \
  -H 'Content-Type: application/json' --data "$PAYLOAD" "$WEBHOOK_URL" >/dev/null; then
  echo "CRON WARN: 운영 webhook 전송 실패" >&2
fi
exit 1
