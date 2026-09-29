#!/usr/bin/env bash
# 변경분의 추가된 줄에서 슬롭 UI 후보를 찾는다. 결과는 후보일 뿐 — 하나씩 판단할 것.
# 기본 범위: 작업 트리 + 스테이징(HEAD 대비) + 아직 추적 안 된 새 파일.
# 예: bash .claude/skills/anti-slop-ui/scan.sh              # 커밋 전 변경분
#     bash .claude/skills/anti-slop-ui/scan.sh HEAD~3       # 최근 3커밋 이후 변경분
#     bash .claude/skills/anti-slop-ui/scan.sh origin/main  # 브랜치 전체
set -u
cd "$(git rev-parse --show-toplevel)" || exit 1
range="${1:-HEAD}"
paths=('*.tsx' '*.ts' '*.css' ':!*.test.ts' ':!*.test.tsx' ':!*.spec.ts' ':!tests/**' ':!e2e/**' ':!docs/**' ':!scripts/**' ':!.claude/**')

# "파일:줄: 내용" 형식으로 추가된 줄만 뽑는다.
added=$(git diff "$range" --unified=0 -- "${paths[@]}" |
  awk '/^\+\+\+ /{f=substr($0,7);next} /^@@/{split($3,a,/[+,]/);n=a[2];next} /^\+/{print f":"n": "substr($0,2);n++}')
if [ -z "${1:-}" ]; then
  untracked=$(git ls-files --others --exclude-standard -z -- "${paths[@]}" |
    xargs -0 -r awk '{print FILENAME":"FNR": "$0}')
  added=$(printf '%s\n%s' "$added" "$untracked")
fi
# 주석 줄은 문구 검사에서 제외(개발 메모는 화면에 안 나감).
text_only=$(printf '%s\n' "$added" | grep -vP '^[^:]+:\d+: \s*(//|/\*|\*|\{/\*)')

total=0
check() {
  local label="$1" pattern="$2" src="${3:-$added}"
  local hits
  hits=$(printf '%s\n' "$src" | grep -P -- "$pattern")
  if [ -n "$hits" ]; then
    echo "== $label ($(printf '%s\n' "$hits" | wc -l))"
    printf '%s\n' "$hits" | cut -c1-220 | head -20
    echo
    total=$((total + 1))
  fi
}

# 1·2. 그라데이션·색
check "그라데이션(재질/등급 연출인지 확인)" 'bg-(gradient|linear|radial)-to-|\b(from|via)-[a-z]+-\d{2,3}\b|(linear|radial)-gradient\('
check "글자 그라데이션" 'bg-clip-text|background-clip:\s*text'
check "보라/네온 계열 색(코스메틱 외 금지)" '\b(bg|text|border|from|via|to|ring|shadow|fill|stroke)-(purple|violet|fuchsia)-|#(8b5cf6|7c3aed|a855f7|9333ea|6d28d9|c084fc|a78bfa|d946ef|ec4899)\b'
check "다크 유색 면(darkSurfaceAudit 대상)" 'dark:bg-(amber|orange|yellow|red|rose|violet|purple|indigo|blue|sky|cyan|teal|emerald|green|lime)-(900|950)'
# 3. 깜박임
check "반복 애니메이션(행동 유도·로딩 외 금지)" '\banimate-(pulse|ping|bounce)\b|animation:[^;]*infinite'
# 4. 알약
check "알약 라벨(아바타·점·바가 아니면 재고)" 'rounded-full[^"'"'"'`]*\bpx-|\bpx-[^"'"'"'`]*rounded-full|border-radius:\s*(999|9999)px'
# 5. 이모지(✓✗★✕☰⚠ 같은 기능 기호는 제외)
check "픽토그램 이모지" '[\x{1F300}-\x{1FAFF}\x{1F000}-\x{1F2FF}\x{2728}\x{2B50}\x{2694}\x{26A1}]' "$text_only"
# 7. 글꼴·코드 장식
check "새 글꼴" "(?i)font-family:[^;]*(Inter|JetBrains|Roboto|Poppins|Fira|Space Grotesk)|from ['\"]next/font/google['\"]"
check "코드 장식" '>\s*(//|>_|\[SYSTEM\])\s|["'"'"'`](//|>_) ' "$text_only"
# 8·10. 문구
check "홍보·과장 문구" '강력한|완벽한|혁신적|새로운 차원|한 단계 업그레이드|지금 바로 경험|풍성하게|더욱 편리|새로워진|환영합니다|(?i:seamless|elevate|supercharge|unleash|empower|next-generation)' "$text_only"
check "개발 맥락 누출 의심" '[가-힣][^"'"'"'`]{0,30}\b[vV]2\b|\b[vV]2\b[^"'"'"'`]{0,30}[가-힣]|신규 ?\d+종|리워크|요청(으로|에 따라)|관리자 요청|Built with|React로|Claude|AI가 만든' "$text_only"
# 9. 반투명·opacity
check "반투명 패널(SURFACE_* 사용·scrim/프로스티드만 예외)" '(^|[\s"'"'"'`:])bg-(white|black|zinc|slate|gray|neutral|stone|amber|sky|[a-z]+-\d{2,3})/\d+'
check "blur(SURFACE_FROSTED·모달 뒤 외 금지)" '\bbackdrop-blur|backdrop-filter'
check "컨테이너 opacity(비활성은 글자색으로)" '(?<![\w:-])opacity-(?!0\b|100\b)\d+'

if [ "$total" -eq 0 ]; then echo "후보 없음"; fi
exit 0
