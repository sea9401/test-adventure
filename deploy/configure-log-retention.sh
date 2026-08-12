#!/usr/bin/env bash
# 작은 EC2 루트 볼륨에서 persistent journal이 무제한 자라지 않도록 배포 시 제한한다.
set -euo pipefail

cd "$(dirname "$0")/.."

CONFIG_SOURCE="deploy/adventure-journald.conf"
CONFIG_DIR="${JOURNALD_CONFIG_DIR:-/etc/systemd/journald.conf.d}"
PRIVILEGED="${PRIVILEGED_COMMAND:-sudo}"

"$PRIVILEGED" install -d -m 0755 "$CONFIG_DIR"
"$PRIVILEGED" install -m 0644 "$CONFIG_SOURCE" \
  "$CONFIG_DIR/adventure-rpg.conf"
"$PRIVILEGED" systemctl restart systemd-journald
"$PRIVILEGED" journalctl --rotate
"$PRIVILEGED" journalctl --vacuum-size=512M

echo "JOURNAL RETENTION OK: max=512M keep-free=3G retention=14day"
