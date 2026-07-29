#!/usr/bin/env bash
# 서버 밖에서 배포와 동일한 공개 출시 표면을 검사하고 실패를 webhook으로 알린다.
set -euo pipefail

# 예전 수동 실행 환경변수는 유지하되 단일 Node 검증기가 판정·재시도·알림을 담당한다.
export PUBLIC_RELEASE_BASE_URL="${PUBLIC_RELEASE_BASE_URL:-${UPTIME_BASE_URL:-https://msmsge.com}}"
export PUBLIC_RELEASE_RETRIES="${PUBLIC_RELEASE_RETRIES:-${UPTIME_RETRIES:-3}}"

retry_delay_seconds="${UPTIME_RETRY_DELAY:-3}"
if ! [[ "$retry_delay_seconds" =~ ^[0-9]+$ ]] || [ "$retry_delay_seconds" -le 0 ]; then
  retry_delay_seconds=3
fi
export PUBLIC_RELEASE_RETRY_DELAY_MS="${PUBLIC_RELEASE_RETRY_DELAY_MS:-$((retry_delay_seconds * 1000))}"

exec node scripts/check-public-release.mjs
