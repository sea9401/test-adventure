#!/usr/bin/env bash
# Build into the usual .next path while keeping the last successful build
# recoverable. If the new build fails, restore the previous output before the
# deploy workflow removes the maintenance page.
set -euo pipefail

cd "$(dirname "$0")/.."

PREVIOUS_BUILD=".next.previous"
ENV_PATH="${PRODUCTION_ENV_PATH:-/run/adventure-rpg/production.env}"
BUILD_ID="${DEPLOY_SHA:-$(git rev-parse --short HEAD)}"
NPM_BIN="$(command -v npm)"

restore_previous_build() {
  local build_status=$?
  if [ "$build_status" -ne 0 ]; then
    rm -rf .next
    if [ -d "$PREVIOUS_BUILD" ]; then
      mv "$PREVIOUS_BUILD" .next
      echo "✓ previous Next build restored"
    fi
  fi
  exit "$build_status"
}

trap restore_previous_build EXIT

rm -rf "$PREVIOUS_BUILD"
if [ -d .next ]; then
  mv .next "$PREVIOUS_BUILD"
fi

# 운영 EC2는 앱·스테이징과 빌드가 같은 호스트의 메모리를 공유한다. next build를
# 호스트에서 직접 실행하면 프리렌더 단계가 swap에 갇혀 SSH와 nginx까지 응답하지
# 못할 수 있다. 스테이징 빌드와 같은 검증된 상한을 적용하고, 15분 안에 끝나지
# 않으면 이 스크립트의 EXIT trap이 직전 정상 .next를 복원하도록 실패시킨다.
sudo systemd-run \
  --unit=adventure-production-build \
  --wait \
  --collect \
  --uid=ec2-user \
  --gid=ec2-user \
  --working-directory="$PWD" \
  -p CPUQuota=100% \
  -p MemoryHigh=1100M \
  -p MemoryMax=1300M \
  -p RuntimeMaxSec=15m \
  -p OOMPolicy=stop \
  -p Nice=10 \
  --setenv="BUILD_ID=$BUILD_ID" \
  --setenv="NODE_OPTIONS=--max-old-space-size=1152" \
  /usr/bin/node --env-file="$ENV_PATH" "$NPM_BIN" run build

rm -rf "$PREVIOUS_BUILD"
trap - EXIT
