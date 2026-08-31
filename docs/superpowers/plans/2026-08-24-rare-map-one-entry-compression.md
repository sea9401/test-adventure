# 희귀 탐사 1회 압축 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 희귀 탐사 지도 한 장을 실제 전투 1회로 완료하면서 기존 30회/10회 보상 기대값과 확률 분포를 보존하고, 일반 사냥 버튼 바로 아래에서 열린 희귀 탐사로 진입할 수 있게 한다.

**Architecture:** 전투는 기존 `runOneHunt`로 한 번만 해결하고, 승리 뒤에만 지도 `runsLeft`를 보상 추첨 횟수로 사용한다. 경험치·골드·숙달은 횟수만큼 합산하고 드랍은 기존 1회 굴림을 독립적으로 반복하며, 전투 활동량·도감·퀘스트·길드 탐사는 실제 전투 1회만 기록한다. 클라이언트는 희귀 지도 API의 유효 지도를 만료 순으로 정렬해 일반 사냥 버튼 아래에 빠른 입장 UI를 표시한다.

**Tech Stack:** TypeScript, React 19, Next.js App Router route handlers, Vitest, React Testing Library, Tailwind CSS

## Global Constraints

- 배포하지 않는다.
- 기존 `RareMapInstance.runsLeft` 저장값을 남은 보상 추첨 횟수로 재해석해 마이그레이션 없이 호환한다.
- 승리 시에만 압축 보상을 지급하고 지도를 소모하며, 패배·오류 시 지도와 보상을 보존한다.
- 확률형 보상은 확률을 곱하지 않고 기존 드랍 함수를 30회 또는 10회 독립 실행한다.
- 전투 횟수, 몬스터 도감, 퀘스트, 길드 탐사 진행은 실제 전투 1회만 증가한다.
- 일반 사냥 재료·카드 표면은 기존 불투명 `Card`/surface 체계를 유지한다.
- Next.js route handler와 클라이언트 내비게이션은 `node_modules/next/dist/docs/`의 현재 문서를 따른다.

---

### Task 1: 압축 보상 순수 로직

**Files:**
- Modify: `src/app/api/v2/dungeon/hunt/huntRewards.ts`
- Modify: `src/app/api/v2/dungeon/hunt/huntRewards.test.ts`
- Modify: `src/app/api/v2/dungeon/hunt/huntDrops.ts`
- Modify: `src/app/api/v2/dungeon/hunt/huntDrops.test.ts`
- Modify: `src/app/api/v2/dungeon/hunt/huntProficiency.ts`
- Modify: `src/app/api/v2/dungeon/hunt/huntProficiency.test.ts`
- Modify: `src/app/api/v2/dungeon/hunt/huntRareMaps.ts`
- Modify: `src/app/api/v2/dungeon/hunt/huntRareMaps.test.ts`

**Interfaces:**
- Produces: `rareMapRewardRolls(activeRareMap, won): number`
- Produces: `multiplyHuntReward(value, rewardRolls): number`
- Produces: `rollHuntDropsRepeated(params & { rewardRolls }): HuntRepeatedDropResult`
- Extends: `applyHuntProficiency(..., rewardWins?: number)`

- [ ] **Step 1: Write failing reward and lifecycle tests**

```ts
expect(rareMapRewardRolls({ ...map, runsLeft: 30 }, true)).toBe(30);
expect(rareMapRewardRolls({ ...map, runsLeft: 30 }, false)).toBe(1);
expect(multiplyHuntReward(3_285, 30)).toBe(98_550);
expect(updateRareMaps({ activeRareMap: map, rareMaps: [map], won: false, depth: 84, now: 1 }).rareMaps).toEqual([map]);
expect(updateRareMaps({ activeRareMap: map, rareMaps: [map], won: true, depth: 84, now: 1 }).rareMaps).toEqual([]);
```

- [ ] **Step 2: Run focused tests and verify RED**

Run: `npm test -- src/app/api/v2/dungeon/hunt/huntRewards.test.ts src/app/api/v2/dungeon/hunt/huntRareMaps.test.ts`
Expected: FAIL because compressed reward helpers do not exist and active maps still decrement on defeat.

- [ ] **Step 3: Implement minimal currency and map lifecycle helpers**

```ts
export function rareMapRewardRolls(map: RareMapInstance | null, won: boolean) {
  return map && won ? Math.max(1, Math.floor(map.runsLeft)) : 1;
}

export function multiplyHuntReward(value: number, rewardRolls: number) {
  return Math.max(0, Math.round(value)) * Math.max(1, Math.floor(rewardRolls));
}
```

Change `updateRareMaps` so an active map is removed only on victory and is unchanged on defeat.

- [ ] **Step 4: Write failing repeated-drop and proficiency tests**

```ts
expect(result.droppedEquipments).toHaveLength(3);
expect(result.droppedUniques).toHaveLength(3);
expect(result.nextOwned).toHaveLength(6);
expect(proficiency.proficiencyGained).toBe(150);
expect(proficiency.masteryGained).toBe(30);
```

