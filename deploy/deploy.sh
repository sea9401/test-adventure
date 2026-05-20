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

echo "▶ deps"
bash deploy/install-deps.sh

echo "▶ db migrate"
node --env-file=.env.production.local src/db/migrate.mjs

echo "▶ build"
npm run build

echo "▶ restart"
sudo systemctl restart adventure-rpg
sleep 2
sudo systemctl --no-pager status adventure-rpg | head -n 4

echo "▶ health check"
curl -fsS -o /dev/null -w 'http=%{http_code}\n' http://127.0.0.1:3000/api/health || true

echo "▶ done"
