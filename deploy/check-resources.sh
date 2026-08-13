#!/usr/bin/env bash
# EC2 자체 자원 사용량을 확인하고 상태가 바뀌거나 경보가 오래 지속되면 webhook에 알린다.
set -euo pipefail

cd "$(dirname "$0")/.."

ENV_PATH="${RESOURCE_MONITOR_ENV_PATH:-/run/adventure-rpg/production.env}"
STATE_PATH="${RESOURCE_MONITOR_STATE_PATH:-/tmp/adventure-resource-monitor.state}"
ALERT_COOLDOWN_SECONDS="${RESOURCE_ALERT_COOLDOWN_SECONDS:-1800}"
LOAD_MAX_PCT="${RESOURCE_LOAD_MAX_PCT:-90}"
MEM_AVAILABLE_MIN_PCT="${RESOURCE_MEM_AVAILABLE_MIN_PCT:-15}"
DISK_USED_MAX_PCT="${RESOURCE_DISK_USED_MAX_PCT:-85}"

CPU_COUNT="${RESOURCE_MONITOR_CPU_COUNT:-$(getconf _NPROCESSORS_ONLN)}"
LOAD_5="${RESOURCE_MONITOR_LOAD_5:-$(awk '{ print $2 }' /proc/loadavg)}"
MEM_AVAILABLE_PCT="${RESOURCE_MONITOR_MEM_AVAILABLE_PCT:-$(awk '
  /^MemTotal:/ { total = $2 }
  /^MemAvailable:/ { available = $2 }
  END { if (total > 0) printf "%.1f", available * 100 / total; else print "0" }
' /proc/meminfo)}"
DISK_USED_PCT="${RESOURCE_MONITOR_DISK_USED_PCT:-$(df -P "${RESOURCE_MONITOR_DISK_PATH:-/}" | awk 'NR == 2 { gsub(/%/, "", $5); print $5 }')}"
LOAD_PCT="$(awk -v current_load="$LOAD_5" -v cpus="$CPU_COUNT" 'BEGIN { if (cpus > 0) printf "%.1f", current_load * 100 / cpus; else print "999" }')"

# 같은 2분 타이머에서 RDS FreeableMemory도 확인한다. CloudWatch/IAM 오류는
# EC2 자체 감시를 중단시키지 않고 자식 스크립트가 journal 경고로만 남긴다.
if ! node scripts/check-rds-memory.mjs; then
  echo "RESOURCE WARN: RDS 메모리 감시 스크립트 실행 실패" >&2
fi

# crond와 백업 작업의 성공 기록은 systemd timer에서 독립적으로 확인한다. crond가
# 멈추면 cron 자체로는 실패 알림을 보낼 수 없으므로 이 경로가 dead-man 역할을 한다.
if ! node scripts/ops-heartbeat.mjs check; then
  echo "RESOURCE WARN: 정기 작업 heartbeat 감시 스크립트 실행 실패" >&2
fi

ALERTS=()
if awk -v value="$LOAD_PCT" -v threshold="$LOAD_MAX_PCT" 'BEGIN { exit !(value >= threshold) }'; then
  ALERTS+=("load=${LOAD_PCT}%>=${LOAD_MAX_PCT}%")
fi
if awk -v value="$MEM_AVAILABLE_PCT" -v threshold="$MEM_AVAILABLE_MIN_PCT" 'BEGIN { exit !(value <= threshold) }'; then
  ALERTS+=("memory_available=${MEM_AVAILABLE_PCT}%<=${MEM_AVAILABLE_MIN_PCT}%")
fi
if awk -v value="$DISK_USED_PCT" -v threshold="$DISK_USED_MAX_PCT" 'BEGIN { exit !(value >= threshold) }'; then
  ALERTS+=("disk_used=${DISK_USED_PCT}%>=${DISK_USED_MAX_PCT}%")
fi

