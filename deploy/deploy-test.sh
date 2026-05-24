#!/usr/bin/env bash
# 테스트 서버용 배포 스크립트. ~/adventure-rpg-test/deploy/deploy-test.sh 위치 가정.
#   수동: ssh ... 'cd ~/adventure-rpg-test && ./deploy/deploy-test.sh'
#   자동: .github/workflows/deploy.yml 이 main push 시 prod 배포 이후 호출.
# 구조는 deploy.sh 와 거의 동일하나 systemd 유닛/포트가 다름.
set -euo pipefail

cd "$(dirname "$0")/.."
echo "▶ deploy-test: $(date -u +%FT%TZ)"

echo "▶ git pull"
git fetch --prune origin
git checkout main
git reset --hard origin/main   # 로컬 변경 무시하고 origin/main 에 맞춤

echo "▶ npm ci"
npm ci

echo "▶ db migrate"
node --env-file=.env.production.local src/db/migrate.mjs

echo "▶ build"
npm run build

echo "▶ restart"
sudo systemctl restart adventure-rpg-test
sleep 2
sudo systemctl --no-pager status adventure-rpg-test | head -n 4

echo "▶ health check"
curl -fsS -o /dev/null -w 'http=%{http_code}\n' http://127.0.0.1:3002/api/health || true

echo "▶ done"
