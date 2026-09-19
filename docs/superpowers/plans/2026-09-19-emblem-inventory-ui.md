# Emblem Inventory UI Implementation Plan

> **For agentic workers:** Use superpowers:executing-plans inline. AGENTS.md에 따라 서브에이전트나 추가 승인 단계 없이 진행한다.

**Goal:** 피드백 #691의 종류·등급 정렬과 네 슬롯의 장착 상태 식별을 제공한다.

**Architecture:** 순수 정렬 함수가 원래 문장 번호를 보존한 표시 목록을 만든다. 기존 클라이언트 화면이 정렬 상태와 IID 기반 장착 배지를 렌더링한다.

**Tech Stack:** Next.js 16.3.3, React 19, TypeScript, Vitest, Testing Library.

## Global Constraints

- 종류순 → 같은 종류는 등급 내림차순, 등급순 → 같은 등급은 종류순, 동률은 획득순.
- 보유 배열, 서버 요청의 IID, 합성 재료 제외 규칙을 보존한다.
- `SURFACE_CARD`와 `SURFACE_INSET`으로 라이트·다크 불투명 표면을 유지한다.
- 현재 화면 안에서만 정렬 선택을 유지하며 서버 저장·배포는 하지 않는다.

## Task 1: 정렬 모델과 회귀 테스트

Files: `src/adventure/v2/emblemInventory.ts`, `src/adventure/v2/emblemInventory.test.ts`

Interface:
```ts
type EmblemSort = "kind" | "grade" | "acquired";
function sortEmblemInventory(owned: readonly Emblem[], sort: EmblemSort): { item: Emblem; number: number }[];
```

- [x] 섞인 종류·등급과 동일 종류·등급의 여러 개체로 각 정렬 순서, 원본 번호, 원본 불변성, 빈 목록 테스트를 작성한다.
- [x] `npm test -- src/adventure/v2/emblemInventory.test.ts`로 실패를 확인한다.
- [x] `owned.map((item, index) => ({ item, number: index + 1 }))` 사본에 종류/등급 비교와 `number` 동률 비교를 적용한다.
- [x] 위 테스트를 다시 실행해 통과를 확인한다.

## Task 2: 정렬 컨트롤과 장착 배지

Files: `src/adventure/v2/V2EmblemView.tsx`, `src/adventure/v2/V2EmblemView.test.tsx`

- [x] 정렬 컨트롤 전환, IID별 네 슬롯 배지, 정렬 후 장착/해제 갱신과 합성 요청 테스트를 먼저 추가해 실패를 확인한다.
- [x] `useState<EmblemSort>("kind")`와 접근 가능한 `문장 정렬` select를 연결한다.
- [x] 정렬된 `{ item, number }`로 렌더링하고 `state.slots.indexOf(item.iid)`가 0 이상이면 제목 옆에 배지를 표시한다.
- [x] 다음 검증을 실행하고 diff를 직접 리뷰한다.

```sh
npm test -- src/adventure/v2/emblemInventory.test.ts src/adventure/v2/V2EmblemView.test.tsx src/adventure/data/v2/emblems.test.ts src/app/api/v2/emblems/route.test.ts src/lib/server/emblemLevelGrowth.test.ts
node --max-old-space-size=8192 node_modules/typescript/bin/tsc --noEmit
npx eslint src/adventure/v2/emblemInventory.ts src/adventure/v2/emblemInventory.test.ts src/adventure/v2/V2EmblemView.tsx src/adventure/v2/V2EmblemView.test.tsx
git diff --check
```

- [x] 확인된 결과를 기록하고 로컬 커밋을 만든다. 브랜치 통합·푸시·배포는 하지 않는다.

## 검증 결과

- 기존 화면·도메인 테스트 25개 통과를 확인한 뒤 구현했다. 신규 화면 테스트 4개는 기존 정렬·표시에서 실패함을 확인했다.
- 정렬 모델·화면·도메인·API·레벨 성장 테스트 5개 파일, 41개 테스트 통과.
- 변경 TypeScript 파일 ESLint 및 `git diff --check` 통과.
- 전체 TypeScript 검사 통과. 첫 시도는 Node 기본 약 2GB 힙 한도로 중단되어 검사 프로세스만 8GB 한도로 재실행했다.
- 실제 Next.js 개발 서버와 Chromium에서 320·390·1280px × 라이트·다크 6조합 확인. 정렬 전환, 네 배지, 가로 넘침 없음, 불투명 표면을 검증했다.
- 화면 검증은 로컬 문장 API fixture를 사용했다. 스크린샷은 `/tmp/emblem-ui-691-screenshots/`에 저장했다.
- 모바일에서는 배지 유무에 관계없이 버튼 행 위치가 일정하도록 세로 배치를 적용했다. 임시 미리보기 라우트와 개발 서버가 만든 AGENTS.md 변경은 제거했다.
