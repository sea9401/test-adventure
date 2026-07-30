#!/usr/bin/env bash
# CloudFront의 비밀 원본 헤더가 없는 HTTPS 직접 요청을 nginx에서 거부한다.
# DNS 전환이 안정된 뒤 실행한다. 비밀은 인자가 아닌 환경변수로 전달한다.
set -euo pipefail

: "${CLOUDFRONT_ORIGIN_SECRET:?Set CLOUDFRONT_ORIGIN_SECRET}"
if ! [[ "$CLOUDFRONT_ORIGIN_SECRET" =~ ^[A-Za-z0-9_-]{32,128}$ ]]; then
  echo "CLOUDFRONT_ORIGIN_SECRET must be 32-128 alphanumeric/_/- characters" >&2
  exit 2
fi

DEST="${DEST:-/etc/nginx/conf.d/msmsge.conf}"
SNIPPET_DIR="${SNIPPET_DIR:-/etc/nginx/snippets}"
SNIPPET="$SNIPPET_DIR/msmsge-cloudfront-origin-guard.conf"
SUDO_CMD="${SUDO_CMD-sudo}"
NGINX_BIN="${NGINX_BIN:-nginx}"
SYSTEMCTL_CMD="${SYSTEMCTL_CMD:-systemctl}"

candidate="$(mktemp)"
snippet_candidate="$(mktemp)"
trap 'rm -f "$candidate" "$snippet_candidate"' EXIT
$SUDO_CMD cp "$DEST" "$candidate"

if ! grep -Eq 'listen[[:space:]]+443([^;])*;' "$candidate"; then
  echo "no HTTPS server found in $DEST" >&2
  exit 1
fi

printf 'if ($http_x_msmsge_origin_verify != "%s") {\n    return 404;\n}\n' \
  "$CLOUDFRONT_ORIGIN_SECRET" >"$snippet_candidate"

if ! grep -q 'msmsge-cloudfront-origin-guard\.conf' "$candidate"; then
  perl -0pi -e 's{(^([ \t]*)listen\s+443[^;\n]*;\n)}{$1 . $2 . "include /etc/nginx/snippets/msmsge-cloudfront-origin-guard.conf;\n"}me' "$candidate"
fi

config_backup="${DEST}.bak.cloudfront.$(date +%Y%m%d%H%M%S)"
snippet_backup=""
$SUDO_CMD cp "$DEST" "$config_backup"
if $SUDO_CMD test -f "$SNIPPET"; then
  snippet_backup="${SNIPPET}.bak.$(date +%Y%m%d%H%M%S)"
  $SUDO_CMD cp "$SNIPPET" "$snippet_backup"
fi
$SUDO_CMD install -d -m 0755 "$SNIPPET_DIR"
$SUDO_CMD install -m 0600 "$snippet_candidate" "$SNIPPET"
$SUDO_CMD cp "$candidate" "$DEST"

restore() {
  $SUDO_CMD cp "$config_backup" "$DEST"
  if [ -n "$snippet_backup" ]; then
    $SUDO_CMD cp "$snippet_backup" "$SNIPPET"
  else
    $SUDO_CMD rm -f "$SNIPPET"
  fi
  $SUDO_CMD "$NGINX_BIN" -t
  $SUDO_CMD "$SYSTEMCTL_CMD" reload nginx
}

if ! $SUDO_CMD "$NGINX_BIN" -t; then
  restore
  echo "nginx config test failed; restored previous state" >&2
  exit 1
fi
$SUDO_CMD "$SYSTEMCTL_CMD" reload nginx

blocked_code="$(curl -ksS --max-time 10 --resolve msmsge.com:443:127.0.0.1 -o /dev/null -w '%{http_code}' https://msmsge.com/api/health || true)"
allowed_code="$(curl -ksS --max-time 10 --resolve msmsge.com:443:127.0.0.1 -H "X-Msmsge-Origin-Verify: $CLOUDFRONT_ORIGIN_SECRET" -o /dev/null -w '%{http_code}' https://msmsge.com/api/health || true)"
if [ "$blocked_code" != "404" ] || [ "$allowed_code" != "200" ]; then
  restore
  echo "origin guard verification failed (without=$blocked_code with=$allowed_code); restored previous state" >&2
  exit 1
fi

echo "CloudFront origin guard applied (without header=404, with header=200)"
echo "config backup: $config_backup"
[ -z "$snippet_backup" ] || echo "snippet backup: $snippet_backup"
