# 개척 노드 경로 일괄 선택 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 먼 개척 노드의 최단 경로와 활성 경로의 최소 반환 범위를 한 번에 미리 보고 원자적으로 적용한다.

**Architecture:** 탐사망 데이터 모듈에 서버와 클라이언트가 공유하는 순수 경로 계획 함수를 둔다. 서버 서비스와 API는 대상 노드 하나만 받아 현재 저장 상태에서 계획을 재계산하고 한 트랜잭션으로 적용한다. 화면 모델은 같은 계획으로 다중 노드·연결선과 합계 비용을 미리 보여 준다.

**Tech Stack:** TypeScript, React 19, Next.js 16 Route Handlers, Vitest, Testing Library

## Global Constraints

- 기존 `activate`, `refund`, `reset` 계약은 유지한다.
- 새 일괄 요청은 서버가 대상 노드로 경로를 재계산하며 클라이언트 노드 배열을 받지 않는다.
- 반환 범위는 선택 노드 제거 후 시작점에서 단절되는 활성 노드의 최소 집합이다.
- 반환 비용은 실제 해제 노드 수 × 50,000G다.
- 배포는 이 계획 범위에 포함하지 않는다.

---

### Task 1: 공유 경로 계획 함수

**Files:**
- Modify: `src/adventure/data/v2/unexploredTree.ts`
- Test: `src/adventure/data/v2/unexploredTree.test.ts`

**Interfaces:**
- Produces: `unexploredActivationPath(selectedNodeIds, targetNodeId, earnedPoints)`
- Produces: `unexploredRefundPath(selectedNodeIds, targetNodeId)`
- Both return a discriminated success `{ ok: true, nodeIds }` or existing domain error `{ ok: false, error }`.

- [ ] **Step 1: 최단 경로에서 미활성 노드만 순서대로 고르는 실패 테스트 작성**

  활성 `start`, `inner-0-0` 상태에서 더 먼 대상의 계획이 이미 활성인 두 노드를 제외하고 literal 예상 배열과 일치하는지 검증한다.

- [ ] **Step 2: 실패 확인**

  Run: `npx vitest run src/adventure/data/v2/unexploredTree.test.ts`

  Expected: 새 함수가 없어 FAIL.

- [ ] **Step 3: 활성화 계획 최소 구현**

  `shortestUnexploredPath`를 따라 미활성 노드마다 `unexploredActivationError`를 순차 적용하고 첫 오류 또는 전체 `nodeIds`를 반환한다.

- [ ] **Step 4: 포인트·전환 충돌·난이도 상한 실패 테스트와 구현**

  각 오류에서 일부 경로를 반환하지 않고 전체 계획이 실패하는지 검증한다.

- [ ] **Step 5: 최소 반환 집합 실패 테스트와 구현**

  대상 노드를 제외한 활성 그래프에서 `start` BFS를 수행하고, 도달하지 못한 노드와 대상을 기존 선택 순서의 역순으로 반환한다. 우회 연결이 있는 노드는 반환 집합에서 제외한다.

- [ ] **Step 6: 테스트 통과 확인**

  Run: `npx vitest run src/adventure/data/v2/unexploredTree.test.ts`

  Expected: PASS.

### Task 2: 원자적 서버 일괄 처리와 API

**Files:**
- Modify: `src/lib/server/unexploredService.ts`
- Modify: `src/app/api/v2/unexplored/route.ts`
- Test: `src/lib/server/unexploredService.test.ts`
- Test: `src/app/api/v2/unexplored/route.test.ts`

**Interfaces:**
- Consumes: Task 1의 경로 계획 함수.
- Produces: `UnexploredMutation`의 `activate_path`, `refund_path` 변형.

- [ ] **Step 1: 서비스 실패 테스트 작성**

  `activate_path`가 여러 노드를 한 번에 추가하고 최종 특화 풀 업적을 지급하는지, `refund_path`가 노드 수만큼 골드를 차감하는지, 골드 부족 시 캐릭터가 변하지 않는 오류를 반환하는지 검증한다.

