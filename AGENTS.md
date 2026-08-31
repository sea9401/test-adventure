<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# 배포

- 사용자가 명시적으로 배포를 요청하기 전에는 어떤 환경에도 절대 배포하지 않는다.
- 일반 운영 배포에서는 변경 사항을 `main`에 병합한다. 정확한 main SHA의 CI와
  production-next-<SHA> 산출물이 준비되기 전에는 기존 서비스를 유지하고 별도로
  `bash deploy/maintenance.sh on`을 실행하지 않는다.
- 사용자가 점검 모드를 "지금 바로" 켜라고 명시하거나 서비스 지속이 위험한 장애 상황인
  경우에만 배포 준비 전 점검 모드를 즉시 켠다.
  일반적인 "점검 모드를 켜고 배포" 요청은 즉시 활성화 지시로 해석하지 않는다.
- 준비된 운영 배포는 기존 배포 워크플로가 산출물 검증과 전송을 끝낸 뒤 실제 런타임 교체
  직전에 점검 모드를 켜도록 맡긴다.
- 운영 배포와 롤백이 끝나도 점검 모드를 자동으로 해제하지 않는다. 사용자가 별도로
  점검 해제를 지시한 뒤에만 `bash deploy/maintenance.sh off`를 실행한다.

# Superpowers 시험 운용

- Superpowers는 중요한 기능 개발, 여러 단계의 변경, 로직 버그 조사에 우선 활용한다.
  단순 밸런스 수치, 문구, 정적 데이터, 설정 파일 변경에는 brainstorming 설계 문서와
  장문의 구현 계획을 생략할 수 있다.
- 사용자가 "진행", "구현", "수정"처럼 명확하게 로컬 변경을 요청하면 해당 범위의 조사,
  구현, 비파괴 검증, 커밋까지 승인한 것으로 본다. Superpowers의 설계 승인, 작성된 명세
  재검토, 실행 방식 선택을 각각 다시 묻지 말고 필요한 절차를 연속해서 수행한다.
- 결과를 크게 바꾸는 선택을 로컬 문맥으로 결정할 수 없거나, 요청 범위를 실질적으로
  확대하거나, 파괴적 작업·외부 쓰기·배포·추가 권한이 필요한 경우에만 질문한다. 그 밖의
  작은 불확실성은 합리적으로 가정하고 가정 내용을 작업 중 간단히 알린다.
- 동작 또는 로직을 바꾸는 기능과 버그 수정은 가능한 경우 회귀 테스트를 먼저 작성하고,
  원인 분석과 완료 전 검증을 적용한다. 테스트가 실익이 없거나 설정·생성 코드에 해당하면
  별도 확인 없이 TDD를 생략하고 그 이유만 작업 중 간단히 알린다.
- TDD를 다시 시작한다는 이유로 기존 코드, 사용자가 작성한 코드, 현재 작업 트리의 변경을
  삭제하지 않는다.
- 격리 작업 공간이 필요하면 프로젝트 내부 `.worktrees/`를 만들거나 `.gitignore`를 바꾸지
  말고 `/tmp` 아래에 생성한다. 이미 격리된 작업 공간이면 그대로 사용한다.
- 사용자가 명시적으로 요청하지 않으면 서브에이전트를 생성하지 않는다.
- 사용자가 스쿼시 대상 커밋이나 통합 방식을 지정했다면 일반적인 브랜치 완료 메뉴보다 그
  지시를 우선한다.
- 사용자가 통합·푸시·PR 생성을 요청하지 않았다면 완료된 변경은 현재 브랜치에 그대로 두고,
  일반적인 브랜치 완료 선택지를 반복해서 묻지 않는다.
- Superpowers의 시각적 브레인스토밍 동반 기능은 별도 요청이 있을 때만 사용한다.
- 위 규칙은 기존 배포 및 점검 모드 규칙을 완화하지 않는다.

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
