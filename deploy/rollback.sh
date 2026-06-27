#!/usr/bin/env bash
# 긴급 배포 롤백 — EC2 에서 직전 정상 커밋으로 빠르게 되돌린다 (reset → 의존성 → build → restart → health).
# 배포 파이프(deploy.yml)와 동일 단계를 origin/main 대신 지정 커밋으로 수행.
#
# ⚠️ 이건 EC2 "로컬" 롤백이다. origin/main 은 그대로라, 곧바로 main 도 고쳐야 한다:
#       git revert <나쁜커밋> && git push     (안 하면 다음 배포가 나쁜 코드를 다시 당겨온다)
# ⚠️ 나쁜 배포가 DB 마이그레이션을 포함했다면 코드 롤백만으론 부족 —
#       백업 복원(deploy/backup-db.sh 산출물) 또는 교정 마이그가 필요. 스키마-코드 정합 확인.
# 💡 롤백 중 유저에게 점검 페이지를 보이려면 먼저:  bash deploy/maintenance.sh on   (끝나면 off)
#
# 사용:  bash deploy/rollback.sh           # 최근 커밋 목록(어디로 되돌릴지 고르기)
#        bash deploy/rollback.sh <sha>     # 그 커밋으로 롤백
set -eo pipefail
cd "$(dirname "$0")/.."

TARGET="${1:-}"
if [ -z "$TARGET" ]; then
  echo "현재: $(git rev-parse --short HEAD)  $(git log -1 --pretty=%s)"
  echo
  echo "최근 커밋 (롤백 대상 후보):"
  git log --oneline -15 | cat
  echo
  echo "사용: bash deploy/rollback.sh <sha>"
  echo "(직전 '정상' 커밋 = 마지막으로 성공한 배포 Action 의 커밋. GitHub Actions 히스토리 참고.)"
  exit 0
fi

if ! git cat-file -e "${TARGET}^{commit}" 2>/dev/null; then
  echo "ERROR: 커밋 '$TARGET' 을 찾을 수 없음 (git fetch 후 재시도)" >&2
  exit 1
fi

FROM=$(git rev-parse --short HEAD)
TO=$(git rev-parse --short "$TARGET")
echo "롤백: $FROM → $TO   [$(git log -1 --pretty=%s "$TARGET")]"

git reset --hard "$TARGET"
bash deploy/install-deps.sh
npm run build
sudo systemctl restart adventure-rpg
sleep 3

echo
echo "service : $(systemctl is-active adventure-rpg)"
echo "health  : $(curl -s -o /dev/null -w '%{http_code}' --max-time 10 https://msmsge.com/api/health)  (200 기대)"
echo "현재커밋: $(git rev-parse --short HEAD)  $(git log -1 --pretty=%s)"
echo
echo "⚠️ 다음 단계 필수 — origin/main 을 고쳐라:  git revert <나쁜커밋> && git push"
echo "   (안 하면 다음 배포의 'git reset --hard origin/main' 이 나쁜 코드를 다시 당겨온다.)"