- [ ] **Step 5: Run focused tests and verify RED**

Run: `npm test -- src/app/api/v2/dungeon/hunt/huntDrops.test.ts src/app/api/v2/dungeon/hunt/huntProficiency.test.ts`
Expected: FAIL because repeated settlement and `rewardWins` are not implemented.

- [ ] **Step 6: Implement repeated drops and progression**

`rollHuntDropsRepeated` must call the real `rollHuntDrops` sequentially, pass each result's `nextOwned` into the next roll, sum material quantities, and return every equipment/unique id. `applyHuntProficiency` must loop `rewardWins` times for point and mastery rewards while keeping level-growth rolls tied to actual levels gained.

- [ ] **Step 7: Run all Task 1 tests and verify GREEN**

Run: `npm test -- src/app/api/v2/dungeon/hunt/huntRewards.test.ts src/app/api/v2/dungeon/hunt/huntDrops.test.ts src/app/api/v2/dungeon/hunt/huntProficiency.test.ts src/app/api/v2/dungeon/hunt/huntRareMaps.test.ts`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add src/app/api/v2/dungeon/hunt
git commit -m "feat: add compressed rare map reward settlement"
```

### Task 2: 사냥 route 원자적 압축 정산

**Files:**
- Modify: `src/app/api/v2/dungeon/hunt/route.ts`
- Test: focused helper tests from Task 1 plus TypeScript/build verification

**Interfaces:**
- Consumes: `rareMapRewardRolls`, `multiplyHuntReward`, `rollHuntDropsRepeated`, `applyHuntProficiency({ rewardWins })`
- Produces response fields: `rewardRolls`, `droppedEquipments`, `droppedUniques`

- [ ] **Step 1: Add a failing request-count normalization test**

Add a pure exported helper near the POST parsing boundary and assert that a rare-map request always resolves to one actual battle even if the client sends `count: 50`, while ordinary requests preserve their validated count.

- [ ] **Step 2: Run the focused test and verify RED**

Run: `npm test -- src/app/api/v2/dungeon/hunt/huntRewards.test.ts`
Expected: FAIL because request-count normalization is absent.

- [ ] **Step 3: Wire one battle plus compressed settlement**

After battle resolution, derive `rewardRolls`. Multiply the finalized per-roll EXP/gold and reported bonus deltas, run `rollHuntDropsRepeated`, apply EXP/gold once, pass `rewardWins` into proficiency, expose all dropped equipment ids, and keep kill/codex/guild exploration events at one actual victory. Force rare-map POST requests through the single-battle path.

- [ ] **Step 4: Preserve response compatibility**

Keep `droppedEquipment` and `droppedUnique` as the first item aliases, add plural arrays for compressed results, set `rareMapRunsLeft` to `0` only after a successful settlement, and leave it unchanged on defeat.

- [ ] **Step 5: Run server tests and typecheck**

Run: `npm test -- src/app/api/v2/dungeon/hunt`
Run: `npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/app/api/v2/dungeon/hunt/route.ts src/app/api/v2/dungeon/hunt
git commit -m "feat: settle rare maps in one battle"
```

### Task 3: 일반 사냥 화면 빠른 입장과 결과 표시

**Files:**
- Create: `src/adventure/v2/RareMapQuickEntry.tsx`
- Create: `src/adventure/v2/RareMapQuickEntry.test.tsx`
- Modify: `src/adventure/v2/V2DungeonFloorView.tsx`
- Modify: `src/adventure/v2/V2DungeonFloorView.test.tsx`
- Modify: `src/adventure/v2/V2DungeonFloorView.rareMapState.test.tsx`
- Modify: `src/adventure/v2/HuntResultCard.tsx`
- Modify: `src/adventure/v2/HuntResultCard.test.tsx`

**Interfaces:**
- Produces: `sortHuntRareMaps(maps): RareMapInstance[]`
- Produces: `<RareMapQuickEntry maps serverNow onEnter />`
- Consumes plural compressed drop fields in `HuntResult`.

- [ ] **Step 1: Write failing quick-entry component tests**

Assert that hunt maps are sorted by expiry, utility/location maps are excluded, the first map is the primary action, multiple maps expose `다른 지도`, and the text contains map name, stage, count, and remaining time.

- [ ] **Step 2: Run and verify RED**

Run: `npm test -- src/adventure/v2/RareMapQuickEntry.test.tsx`
Expected: FAIL because the component does not exist.

- [ ] **Step 3: Implement the quick-entry component**

Use an opaque `Card`, a full-width primary button labeled `희귀 탐사 · {name}`, metadata for `{huntStageName(depth)} · 지도 {N}개`, the existing countdown component, and a `다른 지도` disclosure for the remaining maps.

- [ ] **Step 4: Write failing floor/result behavior tests**

Assert that the quick entry renders immediately after the normal hunt action, rare-map mode labels the main action `희귀 탐사 시작`, progress text says `보상 30회분`, victory removes the active map locally, defeat keeps it, and plural equipment rewards all render.

- [ ] **Step 5: Run and verify RED**

Run: `npm test -- src/adventure/v2/V2DungeonFloorView.test.tsx src/adventure/v2/V2DungeonFloorView.rareMapState.test.tsx src/adventure/v2/HuntResultCard.test.tsx`
Expected: FAIL on the new assertions.

- [ ] **Step 6: Integrate floor state and compressed result UI**

Fetch valid maps for both normal and rare-map modes, append maps discovered by single/batch results, remove the active map only after a successful compressed result, force rare-map UI to call one hunt, render the quick-entry block below the main hunt button, and show every item from plural drop arrays.

- [ ] **Step 7: Run UI tests and verify GREEN**

Run: `npm test -- src/adventure/v2/RareMapQuickEntry.test.tsx src/adventure/v2/V2DungeonFloorView.test.tsx src/adventure/v2/V2DungeonFloorView.rareMapState.test.tsx src/adventure/v2/HuntResultCard.test.tsx`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add src/adventure/v2/RareMapQuickEntry.tsx src/adventure/v2/RareMapQuickEntry.test.tsx src/adventure/v2/V2DungeonFloorView.tsx src/adventure/v2/V2DungeonFloorView.test.tsx src/adventure/v2/V2DungeonFloorView.rareMapState.test.tsx src/adventure/v2/HuntResultCard.tsx src/adventure/v2/HuntResultCard.test.tsx
git commit -m "feat: add rare map quick entry to hunting"
```

