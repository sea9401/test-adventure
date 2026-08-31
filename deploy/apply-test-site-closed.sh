#!/usr/bin/env bash
set -euo pipefail

PROJECT_DIR="${PROJECT_DIR:-$(cd "$(dirname "$0")/.." && pwd)}"
CONF_TARGET="${CONF_TARGET:-/etc/nginx/conf.d/test-msmsge.conf}"
HTML_DIR="${HTML_DIR:-/var/www/test-msmsge}"
SUDO_CMD="${SUDO_CMD-sudo}"
SYSTEMCTL_CMD="${SYSTEMCTL_CMD:-systemctl}"

cd "$PROJECT_DIR"

BACKUP_FILE=$(mktemp)
BODY_FILE=$(mktemp)
HAD_CONFIG=0

cleanup() {
  rm -f "$BACKUP_FILE" "$BODY_FILE"
}
trap cleanup EXIT

if $SUDO_CMD test -f "$CONF_TARGET"; then
  HAD_CONFIG=1
  $SUDO_CMD cat "$CONF_TARGET" > "$BACKUP_FILE"
fi

restore_previous_config() {
  if [ "$HAD_CONFIG" = "1" ]; then
    $SUDO_CMD install -m 0644 "$BACKUP_FILE" "$CONF_TARGET"
  else
    $SUDO_CMD rm -f "$CONF_TARGET"
  fi
  $SUDO_CMD nginx -t
  $SUDO_CMD $SYSTEMCTL_CMD reload nginx
}

$SUDO_CMD install -d -m 0755 "$HTML_DIR"
$SUDO_CMD install -m 0644 deploy/staging-closed.html "$HTML_DIR/staging-closed.html"
$SUDO_CMD install -m 0644 deploy/nginx-adventure-rpg-test-closed.conf "$CONF_TARGET"

if ! $SUDO_CMD nginx -t; then
  echo "ERROR: nginx 설정 검증 실패 — 기존 테스트 도메인 설정을 복원합니다." >&2
  restore_previous_config
  exit 1
fi

if ! $SUDO_CMD $SYSTEMCTL_CMD reload nginx; then
  echo "ERROR: nginx reload 실패 — 기존 테스트 도메인 설정을 복원합니다." >&2
  restore_previous_config
  exit 1
fi

STATUS_CODE="000"
VERIFIED=0
for _ in $(seq 1 20); do
  if STATUS_CODE=$(
    curl -ksS --resolve test.msmsge.com:443:127.0.0.1 \
      -o "$BODY_FILE" -w '%{http_code}' https://test.msmsge.com/
  ); then
    if [ "$STATUS_CODE" = "503" ] && grep -q "현재는 운영 중이 아닙니다" "$BODY_FILE"; then
      VERIFIED=1
      break
    fi
  fi
  sleep 0.25
done
if [ "$VERIFIED" != "1" ]; then
  echo "확인된 HTTP 상태: $STATUS_CODE" >&2
  echo "ERROR: 테스트 도메인 차단 확인 실패 — 기존 설정을 복원합니다." >&2
  restore_previous_config
  exit 1
fi

echo "test.msmsge.com: 503 차단 화면 적용 완료"
