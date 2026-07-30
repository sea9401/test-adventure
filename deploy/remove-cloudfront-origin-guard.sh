#!/usr/bin/env bash
# 긴급 롤백용: nginx CloudFront 원본 헤더 검사를 제거한다.
set -euo pipefail

DEST="${DEST:-/etc/nginx/conf.d/msmsge.conf}"
SNIPPET="${SNIPPET:-/etc/nginx/snippets/msmsge-cloudfront-origin-guard.conf}"
SUDO_CMD="${SUDO_CMD-sudo}"
NGINX_BIN="${NGINX_BIN:-nginx}"
SYSTEMCTL_CMD="${SYSTEMCTL_CMD:-systemctl}"

candidate="$(mktemp)"
trap 'rm -f "$candidate"' EXIT
$SUDO_CMD cp "$DEST" "$candidate"
perl -0pi -e 's{^[ \t]*include /etc/nginx/snippets/msmsge-cloudfront-origin-guard\.conf;\n}{}gm' "$candidate"

backup="${DEST}.bak.remove-cloudfront.$(date +%Y%m%d%H%M%S)"
$SUDO_CMD cp "$DEST" "$backup"
$SUDO_CMD cp "$candidate" "$DEST"
if ! $SUDO_CMD "$NGINX_BIN" -t; then
  $SUDO_CMD cp "$backup" "$DEST"
  $SUDO_CMD "$NGINX_BIN" -t
  echo "nginx config test failed; restored $backup" >&2
  exit 1
fi
$SUDO_CMD "$SYSTEMCTL_CMD" reload nginx
$SUDO_CMD rm -f "$SNIPPET"
echo "CloudFront origin guard removed"
echo "backup: $backup"