- [ ] **Step 2: 실패 확인**

  Run: `npx vitest run src/lib/server/unexploredService.test.ts`

  Expected: 새 mutation 타입/분기가 없어 FAIL.

- [ ] **Step 3: 서비스 최소 구현**

  계획 성공 결과를 최종 `selectedNodeIds`에 적용하고, 반환은 `payRefundCost(character, nodeIds.length)`로 한 번 결제한다. 단일 액션 분기는 그대로 둔다.

- [ ] **Step 4: API 실패 테스트 작성**

  두 새 액션이 파싱되어 성공 시 `upsertSave` 한 번, 도메인 실패 시 409와 저장 0회를 만드는지 검증한다.

- [ ] **Step 5: 라우트 파서 구현과 통과 확인**

  Run: `npx vitest run src/lib/server/unexploredService.test.ts src/app/api/v2/unexplored/route.test.ts`

  Expected: PASS.

### Task 3: 다중 경로 미리보기와 일괄 버튼

**Files:**
- Modify: `src/adventure/v2/unexploredTreeModel.ts`
- Modify: `src/adventure/v2/V2UnexploredTreeView.tsx`
- Test: `src/adventure/v2/unexploredTreeModel.test.ts`
- Test: `src/adventure/v2/V2UnexploredTreeView.test.tsx`

**Interfaces:**
- Consumes: Task 1의 경로 계획 함수와 Task 2의 API 액션.
- Produces: 모델의 `activationNodeIds`, `refundNodeIds`, `plannedNodeCount`, `plannedRefundGoldCost`, `planError`.

- [ ] **Step 1: 모델 실패 테스트 작성**

  먼 미활성 대상의 모든 대기 노드와 미리보기 난이도, 활성 대상의 최소 반환 노드와 최종 예상 난이도를 literal 결과로 검증한다.

- [ ] **Step 2: 실패 확인 및 모델 구현**

  Run: `npx vitest run src/adventure/v2/unexploredTreeModel.test.ts`

  Expected before implementation: FAIL. Expected after implementation: PASS.

- [ ] **Step 3: 화면 실패 테스트 작성**

  먼 노드를 누른 뒤 `탐사 포인트 N 사용 · N개 활성화` 버튼과 `activate_path` 요청을 검증한다. 활성 중간 노드를 누른 뒤 총 골드·노드 수와 `refund_path` 요청을 검증한다.

- [ ] **Step 4: 화면 최소 구현**

  계획 노드와 연결선을 활성화/반환 색으로 표시하고 상세 패널 버튼 문구와 요청 액션을 교체한다. 기존 불투명 표면 상수는 유지한다.

- [ ] **Step 5: 관련 테스트와 정적 검사**

  Run: `npx vitest run src/adventure/data/v2/unexploredTree.test.ts src/lib/server/unexploredService.test.ts src/app/api/v2/unexplored/route.test.ts src/adventure/v2/unexploredTreeModel.test.ts src/adventure/v2/V2UnexploredTreeView.test.tsx`

  Run: `npx eslint src/adventure/data/v2/unexploredTree.ts src/lib/server/unexploredService.ts src/app/api/v2/unexplored/route.ts src/adventure/v2/unexploredTreeModel.ts src/adventure/v2/V2UnexploredTreeView.tsx`

  Run: `env NODE_OPTIONS=--max-old-space-size=4096 npx tsc --noEmit`

- [ ] **Step 6: 전체 검증**

  Run: `npm test`

  Run: `npm run build`

  Expected: 모든 명령 exit 0.

- [ ] **Step 7: 구현 커밋**

  `git add`로 관련 코드·테스트·문서를 스테이징하고 `git commit -m "feat: apply unexplored node paths in batches"`로 커밋한다.
