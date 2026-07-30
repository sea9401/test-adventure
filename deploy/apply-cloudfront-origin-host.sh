#!/usr/bin/env bash
# 운영 nginx 가 origin.msmsge.com SNI를 올바른 인증서/server 블록으로 선택하게 한다.
set -euo pipefail

DEST="${DEST:-/etc/nginx/conf.d/msmsge.conf}"
SUDO_CMD="${SUDO_CMD-sudo}"
NGINX_BIN="${NGINX_BIN:-nginx}"
SYSTEMCTL_CMD="${SYSTEMCTL_CMD:-systemctl}"

candidate="$(mktemp)"
trap 'rm -f "$candidate"' EXIT
$SUDO_CMD cp "$DEST" "$candidate"

if ! grep -Eq 'server_name[^;]*msmsge\.com[^;]*www\.msmsge\.com' "$candidate"; then
  echo "expected msmsge.com/www.msmsge.com server_name not found in $DEST" >&2
  exit 1
fi

perl -0pi -e '
  s{^([ \t]*server_name\s+)
     (?=[^;\n]*\bmsmsge\.com\b)
     (?=[^;\n]*\bwww\.msmsge\.com\b)
     (?![^;\n]*\borigin\.msmsge\.com\b)
     ([^;\n]*);}
   {$1 . $2 . " origin.msmsge.com;"}gmex;
' "$candidate"

if $SUDO_CMD cmp -s "$candidate" "$DEST"; then
  echo "origin.msmsge.com is already present in nginx server_name"
  exit 0
fi

backup="${DEST}.bak.origin-host.$(date +%Y%m%d%H%M%S)"
$SUDO_CMD cp "$DEST" "$backup"
$SUDO_CMD cp "$candidate" "$DEST"
if ! $SUDO_CMD "$NGINX_BIN" -t; then
  $SUDO_CMD cp "$backup" "$DEST"
  $SUDO_CMD "$NGINX_BIN" -t
  echo "nginx config test failed; restored $backup" >&2
  exit 1
fi
$SUDO_CMD "$SYSTEMCTL_CMD" reload nginx
echo "origin.msmsge.com added to nginx server_name"
echo "backup: $backup"
