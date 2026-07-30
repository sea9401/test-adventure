#!/usr/bin/env bash
# AWS 공식 CloudFront 원본 연결 IP만 신뢰해 nginx $remote_addr를 실제 사용자 IP로 복원한다.
set -euo pipefail

DEST="${DEST:-/etc/nginx/conf.d/00-cloudfront-real-ip.conf}"
SUDO_CMD="${SUDO_CMD-sudo}"
NGINX_BIN="${NGINX_BIN:-nginx}"
SYSTEMCTL_CMD="${SYSTEMCTL_CMD:-systemctl}"
IP_RANGES_URL="https://ip-ranges.amazonaws.com/ip-ranges.json"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
RENDERER="$SCRIPT_DIR/../scripts/render-cloudfront-real-ip.mjs"

command -v curl >/dev/null 2>&1 || { echo "curl is required" >&2; exit 2; }
command -v node >/dev/null 2>&1 || { echo "node is required" >&2; exit 2; }
[ -f "$RENDERER" ] || { echo "renderer not found: $RENDERER" >&2; exit 2; }

ranges="$(mktemp)"
candidate="$(mktemp)"
trap 'rm -f "$ranges" "$candidate"' EXIT
curl -fsS --max-time 30 "$IP_RANGES_URL" -o "$ranges"

node "$RENDERER" "$ranges" >"$candidate"

prefix_count="$(grep -Ec '^set_real_ip_from ' "$candidate")"
if [ "$prefix_count" -lt 2 ]; then
  echo "unexpected CloudFront origin-facing prefix count: $prefix_count" >&2
  exit 1
fi

if $SUDO_CMD test -f "$DEST" && $SUDO_CMD cmp -s "$candidate" "$DEST"; then
  echo "CloudFront real IP configuration is already current ($prefix_count prefixes)"
  exit 0
fi

backup=""
if $SUDO_CMD test -f "$DEST"; then
  backup="${DEST}.bak.$(date +%Y%m%d%H%M%S)"
  $SUDO_CMD cp "$DEST" "$backup"
fi
$SUDO_CMD install -m 0644 "$candidate" "$DEST"

if ! $SUDO_CMD "$NGINX_BIN" -t; then
  if [ -n "$backup" ]; then
    $SUDO_CMD cp "$backup" "$DEST"
  else
    $SUDO_CMD rm -f "$DEST"
  fi
  $SUDO_CMD "$NGINX_BIN" -t
  echo "nginx config test failed; restored previous state" >&2
  exit 1
fi

$SUDO_CMD "$SYSTEMCTL_CMD" reload nginx
echo "CloudFront real IP configuration applied ($prefix_count prefixes)"
[ -z "$backup" ] || echo "backup: $backup"
