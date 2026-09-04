#!/usr/bin/env bash
# nginx 점검(maintenance) 모드 토글 — EC2 에서 실행.
# 앱과 독립된 플래그를 켜고/끄므로 build/stop/restart 중에도 정적 점검 페이지가 유지된다.
#   ON  = nginx가 사용자에게 점검 페이지(503), /api/health 만 앱으로 통과.
#   OFF = 앱 health 200 확인 후 평소 라우팅으로 복귀.
# 사용:  bash deploy/maintenance.sh on        # 점검 시작
#        bash deploy/maintenance.sh off       # 점검 종료
#        bash deploy/maintenance.sh status    # 현재 상태
#        bash deploy/maintenance.sh refresh-page # 정적 대문만 교체
set -euo pipefail
PROJECT_DIR="${PROJECT_DIR:-$(cd "$(dirname "$0")/.." && pwd)}"
cd "$PROJECT_DIR"
ENV_FILE="${ENV_FILE:-/run/adventure-rpg/production.env}"
SERVICE="${SERVICE:-adventure-rpg}"
FLAG_FILE="${FLAG_FILE:-/etc/nginx/msmsge-maintenance.on}"
SUDO_CMD="${SUDO_CMD-sudo}"
SYSTEMCTL_CMD="${SYSTEMCTL_CMD:-systemctl}"
HEALTH_RETRIES="${HEALTH_RETRIES:-20}"
HEALTH_RETRY_DELAY="${HEALTH_RETRY_DELAY:-3}"
COOP_TIMER_SCRIPT="${COOP_TIMER_SCRIPT:-scripts/coop-maintenance-timer.mjs}"
COOP_TIMER_STATE_FILE="${COOP_TIMER_STATE_FILE:-${FLAG_FILE}.started-at}"
NODE_CMD="${NODE_CMD:-node}"
MAINTENANCE_PAGE_SOURCE="${MAINTENANCE_PAGE_SOURCE:-deploy/maintenance.html}"
MAINTENANCE_PAGE_TARGET="${MAINTENANCE_PAGE_TARGET:-/var/www/msmsge/maintenance.html}"

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
maintenance_started_at() {
  if $SUDO_CMD test -f "$COOP_TIMER_STATE_FILE"; then
    $SUDO_CMD cat "$COOP_TIMER_STATE_FILE"
  fi
}
ensure_maintenance_started_at() {
  local started_at
  started_at="$(maintenance_started_at)"
  if [ -z "$started_at" ]; then
    started_at="$(date -u '+%Y-%m-%dT%H:%M:%S.%3NZ')"
    printf '%s\n' "$started_at" | $SUDO_CMD tee "$COOP_TIMER_STATE_FILE" >/dev/null
  fi
  printf '%s' "$started_at"
}
record_coop_timer_pause() {
  local started_at="$1"
  "$NODE_CMD" --env-file="$ENV_FILE" "$COOP_TIMER_SCRIPT" start "$started_at"
}
resume_coop_timers() {
  "$NODE_CMD" --env-file="$ENV_FILE" "$COOP_TIMER_SCRIPT" resume
}
refresh_maintenance_page() {
  if [ ! -f "$MAINTENANCE_PAGE_SOURCE" ]; then
    echo "ERROR: 점검 대문 원본을 찾을 수 없습니다: $MAINTENANCE_PAGE_SOURCE" >&2
    exit 1
  fi
  $SUDO_CMD install -D -m 0644 "$MAINTENANCE_PAGE_SOURCE" "$MAINTENANCE_PAGE_TARGET"
  echo "→ maintenance page refreshed (앱 재시작 없음 · 점검 모드 변경 없음)"
}

case "${1:-}" in
  on)
    # 최초 실행에서도 필요한 nginx include와 정적 HTML을 먼저 안전하게 설치한다.
    bash deploy/apply-nginx-rate-limit.sh
    STARTED_AT="$(ensure_maintenance_started_at)"
    $SUDO_CMD touch "$FLAG_FILE"
    echo "→ nginx maintenance=on (앱 재시작 없음)"
    # DB가 잠시 불통이어도 점검 화면 자체는 켠다. 로컬 시작 시각을 남겨 두었다가
    # off에서 DB 기록을 복구한 뒤 반드시 보스 타이머를 연장한다.
    if ! record_coop_timer_pause "$STARTED_AT"; then
      echo "WARN: 협동 보스 타이머 일시정지 DB 기록 실패 — 점검 해제 시 재시도합니다." >&2
    fi
    echo "live: $(live_code)  (503 기대)"
    echo "health: $(health_code)  (정상 운영 중이면 200)"
    ;;
  off)
    # SSM 원본에 예전 앱-레벨 토글이 남아 있으면 런타임 캐시만 고쳐서는
    # 다음 재시작에 되살아난다. 점검 화면을 유지하고 원본 수정을 요구한다.
    if [ "$(legacy_cur)" = "true" ]; then
      echo "ERROR: SSM production env의 MAINTENANCE_MODE=true를 제거한 뒤 재시작하세요." >&2
      exit 1
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

    STARTED_AT="$(maintenance_started_at)"
    if [ -n "$STARTED_AT" ]; then
      # on 시점의 DB가 불통이었어도 최초 로컬 시각으로 멱등 복구한다.
      record_coop_timer_pause "$STARTED_AT"
    fi
    # 연장이 실패하면 nginx 점검 화면과 시작 시각을 그대로 보존한다.
    resume_coop_timers
    $SUDO_CMD rm -f "$COOP_TIMER_STATE_FILE"
    $SUDO_CMD rm -f "$FLAG_FILE"
    echo "→ nginx maintenance=off"
    echo "live: $(live_code)  (200 기대)"
    ;;
  status)
    echo "nginx maintenance: $(nginx_cur)"
    echo "coop boss timer paused at: $(maintenance_started_at || true)"
    echo "legacy MAINTENANCE_MODE: $(legacy_cur)"
    echo "service: $($SUDO_CMD $SYSTEMCTL_CMD is-active "$SERVICE" 2>&1)"
    echo "live: $(live_code)  (점검 ON이면 503)"
    echo "health: $(health_code)"
    exit 0 ;;
  refresh-page)
    refresh_maintenance_page
    ;;
  *) echo "사용: bash deploy/maintenance.sh on|off|status|refresh-page"; exit 1 ;;
esac
