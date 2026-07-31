#!/usr/bin/env bash
# test.msmsge.com 배포 중 정적 점검 화면을 앱과 독립적으로 켜고 끈다.
set -euo pipefail

PROJECT_DIR="${PROJECT_DIR:-$(cd "$(dirname "$0")/.." && pwd)}"
FLAG_FILE="${FLAG_FILE:-/etc/nginx/test-msmsge-maintenance.on}"
PAGE_DIR="${PAGE_DIR:-/var/www/test-msmsge}"
SERVICE="${SERVICE:-adventure-rpg-test}"
HEALTH_URL="${HEALTH_URL:-http://127.0.0.1:3002/api/health}"
LIVE_URL="${LIVE_URL:-https://test.msmsge.com/}"
HEALTH_RETRIES="${HEALTH_RETRIES:-20}"
HEALTH_RETRY_DELAY="${HEALTH_RETRY_DELAY:-3}"

health_code() {
  local code
  code=$(curl -sS -o /dev/null -w '%{http_code}' --max-time 8 "$HEALTH_URL") || code=000
  printf '%s' "$code"
}

live_code() {
  local code
  code=$(curl -sS -o /dev/null -w '%{http_code}' --max-time 8 "$LIVE_URL") || code=000
  printf '%s' "$code"
}

case "${1:-}" in
  on)
    sudo install -d -m 0755 "$PAGE_DIR"
    sudo install -m 0644 "$PROJECT_DIR/deploy/staging-maintenance.html" \
      "$PAGE_DIR/staging-maintenance.html"
    sudo touch "$FLAG_FILE"
    echo "→ staging maintenance=on · live $(live_code) (503 expected)"
    ;;
  off)
    if ! sudo systemctl is-active --quiet "$SERVICE"; then
      sudo systemctl start "$SERVICE"
    fi
    ready=0
    for attempt in $(seq 1 "$HEALTH_RETRIES"); do
      code=$(health_code)
      if [ "$code" = "200" ]; then
        ready=1
        echo "  staging health 200 (try $attempt)"
        break
      fi
      echo "  staging health $code · waiting $attempt/$HEALTH_RETRIES"
      sleep "$HEALTH_RETRY_DELAY"
    done
    if [ "$ready" != "1" ]; then
      echo "✗ staging is not healthy; maintenance remains enabled" >&2
      exit 1
    fi
    sudo rm -f "$FLAG_FILE"
    echo "→ staging maintenance=off · live $(live_code) (200/307 expected)"
    ;;
  status)
    if sudo test -f "$FLAG_FILE"; then
      echo "staging maintenance: on"
    else
      echo "staging maintenance: off"
    fi
    echo "service: $(systemctl is-active "$SERVICE" 2>&1)"
    echo "health: $(health_code)"
    echo "live: $(live_code)"
    ;;
  *)
    echo "usage: bash deploy/staging-maintenance.sh on|off|status" >&2
    exit 1
    ;;
esac
