# Rare Map Return Hunt Session Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 희귀 탐사에서 같은 층의 일반 사냥으로 복귀한 직후에도 사냥 버튼이 이전 요청 상태에 막히지 않게 한다.

**Architecture:** `DungeonFloorPage`가 `floorId`와 `rareMapIid`를 전투 세션 식별자로 사용해 `V2DungeonFloorView`의 생명주기를 구분한다. 실제 페이지 컴포넌트를 렌더하는 회귀 테스트로 검색 매개변수 전환 시 일시 상태가 초기화되는 사용자 동작을 검증한다.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript, Vitest, Testing Library

## Global Constraints

- 배포하지 않는다.
- 서버 사냥 API와 저장 데이터 형식은 변경하지 않는다.
- 테스트를 먼저 실패시킨 뒤 최소 구현을 적용한다.

---

### Task 1: 전투 문맥 전환 시 화면 상태 격리

**Files:**
- Create: `src/app/(game)/battle/dungeon/[floorId]/page.test.tsx`
- Modify: `src/app/(game)/battle/dungeon/[floorId]/page.tsx`

**Interfaces:**
- Consumes: `floorId: number`, `rareMapIid: string | null`
- Produces: React element key `${floorId}:${rareMapIid ?? "normal"}`

- [x] **Step 1: Write the failing test**

실제 `DungeonFloorPage`를 희귀 탐사 쿼리로 렌더하고 해결되지 않은 사냥 요청으로 `busy` 상태를 만든다. 같은 렌더 트리에서 쿼리를 제거한 뒤 일반 사냥 버튼의 `disabled`가 `false`인지 단언한다.

- [x] **Step 2: Run test to verify it fails**

Run: `npm test -- 'src/app/(game)/battle/dungeon/[floorId]/page.test.tsx'`

Expected: 일반 사냥 버튼이 이전 희귀 탐사의 `busy` 상태를 이어받아 비활성이라는 단언 실패.

- [x] **Step 3: Write minimal implementation**

`V2DungeonFloorView`에 다음 세션 key를 지정한다.

```tsx
key={`${n}:${rareMapIid ?? "normal"}`}
```

- [x] **Step 4: Run focused and related tests**

Run: `npm test -- 'src/app/(game)/battle/dungeon/[floorId]/page.test.tsx' src/adventure/v2/V2DungeonFloorView.rareMapState.test.tsx src/adventure/v2/V2DungeonFloorView.autoHunt.test.tsx`

Expected: 모든 테스트 통과.

- [x] **Step 5: Run static verification**

Run: `npx tsc --noEmit`

Expected: exit code 0.

- [x] **Step 6: Review and commit**

`git diff --check`, `git status --short`, 관련 diff를 확인한 뒤 테스트와 구현을 하나의 버그 수정 커밋으로 기록한다.