### Task 4: 지도 목록 문구와 일괄 발견 요약

**Files:**
- Modify: `src/adventure/v2/V2DungeonList.tsx`
- Modify: `src/adventure/v2/V2DungeonList.render.test.tsx`
- Modify: `src/adventure/v2/BatchSummaryCard.tsx`
- Modify: `src/adventure/v2/HuntResultCard.test.tsx`

**Interfaces:**
- Consumes: existing `RareMapInstance` list and `onEnterRareMap` callback.

- [ ] **Step 1: Write failing copy and grouping tests**

Assert that map cards say `1회 탐사 · 보상 30회분`, and a batch with three hunt maps shows one `희귀 탐사 3개 발견` summary instead of three stacked discovery notices while keeping each map selectable.

- [ ] **Step 2: Run and verify RED**

Run: `npm test -- src/adventure/v2/V2DungeonList.render.test.tsx src/adventure/v2/HuntResultCard.test.tsx`
Expected: FAIL on old remaining-battle copy and per-map banners.

- [ ] **Step 3: Implement copy and grouped discovery UI**

Change remaining-run wording to reward-roll wording. Group batch-discovered hunt maps in one notice, use the earliest-expiring map as the primary action, and expose the remaining maps in the same grouped block without stacking banners.

- [ ] **Step 4: Run tests and verify GREEN**

Run: `npm test -- src/adventure/v2/V2DungeonList.render.test.tsx src/adventure/v2/HuntResultCard.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/adventure/v2/V2DungeonList.tsx src/adventure/v2/V2DungeonList.render.test.tsx src/adventure/v2/BatchSummaryCard.tsx src/adventure/v2/HuntResultCard.test.tsx
git commit -m "feat: summarize rare map discoveries"
```

### Task 5: 전체 검증과 현재 브랜치 통합

**Files:**
- Verify all changed files
- Update plan checkboxes as execution record if useful

- [ ] **Step 1: Run focused regression suite**

Run: `npm test -- src/app/api/v2/dungeon/hunt src/adventure/v2/RareMapQuickEntry.test.tsx src/adventure/v2/V2DungeonFloorView.test.tsx src/adventure/v2/V2DungeonFloorView.rareMapState.test.tsx src/adventure/v2/V2DungeonList.render.test.tsx src/adventure/v2/HuntResultCard.test.tsx`
Expected: PASS.

- [ ] **Step 2: Run static and full verification**

Run: `npx tsc --noEmit`
Run: `npm run lint -- --quiet`
Run: `npm test`
Run: `npm run build`
Expected: all commands exit 0.

- [ ] **Step 3: Review spec coverage and diff**

Verify one battle, victory-only consumption, 30/10 independent reward rolls, one activity increment, compatibility fields, quick-entry placement, grouped discoveries, expiry handling, and no deployment/config changes.

- [ ] **Step 4: Integrate without overwriting user changes**

Fast-forward or cherry-pick the verified feature commits onto `fix/cooking-codex-pagination`. If the dirty `V2DungeonList.tsx` overlaps, reapply only the feature hunks to the user's current file and stage only those hunks.

- [ ] **Step 5: Verify the integrated current branch and commit state**

Run the focused regression suite from `/home/sea9401/test-adventure`, inspect `git status --short`, and report the implementation commits while leaving unrelated user modifications untouched.
