# Farm Batch Actions Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 모험가 농장에서 수확, 선택 작물 심기, 유기질 거름 사용을 각각 최대 6칸까지 한 번에 실행한다.

**Architecture:** 클라이언트가 현재 화면의 대상 밭 ID를 밭 순서로 확정하고, 공용 순차 실행기가 기존 개별 API를 하나씩 호출한다. `useFarm`이 일괄 진행 상태와 요약 토스트를 소유하며, 재배 탭의 전용 액션 패널은 대상 수 계산과 버튼 표시만 담당한다.

**Tech Stack:** Next.js 16.2 Client Components, React 19, Tailwind CSS 4, Vitest

## Global Constraints

- 어떤 환경에도 배포하지 않는다.
- 밭은 최대 6칸이며 일괄 요청은 기존 개별 API를 병렬이 아닌 순차로 호출한다.
- 수확 보상, 농사 XP, 직업 숙련도, 길드 진행도, 숨겨진 도안과 텔레메트리 규칙을 변경하지 않는다.
- 일괄 실행 중 개별 밭 작업과 다른 일괄 작업을 모두 비활성화한다.
- 중간 실패 시 성공한 밭 상태를 유지하고 완료된 칸 수를 알린다.
- 새 패널은 `SURFACE_INSET` 불투명 표면을 사용한다.

---

### Task 1: 순차 농장 요청 실행기

**Files:**
- Create: `src/adventure/v2/farmBatchActions.ts`
- Create: `src/adventure/v2/farmBatchActions.test.ts`

**Interfaces:**
- Consumes: 기존 `/api/v2/farm/plant`, `/api/v2/farm/harvest`, `/api/v2/farm/fertilize` 응답의 `{ ok, error? }` 계약.
- Produces: `runFarmPlotBatch<T extends { ok: boolean; error?: string }>(options): Promise<{ completed: number; error: string | null }>`와 `FarmBatchAction = "plant" | "harvest" | "fertilize"`.

- [ ] **Step 1: 실패하는 순차 실행 테스트 작성**

  세 밭 ID와 가짜 `request`를 넘겨 `plant`가 `/api/v2/farm/plant`에
  `{ plotId, cropId }`를 입력 순서대로 보내고 각 성공 응답을 `onSuccess`에 전달하는지
  검증한다. 성공 응답마다 서로 다른 `farmVersion` 값 1, 2, 3을 넣어 `onSuccess`가
  세 값을 모두 받는지도 확인한다. 두 번째 응답이 실패하는 별도 테스트는 세 번째 요청이 실행되지 않고
  `{ completed: 1, error: "no_seed" }`를 반환하는지 검증한다.

- [ ] **Step 2: 테스트 실패 확인**

  Run: `npm test -- src/adventure/v2/farmBatchActions.test.ts`

  Expected: 모듈이 없어 import 단계에서 실패한다.

- [ ] **Step 3: 최소 순차 실행기 구현**

  `FarmBatchAction`별 엔드포인트를 상수 맵으로 정의한다. `runFarmPlotBatch`는 밭 ID를
  `for...of`로 순회해 JSON POST를 보내고, `plant`일 때만 `cropId`를 본문에 추가한다.
  HTTP 실패 또는 `ok !== true`이면 즉시 현재 완료 수와 오류 코드를 반환한다. 성공할
  때마다 `onSuccess(data)`를 호출하고 모두 끝나면 오류 `null`을 반환한다. 테스트용
  `request`는 기본값 `fetch`인 주입 인자로 둔다.

- [ ] **Step 4: 실행기 테스트 통과 확인**

  Run: `npm test -- src/adventure/v2/farmBatchActions.test.ts`

  Expected: 순서 보존과 중간 중단 테스트가 모두 통과한다.

- [ ] **Step 5: 실행기 커밋**

  ```bash
  git add src/adventure/v2/farmBatchActions.ts src/adventure/v2/farmBatchActions.test.ts
  git commit -m "feat: add sequential farm batch runner"
  ```

### Task 2: 농장 훅의 일괄 상태와 결과

**Files:**
- Modify: `src/adventure/v2/farmBatchActions.ts`
- Modify: `src/adventure/v2/useFarm.ts`
- Modify: `src/adventure/v2/farmBatchActions.test.ts`

**Interfaces:**
- Consumes: Task 1의 `runFarmPlotBatch`와 `FarmBatchAction`.
- Produces: `farmBatchOutcomeText(action, completed, error, cropName?)`, `FarmClientState.busyPlotAction`, `plantAll(plotIds, cropId)`, `harvestAll(plotIds)`, `fertilizeAll(plotIds)` 및 `FarmNotice`의 `batchPlant`, `batchHarvest`, `batchFertilizer` 변형.

- [ ] **Step 1: 일괄 결과 문구의 실패하는 테스트 작성**

  `farmBatchActions.test.ts`에서 아직 없는 `farmBatchOutcomeText`를 가져온다. 수확 3칸
  성공은 `3칸을 모두 수확했습니다.`, 밀 심기 2칸 성공은 `밀 2칸에 심었습니다.`,
  비료 1칸 성공은 `유기질 거름을 1칸에 뿌렸습니다.`를 반환하는지 검증한다. 한 칸
  성공 후 `no_seed`가 발생하면 `1칸 처리 후 일괄 작업이 중단되었습니다.`를, 성공 전
  `no_seed`면 기존 오류 코드가 그대로 반환되는지도 검증한다.

