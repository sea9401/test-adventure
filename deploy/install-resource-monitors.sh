#!/usr/bin/env bash
set -euo pipefail

PRIVILEGED="${PRIVILEGED_COMMAND:-sudo}"
UNIT_DIR="${SYSTEMD_UNIT_DIR:-/etc/systemd/system}"

for unit in \
  adventure-resource-monitor.service \
  adventure-resource-monitor.timer \
  adventure-rds-memory-monitor.service \
  adventure-rds-memory-monitor.timer; do
  "$PRIVILEGED" install -m 0644 "deploy/$unit" "$UNIT_DIR/$unit"
done

"$PRIVILEGED" systemctl daemon-reload
"$PRIVILEGED" systemctl enable --now adventure-resource-monitor.timer
"$PRIVILEGED" systemctl enable --now adventure-rds-memory-monitor.timer
