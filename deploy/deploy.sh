#!/usr/bin/env bash
# EC2 인스턴스 안에서 도는 배포 스크립트.
#   수동: ssh ... 'cd ~/adventure-rpg && ./deploy/deploy.sh'
#   자동: .github/workflows/deploy.yml 이 main push 시 SSH 로 호출.
set -euo pipefail

cd "$(dirname "$0")/.."
echo "▶ deploy: $(date -u +%FT%TZ)"
PRODUCTION_ENV_PATH="${PRODUCTION_ENV_PATH:-/run/adventure-rpg/production.env}"
export PRODUCTION_ENV_PATH

echo "▶ git pull"
git fetch --prune origin
git checkout main
git reset --hard origin/main   # 로컬 변경 무시하고 origin/main 에 맞춤

bash deploy/release-production.sh

echo "▶ public release smoke"
PUBLIC_RELEASE_EXPECTED_BUILD_ID="${DEPLOY_SHA:-$(git rev-parse --short HEAD)}" \
  npm run check-public-release

echo "▶ done"
