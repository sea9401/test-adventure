#!/usr/bin/env bash
# 점검(maintenance) 모드 토글 — EC2 에서 실행.
# .env.production.local 의 MAINTENANCE_MODE 를 켜고/끄고 서비스를 재시작한다.
#   ON  = 사용자에게 점검 페이지(503), /api/health 만 통과(모니터 유지).
#   OFF = 평소대로.
# 사용:  bash deploy/maintenance.sh on        # 점검 시작
#        bash deploy/maintenance.sh off       # 점검 종료
#        bash deploy/maintenance.sh status    # 현재 상태
set -euo pipefail
cd "$(dirname "$0")/.."
ENV_FILE=".env.production.local"
SERVICE="adventure-rpg"

cur() { grep -E '^MAINTENANCE_MODE=' "$ENV_FILE" 2>/dev/null | tail -1 | cut -d= -f2- || echo "(미설정=off)"; }

case "${1:-}" in
  on)  VAL=true ;;
  off) VAL=false ;;
  status)
    echo "MAINTENANCE_MODE=$(cur)"
    echo "service: $(systemctl is-active "$SERVICE" 2>&1)"
    echo "live: $(curl -s -o /dev/null -w '%{http_code}' --max-time 8 https://msmsge.com/ || echo '???')  (점검 ON 이면 503)"
    exit 0 ;;
  *) echo "사용: bash deploy/maintenance.sh on|off|status"; exit 1 ;;
esac

touch "$ENV_FILE"
if grep -qE '^MAINTENANCE_MODE=' "$ENV_FILE"; then
  sed -i "s/^MAINTENANCE_MODE=.*/MAINTENANCE_MODE=$VAL/" "$ENV_FILE"
else
  printf '\nMAINTENANCE_MODE=%s\n' "$VAL" >> "$ENV_FILE"
fi
echo "→ MAINTENANCE_MODE=$VAL · 재시작…"
sudo systemctl restart "$SERVICE"
sleep 3
echo "service: $(systemctl is-active "$SERVICE")"
echo "live(/): $(curl -s -o /dev/null -w '%{http_code}' --max-time 8 https://msmsge.com/)  (ON=503 / OFF=200)"
echo "health : $(curl -s -o /dev/null -w '%{http_code}' --max-time 8 https://msmsge.com/api/health)  (항상 200 이어야 정상)"
