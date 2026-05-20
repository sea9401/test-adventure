#!/usr/bin/env bash
# 의존성 설치 — package-lock.json 이 바뀐 경우(또는 node_modules 부재)에만 npm ci.
#
# 배포가 main 머지마다 도는데, 대부분의 머지는 의존성 변경이 없다. 그럴 때 npm ci 를
# 건너뛰면 배포가 빨라지고, npm ci 가 node_modules 를 통째로 지웠다 다시 까는 "위험 창"
# 자체가 사라진다 (그 창에 돌고 있는 서버가 lazy-require 하다 죽는 일 방지).
#
# 변경 판단은 package-lock.json 의 sha256 을 마커 파일과 비교 — git diff 로 PREV/NEW 를
# 넘길 필요가 없어 deploy.yml 인라인 스크립트에 if/subshell 을 추가하지 않아도 된다
# (그 인라인 스크립트는 multi-line if/subshell 에 약한 이력이 있어 한 줄 호출로만 끼운다).
#
# 마커는 node_modules 안에 둔다 — npm ci 가 node_modules 를 지우면 마커도 함께 사라져
# 자동으로 무효화된다. 마커 기록은 반드시 npm ci 성공 *후*.
set -euo pipefail

cd "$(dirname "$0")/.."

LOCKFILE="package-lock.json"
MARKER="node_modules/.deps-lock-hash"

current_hash() {
  sha256sum "$LOCKFILE" | cut -d' ' -f1
}

if [ -d node_modules ] && [ -f "$MARKER" ] && [ "$(cat "$MARKER")" = "$(current_hash)" ]; then
  echo "▶ npm ci skipped ($LOCKFILE 변경 없음)"
  exit 0
fi

echo "▶ npm ci ($LOCKFILE 변경 또는 node_modules 부재)"
npm ci
current_hash > "$MARKER"
