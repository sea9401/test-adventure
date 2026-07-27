#!/usr/bin/env bash
# EC2 인스턴스 안에서 도는 배포 스크립트.
#   수동: ssh ... 'cd ~/adventure-rpg && ./deploy/deploy.sh'
#   자동: .github/workflows/deploy.yml 이 main push 시 SSH 로 호출.
set -euo pipefail

cd "$(dirname "$0")/.."
echo "▶ deploy: $(date -u +%FT%TZ)"

echo "▶ git pull"
git fetch --prune origin
git checkout main
git reset --hard origin/main   # 로컬 변경 무시하고 origin/main 에 맞춤

echo "▶ nginx maintenance on"
bash deploy/maintenance.sh on

echo "▶ deps"
bash deploy/install-deps.sh

echo "▶ install AWS RDS CA bundle"
DATABASE_CA_CERT_PATH=$(grep '^DATABASE_CA_CERT_PATH=' .env.production.local | cut -d= -f2- | tr -d '"' || true)
if [ -z "$DATABASE_CA_CERT_PATH" ]; then
  echo "✗ .env.production.local에 DATABASE_CA_CERT_PATH를 먼저 설정하세요" >&2
  exit 1
fi
export DATABASE_CA_CERT_PATH
bash deploy/install-rds-ca.sh

echo "▶ production env preflight"
node --env-file=.env.production.local scripts/check-production-env.mjs

echo "▶ clean previous Next build"
rm -rf .next

echo "▶ build"
npm run build

echo "▶ db migrate"
node --env-file=.env.production.local src/db/migrate.mjs

echo "▶ sync systemd unit"
sudo install -m 0644 deploy/adventure-rpg.service /etc/systemd/system/adventure-rpg.service
sudo install -m 0644 deploy/adventure-resource-monitor.service /etc/systemd/system/adventure-resource-monitor.service
sudo install -m 0644 deploy/adventure-resource-monitor.timer /etc/systemd/system/adventure-resource-monitor.timer
sudo systemctl daemon-reload
sudo systemctl enable --now adventure-resource-monitor.timer

echo "▶ restart"
sudo systemctl restart adventure-rpg
sleep 2
sudo systemctl --no-pager status adventure-rpg | head -n 4

echo "▶ health check"
ok=0
for i in $(seq 1 20); do
  code=$(curl -s -o /dev/null -w '%{http_code}' --max-time 8 http://127.0.0.1:3000/api/health || echo 000)
  if [ "$code" = "200" ]; then ok=1; echo "health 200 (try $i)"; break; fi
  echo "health $code — 부팅 대기 $i/20"
  sleep 3
done
[ "$ok" = "1" ] || { echo "✗ health check failed; maintenance remains on" >&2; exit 1; }
sudo systemctl start adventure-resource-monitor.service

echo "▶ sync application crontab"
crontab deploy/crontab.txt
systemctl is-active --quiet crond
for path in \
  /api/v2/cron/ops-retention \
  /api/v2/cron/ops-daily-report; do
  crontab -l | grep -Fq "$path" || { echo "✗ cron sync failed: $path missing" >&2; exit 1; }
done

echo "▶ nginx maintenance off"
bash deploy/maintenance.sh off

echo "▶ public release smoke"
PUBLIC_RELEASE_EXPECTED_BUILD_ID="$(git rev-parse --short HEAD)" \
  npm run check-public-release

echo "▶ done"