CURRENT_KEY="$(IFS=,; printf '%s' "${ALERTS[*]:-}")"
NOW="$(date +%s)"
PREVIOUS_KEY=""
PREVIOUS_AT=0
if [ -f "$STATE_PATH" ]; then
  IFS='|' read -r PREVIOUS_KEY PREVIOUS_AT < "$STATE_PATH" || true
fi
[[ "$PREVIOUS_AT" =~ ^[0-9]+$ ]] || PREVIOUS_AT=0

read_env_value() {
  local key="$1"
  [ -f "$ENV_PATH" ] || return 0
  grep -E "^${key}=" "$ENV_PATH" | tail -1 | cut -d= -f2- | sed -e 's/^"//' -e 's/"$//' || true
}

send_webhook() {
  local message="$1"
  local webhook_url
  webhook_url="${OPS_ALERT_WEBHOOK_URL:-$(read_env_value OPS_ALERT_WEBHOOK_URL)}"
  if [ -z "$webhook_url" ]; then
    echo "RESOURCE WARN: OPS_ALERT_WEBHOOK_URL 미설정 — journal에만 기록합니다" >&2
    return 0
  fi

  local payload
  payload="$(node -e '
    const message = process.argv[1];
    process.stdout.write(JSON.stringify({
      text: message,
      content: message,
      detail: { source: "ec2-resource-monitor" },
      at: new Date().toISOString(),
    }));
  ' "$message")"

  if ! curl -fsS --max-time 10 -X POST \
    -H 'Content-Type: application/json' --data "$payload" "$webhook_url" >/dev/null; then
    echo "RESOURCE WARN: 운영 webhook 전송 실패" >&2
  fi
}

mkdir -p "$(dirname "$STATE_PATH")"
if [ -n "$CURRENT_KEY" ]; then
  printf -v MESSAGE '🚨 **게임 서버 자원 사용량 경고**\n서버의 CPU·메모리·디스크 중 하나가 경고 기준을 넘었습니다.\n\n- 5분 평균 부하: %s (CPU %s개 기준 %s%%, 경고 %s%% 이상)\n- 사용 가능한 메모리: %s%% (경고 %s%% 이하)\n- 디스크 사용량: %s%% (경고 %s%% 이상)\n\n**확인할 일**\nEC2 서버 상태와 실행 중인 프로세스를 확인하세요. 같은 알림은 문제가 계속되면 30분 뒤 다시 전송됩니다.' \
    "$LOAD_5" "$CPU_COUNT" "$LOAD_PCT" "$LOAD_MAX_PCT" \
    "$MEM_AVAILABLE_PCT" "$MEM_AVAILABLE_MIN_PCT" \
    "$DISK_USED_PCT" "$DISK_USED_MAX_PCT"
  echo "$MESSAGE" >&2
  if [ "$CURRENT_KEY" != "$PREVIOUS_KEY" ] || [ $((NOW - PREVIOUS_AT)) -ge "$ALERT_COOLDOWN_SECONDS" ]; then
    send_webhook "$MESSAGE"
    printf '%s|%s\n' "$CURRENT_KEY" "$NOW" > "$STATE_PATH"
  fi
  exit 0
fi

echo "RESOURCE OK: load5=${LOAD_5} (${LOAD_PCT}% of ${CPU_COUNT} CPU), memory_available=${MEM_AVAILABLE_PCT}%, disk_used=${DISK_USED_PCT}%"
if [ -n "$PREVIOUS_KEY" ]; then
  printf -v RECOVERY_MESSAGE '✅ **게임 서버 자원 사용량이 정상으로 돌아왔습니다**\n이전에 경고 기준을 넘었던 서버 상태가 회복됐습니다.\n\n- 5분 평균 부하: %s\n- 사용 가능한 메모리: %s%%\n- 디스크 사용량: %s%%\n\n별도 조치는 필요하지 않습니다.' \
    "$LOAD_5" "$MEM_AVAILABLE_PCT" "$DISK_USED_PCT"
  send_webhook "$RECOVERY_MESSAGE"
fi
printf '|%s\n' "$NOW" > "$STATE_PATH"
