<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# Image assets

`public/images/` 안의 모든 그림은 카테고리별 max-width 규격으로 다운샘플 + WebP 변환된 상태다. 새 PNG를 추가하면 `npm run dev`/`npm run build` 시 `predev`/`prebuild` 훅이 `optimize-images` 스크립트를 자동으로 돌려 WebP로 교체하고 원본 PNG를 삭제한다 (스크립트는 idempotent — 이미 변환된 상태면 빠르게 통과). 새 카테고리 폴더를 만들 때는 `scripts/optimize-images.mjs` 상단 `PROFILES`에 max-width/quality를 한 줄 추가해야 처리된다. 카테고리 안의 서브폴더는 같은 프로필로 자동 재귀 처리.

## 파일명 컨벤션 + 검증

이미지 파일명은 **코드 식별자와 일치**해야 한다 — 매핑이 자동/암묵적으로 풀리도록.

- **지역 (`ui/`)**: `RegionId` 와 동일한 파일명. 예: `id: "plains"` → `ui/plains.webp`. `RegionBackground` 가 `/images/ui/${regionId}.webp` fallback 으로 자동 매핑하므로 `Region` 데이터에 `image:` override 를 두지 말 것.
- **NPC (`npc/`)**: `Npc.portrait` 에 명시. 새 NPC 추가 시 short-name 으로 통일 (`smith.webp`, `bold.webp`, `marin.webp` 식).
- **몬스터 (`monster/`)**: `Monster.image` 에 명시. 키는 한글, 파일은 영문 short-name.

`predev`/`prebuild` 가 `optimize-images` 다음에 `check-images` 를 돌려 두 가지를 검증한다:
1. **참조하지만 없는 파일** → 빌드 실패.
2. **있지만 참조 없는 고아 파일** → 경고 (CI 에서 엄격히 막으려면 `--strict`).

수동으로도 `npm run check-images` 로 언제든 점검 가능.

# UI 표면과 가독성

- 장면·지역 배경 이미지 위에 놓이는 **콘텐츠 본문, 감싸는 패널, 카드에는 불투명 배경을 기본값**으로 사용한다. 배경 그림이 텍스트나 컨트롤 뒤로 비치면 안 된다.
- 패널과 카드는 직접 `bg-*/40`, `bg-*/70`, `dark:bg-*/20` 같은 반투명 색을 만들지 말고 `src/components/ui/surfaces.ts`의 `SURFACE_CARD`, `SURFACE_INSET`, `SURFACE_ACCENT`를 사용한다.
- 반투명 표면은 `SURFACE_FROSTED`처럼 `backdrop-blur`가 함께 적용된 의도적인 프로스티드 헤더에만 허용한다.
- 잠긴 카드나 비활성 카드에 컨테이너 전체 `opacity-*`를 적용하지 않는다. 카드 배경은 불투명하게 유지하고 텍스트·아이콘 색으로 비활성 상태를 표현한다. 버튼의 `disabled:opacity-*`는 허용한다.
- 새 화면을 만들거나 기존 화면을 손볼 때 라이트·다크 모드 모두에서 최상위 콘텐츠 래퍼와 중첩 카드 사이로 배경 이미지가 새지 않는지 확인한다.
