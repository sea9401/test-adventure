#!/usr/bin/env bash
# 테스트 서버용 배포 스크립트. ~/adventure-rpg-test/deploy/deploy-test.sh 위치 가정.
#   수동: ssh ... 'cd ~/adventure-rpg-test && ./deploy/deploy-test.sh'
#   자동: .github/workflows/deploy.yml 이 main push 시 prod 배포 이후 호출.
# 구조는 deploy.sh 와 거의 동일하나 systemd 유닛/포트가 다름.
#
# 메모리 트릭: 작은 EC2 (t3.small 등) 에서 prod (adventure-rpg) + test 가 같이 돌면
# next build (Turbopack) 가 OOM 으로 죽는 경우 발생. 빌드 동안 prod 일시 정지로
# 메모리 ~75M 확보 후 빌드 → 재시작 패턴. trap 으로 스크립트 실패해도 prod 복구
# 보장 (prod 가 정지된 채 남는 사고 차단).
# 트레이드오프: 매 머지마다 prod 가 추가로 ~5분 다운 (workflow 의 prod 배포 단계
# 후 또 한 번). 이미 redeploy-breaks-open-tabs 로 매 머지마다 prod restart 가
# 발생하니 다운타임 자체는 추가 5분 정도. monster-arena 는 7M 라 손대지 않음.
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

# 빌드 전 prod 정지 — 메모리 확보. trap 으로 스크립트 어느 단계에서 죽어도 복구.
echo "▶ stop prod (메모리 확보)"
sudo systemctl stop adventure-rpg
trap 'rc=$?; echo "▶ trap (exit=$rc): ensure prod restarted"; sudo systemctl start adventure-rpg || true' EXIT

echo "▶ build"
npm run build

echo "▶ restart test"
sudo systemctl restart adventure-rpg-test
sleep 2
sudo systemctl --no-pager status adventure-rpg-test | head -n 4

echo "▶ start prod"
sudo systemctl start adventure-rpg
sleep 2
sudo systemctl --no-pager status adventure-rpg | head -n 4
# 정상 종료 — trap 의 fallback 불필요.
trap - EXIT

echo "▶ health check"
curl -fsS -o /dev/null -w 'test_http=%{http_code}\n' http://127.0.0.1:3002/api/health || true
curl -fsS -o /dev/null -w 'prod_http=%{http_code}\n' http://127.0.0.1:3000/api/health || true

echo "▶ done"
