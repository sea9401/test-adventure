#!/usr/bin/env bash
# nginx 점검(maintenance) 모드 토글 — EC2 에서 실행.
# 앱과 독립된 플래그를 켜고/끄므로 build/stop/restart 중에도 정적 점검 페이지가 유지된다.
#   ON  = nginx가 사용자에게 점검 페이지(503), /api/health 만 앱으로 통과.
#   OFF = 앱 health 200 확인 후 평소 라우팅으로 복귀.
# 사용:  bash deploy/maintenance.sh on        # 점검 시작
#        bash deploy/maintenance.sh off       # 점검 종료
#        bash deploy/maintenance.sh status    # 현재 상태
set -euo pipefail
PROJECT_DIR="${PROJECT_DIR:-$(cd "$(dirname "$0")/.." && pwd)}"
cd "$PROJECT_DIR"
ENV_FILE="${ENV_FILE:-.env.production.local}"
SERVICE="${SERVICE:-adventure-rpg}"
FLAG_FILE="${FLAG_FILE:-/etc/nginx/msmsge-maintenance.on}"
SUDO_CMD="${SUDO_CMD-sudo}"
SYSTEMCTL_CMD="${SYSTEMCTL_CMD:-systemctl}"
HEALTH_RETRIES="${HEALTH_RETRIES:-20}"
HEALTH_RETRY_DELAY="${HEALTH_RETRY_DELAY:-3}"

legacy_cur() { grep -E '^MAINTENANCE_MODE=' "$ENV_FILE" 2>/dev/null | tail -1 | cut -d= -f2- || echo "(미설정=off)"; }
nginx_cur() { if $SUDO_CMD test -f "$FLAG_FILE"; then echo on; else echo off; fi; }
live_code() {
  local code
  code=$(curl -s -o /dev/null -w '%{http_code}' --max-time 8 https://msmsge.com/) || code='???'
  printf '%s' "$code"
}
health_code() {
  local code
  code=$(curl -s -o /dev/null -w '%{http_code}' --max-time 8 http://127.0.0.1:3000/api/health) || code='000'
  printf '%s' "$code"
}

case "${1:-}" in
  on)
    # 최초 실행에서도 필요한 nginx include와 정적 HTML을 먼저 안전하게 설치한다.
    bash deploy/apply-nginx-rate-limit.sh
    $SUDO_CMD touch "$FLAG_FILE"
    echo "→ nginx maintenance=on (앱 재시작 없음)"
    echo "live: $(live_code)  (503 기대)"
    echo "health: $(health_code)  (정상 운영 중이면 200)"
    ;;
  off)
    # 예전 앱-레벨 토글이 남아 있으면 nginx 가림막 아래에서 먼저 해제한다.
    if [ "$(legacy_cur)" = "true" ]; then
      sed -i 's/^MAINTENANCE_MODE=.*/MAINTENANCE_MODE=false/' "$ENV_FILE"
      echo "→ legacy MAINTENANCE_MODE=false · nginx 점검 화면 아래에서 앱 재시작"
      $SUDO_CMD $SYSTEMCTL_CMD restart "$SERVICE"
    elif ! $SUDO_CMD $SYSTEMCTL_CMD is-active --quiet "$SERVICE"; then
      echo "→ 중지된 앱 시작 · nginx 점검 화면은 계속 유지"
      $SUDO_CMD $SYSTEMCTL_CMD start "$SERVICE"
    fi

    echo "→ 앱 준비 확인 중…"
    READY=0
    for i in $(seq 1 "$HEALTH_RETRIES"); do
      CODE=$(health_code)
      if [ "$CODE" = "200" ]; then
        READY=1
        echo "health 200 (try $i)"
        break
      fi
      echo "health $CODE — 부팅 대기 $i/$HEALTH_RETRIES"
      sleep "$HEALTH_RETRY_DELAY"
    done
    if [ "$READY" != "1" ]; then
      echo "ERROR: 앱 health가 준비되지 않아 점검 화면을 유지합니다." >&2
      exit 1
    fi

    $SUDO_CMD rm -f "$FLAG_FILE"
    echo "→ nginx maintenance=off"
    echo "live: $(live_code)  (200 기대)"
    ;;
  status)
    echo "nginx maintenance: $(nginx_cur)"
    echo "legacy MAINTENANCE_MODE: $(legacy_cur)"
    echo "service: $($SUDO_CMD $SYSTEMCTL_CMD is-active "$SERVICE" 2>&1)"
    echo "live: $(live_code)  (점검 ON이면 503)"
    echo "health: $(health_code)"
    exit 0 ;;
  *) echo "사용: bash deploy/maintenance.sh on|off|status"; exit 1 ;;
esac