- [ ] **Step 2: 테스트 실패 확인**

  Run: `npm test -- src/adventure/v2/farmBatchActions.test.ts`

  Expected: `farmBatchOutcomeText` export가 없어 실패한다.

- [ ] **Step 3: 훅 구현**

  `farmBatchOutcomeText`를 테스트의 성공·부분 실패 규칙대로 구현한다. `useFarm`에
  `busyPlotAction` 상태를 추가한다. 기존 `apply`는 두 번째 인자
  `{ suppressActionNotice?: boolean }`를 받아 일괄 처리 중 `harvest`와 `fertilizer`
  개별 토스트만 생략하되 상태, 잔액, 마지막 결과와 알림 읽음 이벤트는 갱신한다.
  공용 `runBatch` 콜백은 `runFarmPlotBatch`의 성공마다 `apply`를 호출하고 완료 시
  작업별 요약 notice를 설정한다. 실패 시 성공 수가 1 이상이면
  `N칸 처리 후 일괄 작업이 중단되었습니다.`를, 성공 전 실패면 기존 오류 번역을
  표시한다. `finally`에서 `busyPlotAction`을 해제한다.

- [ ] **Step 4: 실행기 및 기존 농장 테스트 확인**

  Run: `npm test -- src/adventure/v2/farmBatchActions.test.ts src/adventure/v2/farm.test.ts`

  Expected: 모든 테스트가 통과한다.

- [ ] **Step 5: 훅 커밋**

  ```bash
  git add src/adventure/v2/farmBatchActions.ts src/adventure/v2/farmBatchActions.test.ts src/adventure/v2/useFarm.ts
  git commit -m "feat: add farm batch mutations"
  ```

### Task 3: 재배 탭 일괄 작업 패널

**Files:**
- Modify: `src/adventure/v2/AdventurerFarmPanel.tsx`
- Modify: `src/adventure/v2/AdventurerFarmPanel.test.tsx`

**Interfaces:**
- Consumes: Task 2의 `busyPlotAction`, `plantAll`, `harvestAll`, `fertilizeAll`.
- Produces: `FarmBatchActionPanel`과 현재 상태에서 계산된 세 작업의 대상 밭 ID 목록.

- [ ] **Step 1: 실패하는 UI 테스트 작성**

  `FarmBatchActionPanel`을 수확 2칸, 밀 심기 3칸, 비료 1칸으로 정적 렌더링해
  `aria-label="농장 일괄 작업"`, 세 버튼 문구와 `sm:grid-cols-3`을 검증한다. 대상이
  0인 버튼은 비활성화되고 `busyAction="harvest"`일 때 모든 버튼이 비활성화되며
  `모두 수확 중...`이 표시되는지도 검증한다.

- [ ] **Step 2: UI 테스트 실패 확인**

  Run: `npm test -- src/adventure/v2/AdventurerFarmPanel.test.tsx`

  Expected: `FarmBatchActionPanel` export가 없어 실패한다.

- [ ] **Step 3: 패널과 대상 계산 구현**

  `FarmBatchActionPanel`은 `SURFACE_INSET`과 모바일 1열/넓은 화면 3열 그리드를 사용한다.
  부모는 수확 가능한 밭, 빈 밭 중 선택 작물 씨앗 수만큼의 밭, 재배 중·미비료 밭 중
  비료 보유량만큼의 밭 ID를 각각 밭 순서대로 계산한다. 버튼 클릭은 해당 ID와 선택
  작물을 훅 메서드에 넘긴다. `busyPlotAction !== null`이면 모든 밭 카드의 `busy`도
  참으로 전달한다. 일괄 notice 세 종류는 처리한 칸 수를 토스트 문구로 변환한다.

- [ ] **Step 4: 전체 관련 검증 실행**

  Run: `npm test -- src/adventure/v2/farmBatchActions.test.ts src/adventure/v2/AdventurerFarmPanel.test.tsx src/adventure/v2/farm.test.ts src/lib/server/farmHarvestRoute.test.ts src/lib/server/farmingRateLimit.test.ts`

  Expected: 모든 관련 테스트가 통과한다.

  Run: `npx eslint src/adventure/v2/farmBatchActions.ts src/adventure/v2/farmBatchActions.test.ts src/adventure/v2/useFarm.ts src/adventure/v2/AdventurerFarmPanel.tsx src/adventure/v2/AdventurerFarmPanel.test.tsx`

  Expected: 오류와 경고 없이 종료한다.

  Run: `npx tsc --noEmit`

  Expected: 타입 오류 없이 종료한다.

  Run: `npm run build`

  Expected: Next.js 프로덕션 빌드가 성공한다.

- [ ] **Step 5: UI 커밋**

  ```bash
  git add docs/superpowers/plans/2026-08-16-farm-batch-actions.md src/adventure/v2/AdventurerFarmPanel.tsx src/adventure/v2/AdventurerFarmPanel.test.tsx
  git commit -m "feat: add farm batch action controls"
  ```
