# Life Level 100 Expansion Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 농사·벌목·채광·낚시·요리를 기존 Lv.1~50 호환성을 유지한 채 Lv.100까지 확장하고, 구 초과 경험치 환산·직종별 후반 보너스·마일스톤·UI와 랭킹을 일관되게 연결한다.

**Architecture:** `lifeLevelProgression.ts`가 Lv.51~100 공통 곡선, 구 경험치 1회 환산, Lv.100 XP 상한을 소유한다. 각 생활 모듈은 기존 Lv.1~50 기준 함수를 보존하고 공통 코어에 자기 `T50`을 전달하며, 수동·자동 쓰기 경로는 파싱 직후 환산된 상태에서 XP를 가산한다. 후반 효율은 `lifeLevelBonuses.ts`의 순수 함수로 분리해 도메인과 API가 같은 값을 사용한다.

**Tech Stack:** TypeScript, Next.js App Router route handlers, React server-render tests, Vitest, existing saves-kv transaction helpers

## Global Constraints

- 농사·벌목·채광·낚시·요리의 최종 레벨은 모두 100이며 생활 숙련도 합계 상한은 500이다.
- Lv.1~50 누적 XP 기준과 기존 생산 효과·해금·업적 ID는 바꾸지 않는다.
- Lv.50→100 요구 XP는 각 직종 Lv.1→50 요구 XP의 정확히 4배다.
- 후반 함수는 `F(x) = 0.5x + 0.5x³`, `x = (L - 50) / 50`을 사용한다.
- 구 Lv.50 초과 XP는 25%만 인정하고 새 Lv.60 기준 XP에서 제한한다.
- `LIFE_LEVEL_CURVE_VERSION = 2`; 읽기는 미리보기만, 쓰기는 기존 잠금 트랜잭션 안에서 버전과 XP를 함께 저장한다.
- Lv.100 이후 XP만 멈추며 재료·기록·도감·직업 숙련 보상은 계속 지급한다.
- 신규 작물·요리법·어종·채집지·광맥·생활 화폐는 추가하지 않는다.
- 배포하지 않는다. 관련 없는 사용자 변경과 공유 작업 트리 파일은 스테이징하거나 수정하지 않는다.
- Next.js 코드를 수정하기 전에 `node_modules/next/dist/docs/01-app/01-getting-started/05-server-and-client-components.md`와 `node_modules/next/dist/docs/01-app/02-guides/testing/vitest.md`를 읽는다.

---

### Task 1: 공통 Lv.100 곡선과 구 XP 환산 코어

**Files:**
- Create: `src/adventure/v2/lifeLevelProgression.ts`
- Create: `src/adventure/v2/lifeLevelProgression.test.ts`

**Interfaces:**
- Produces: `LIFE_LEVEL_CAP`, `LIFE_LEGACY_LEVEL_CAP`, `LIFE_LEVEL_CURVE_VERSION`
- Produces: `extendedLifeXpThreshold(level, legacyThreshold): number`
- Produces: `extendedLifeLevelForXp(xp, legacyThreshold): number`
- Produces: `normalizeLifeXp({ xp, levelCurveVersion, legacyThreshold }): LifeXpNormalization`
- Produces: `applyLifeXpGain({ xp, gainedXp, legacyThreshold }): { xp; appliedXp }`
- Produces: `lifeLevelProgress({ xp, legacyThreshold }): { level; xpIntoLevel; xpForNext; maxLevel }`

- [ ] **Step 1: Write the failing curve tests**

```ts
const legacy = (level: number) => (Math.max(1, Math.min(50, level)) - 1) ** 2 * 10;

expect(extendedLifeXpThreshold(50, legacy)).toBe(24_010);
expect(extendedLifeXpThreshold(60, legacy)).toBe(33_998);
expect(extendedLifeXpThreshold(100, legacy)).toBe(120_050);
expect(extendedLifeXpThreshold(100, legacy) - legacy(50)).toBe(
  legacy(50) * 4,
);
expect(extendedLifeLevelForXp(Number.MAX_SAFE_INTEGER, legacy)).toBe(100);
```

Add a loop asserting thresholds and per-level deltas are increasing from Lv.51 through 100 and the Lv.100 delta is larger than the Lv.80 delta.

- [ ] **Step 2: Run the curve test and verify RED**

Run: `npm test -- src/adventure/v2/lifeLevelProgression.test.ts`

Expected: FAIL because `lifeLevelProgression.ts` does not exist.

- [ ] **Step 3: Implement the threshold and inverse functions**

```ts
export const LIFE_LEGACY_LEVEL_CAP = 50;
export const LIFE_LEVEL_CAP = 100;
export const LIFE_LEVEL_CURVE_VERSION = 2;

export function extendedLifeXpThreshold(
  level: number,
  legacyThreshold: (level: number) => number,
): number {
  const safeLevel = Math.max(1, Math.min(LIFE_LEVEL_CAP, Math.floor(level) || 1));
  if (safeLevel <= LIFE_LEGACY_LEVEL_CAP) return legacyThreshold(safeLevel);
  const t50 = legacyThreshold(LIFE_LEGACY_LEVEL_CAP);
  const x = (safeLevel - LIFE_LEGACY_LEVEL_CAP) / 50;
  return t50 + Math.round(4 * t50 * (0.5 * x + 0.5 * x ** 3));
}
```

Use a bounded binary search over levels 1~100 for `extendedLifeLevelForXp`; do not invert the cubic with floating-point roots.

- [ ] **Step 4: Write failing migration and cap tests**

```ts
expect(normalizeLifeXp({ xp: 24_410, levelCurveVersion: 1, legacyThreshold: legacy }))
  .toMatchObject({ xp: 24_110, levelCurveVersion: 2, migrated: true });
expect(normalizeLifeXp({ xp: 999_999, levelCurveVersion: undefined, legacyThreshold: legacy }).xp)
  .toBe(extendedLifeXpThreshold(60, legacy));
expect(normalizeLifeXp({ xp: 24_410, levelCurveVersion: 2, legacyThreshold: legacy }).xp)
  .toBe(24_410);
expect(applyLifeXpGain({ xp: 120_049, gainedXp: 10, legacyThreshold: legacy }))
  .toEqual({ xp: 120_050, appliedXp: 1 });
```

Also cover negative, `NaN`, infinity, future versions, and exact Lv.100 progress (`xpForNext: 0`, `maxLevel: true`).

- [ ] **Step 5: Run migration tests and verify RED**

Run: `npm test -- src/adventure/v2/lifeLevelProgression.test.ts`

Expected: FAIL on missing migration/cap functions while curve tests pass.

- [ ] **Step 6: Implement normalization, cap, and progress view**

`LifeXpNormalization.migrated` is true only when an old version had XP above `T50` and received credited XP. Version-only upgrades below Lv.50 do not show the migration notice.

- [ ] **Step 7: Run Task 1 tests and commit**

Run: `npm test -- src/adventure/v2/lifeLevelProgression.test.ts`

Expected: PASS.

Commit only Task 1 paths:

```bash
git commit --only src/adventure/v2/lifeLevelProgression.ts src/adventure/v2/lifeLevelProgression.test.ts -m "feat: add level 100 life progression curve"
```

---

### Task 2: 다섯 생활 상태와 진행도 함수 연결

**Files:**
- Modify: `src/adventure/v2/farm.ts`
- Modify: `src/adventure/v2/farm.test.ts`
- Modify: `src/adventure/v2/cooking.ts`
- Modify: `src/adventure/v2/cooking.test.ts`
- Modify: `src/adventure/v2/fishingProgression.ts`
- Modify: `src/adventure/v2/fishingProgression.test.ts`
- Modify: `src/adventure/v2/woodcuttingProgression.ts`
- Modify: `src/adventure/v2/woodcuttingProgression.test.ts`
- Modify: `src/adventure/v2/woodcuttingSession.ts`
- Modify: `src/adventure/v2/woodcuttingSession.test.ts`
- Modify: `src/adventure/v2/miningProgression.ts`
- Modify: `src/adventure/v2/miningProgression.test.ts`
- Modify: `src/adventure/v2/miningSession.ts`
- Modify: `src/adventure/v2/miningSession.test.ts`

**Interfaces:**
- Consumes: Task 1 common curve and normalization functions.
- Produces: every state/log contains `levelCurveVersion: number`.
- Produces: `parse*WithLevelMigration(raw)` wrappers returning `{ state, levelCurveMigrated }`, while existing `parse*` functions continue returning only state.
- Produces: existing `*LevelXpThreshold`, `*LevelForXp`, and progression view APIs now support 1~100.

- [ ] **Step 1: Write failing adapter tests for all five activities**

For each activity assert:

```ts
expect(activityLevelXpThreshold(50)).toBe(existingLevel50Threshold);
expect(activityLevelXpThreshold(100)).toBe(existingLevel50Threshold * 5);
expect(activityLevelForXp(activityLevelXpThreshold(75))).toBe(75);
expect(parseActivityWithLevelMigration({ xp: hugeLegacyXp }))
  .toMatchObject({ state: { levelCurveVersion: 2 }, levelCurveMigrated: true });
```

Farm uses `stats.farmingXp`; the other four use root `xp`. Woodcutting and mining fallback XP derived from historic action counts must be treated as legacy XP before migration.

- [ ] **Step 2: Run adapter tests and verify RED**

Run:

```bash
npm test -- src/adventure/v2/farm.test.ts src/adventure/v2/cooking.test.ts src/adventure/v2/fishingProgression.test.ts src/adventure/v2/woodcuttingProgression.test.ts src/adventure/v2/woodcuttingSession.test.ts src/adventure/v2/miningProgression.test.ts src/adventure/v2/miningSession.test.ts
```

Expected: FAIL because caps are 50, cooking threshold clamps at 50, farm is uncapped, and states lack curve versions.

- [ ] **Step 3: Add versioned parse wrappers and delegate level functions**

Use this shape consistently:

```ts
export function parseCookingStateWithLevelMigration(raw: unknown, now = Date.now()) {
  const parsed = parseCookingStateFields(raw, now);
  const normalized = normalizeLifeXp({
    xp: parsed.xp,
    levelCurveVersion: parsed.levelCurveVersion,
    legacyThreshold: legacyCookingLevelXpThreshold,
  });
  return {
    state: { ...parsed, xp: normalized.xp, levelCurveVersion: normalized.levelCurveVersion },
    levelCurveMigrated: normalized.migrated,
  };
}

export function parseCookingState(raw: unknown, now = Date.now()): CookingState {
  return parseCookingStateWithLevelMigration(raw, now).state;
}
```

Keep private legacy threshold functions exact: farming/cooking scale 10, fishing scale 35, woodcutting/mining scale 40.

- [ ] **Step 4: Cap domain-level XP additions**

Update `harvestPlot`, `collectFarmRanch`, `addFishingCatchXp`, `recordWoodcuttingSuccess`, and `recordMiningSuccess` to call `applyLifeXpGain`. Preserve reported XP reward separately: `xpGained` remains the activity reward, while `appliedXp` controls stored XP at Lv.100.

- [ ] **Step 5: Run adapter tests and verify GREEN**

Run the seven test files from Step 2.

Expected: PASS, including unchanged Lv.1~50 fixtures.

- [ ] **Step 6: Commit Task 2 paths only**

```bash
git commit --only src/adventure/v2/farm.ts src/adventure/v2/farm.test.ts src/adventure/v2/cooking.ts src/adventure/v2/cooking.test.ts src/adventure/v2/fishingProgression.ts src/adventure/v2/fishingProgression.test.ts src/adventure/v2/woodcuttingProgression.ts src/adventure/v2/woodcuttingProgression.test.ts src/adventure/v2/woodcuttingSession.ts src/adventure/v2/woodcuttingSession.test.ts src/adventure/v2/miningProgression.ts src/adventure/v2/miningProgression.test.ts src/adventure/v2/miningSession.ts src/adventure/v2/miningSession.test.ts -m "feat: extend life activity states to level 100"
```

---

### Task 3: 수동·자동 쓰기 경로의 환산과 XP 상한

**Files:**
- Modify: `src/app/api/v2/farm/harvest/route.ts`
- Modify: `src/lib/server/farmHarvestRoute.test.ts`
- Modify: `src/app/api/v2/farm/ranch/collect/route.ts`
- Create: `src/lib/server/farmRanchCollectRoute.test.ts`
- Modify: `src/app/api/v2/woodcutting/chop/route.ts`
- Modify: `src/app/api/v2/woodcutting/auto/route.ts`
- Modify: `src/lib/server/woodcuttingRoute.test.ts`
- Modify: `src/app/api/v2/mining/strike/route.ts`
- Modify: `src/app/api/v2/mining/auto/route.ts`
- Modify: `src/lib/server/miningRoute.test.ts`
- Modify: `src/app/api/v2/fishing/reel/route.ts`
- Modify: `src/lib/server/fishingReelRoute.test.ts`
- Modify: `src/app/api/v2/cooking/route.ts`
- Modify: `src/app/api/v2/cooking/route.test.ts`

**Interfaces:**
- Consumes: Task 2 `parse*WithLevelMigration` and capped XP helpers.
- Produces: successful write responses may contain `levelCurveMigrated: true`; absent/false otherwise.
- Preserves: migrated levels do not trigger fishing level-up coin rewards.

- [ ] **Step 1: Write failing API regression tests**

Add representative tests proving:

```ts
// legacy XP is credited once and persisted with version 2
expect(saved.levelCurveVersion).toBe(2);
expect(saved.xp).toBeLessThanOrEqual(activityLevelXpThreshold(60) + actionXp);
expect(json.levelCurveMigrated).toBe(true);

// replaying another action does not re-credit legacy XP
expect(secondSaved.xp - firstSaved.xp).toBe(secondActionAppliedXp);

// a migrated fishing level does not grant level-up coins
expect(json.levelRewardCoins).toBe(0);

// max level still grants materials but stores no XP over T100
expect(saved.xp).toBe(activityLevelXpThreshold(100));
expect(json.materialsGained).toBeGreaterThan(0);
```

Cover one manual route and both auto settlement routes; pure domain tests cover the other equivalent paths.

- [ ] **Step 2: Run the route tests and verify RED**

Run:

```bash
npm test -- src/lib/server/farmHarvestRoute.test.ts src/lib/server/farmRanchCollectRoute.test.ts src/lib/server/woodcuttingRoute.test.ts src/lib/server/miningRoute.test.ts src/lib/server/fishingReelRoute.test.ts src/app/api/v2/cooking/route.test.ts
```

Expected: FAIL because routes directly add uncapped XP or lose migration metadata.

- [ ] **Step 3: Wire parsers and capped addition into every successful write**

Rules for each route:

```ts
const parsed = parseActivityWithLevelMigration(rawSave, now);
const state = parsed.state;
// apply the normal successful action to state
await upsertSave(tx, userId, SAVE_KEY, nextState);
return { ...result, ...(parsed.levelCurveMigrated ? { levelCurveMigrated: true } : {}) };
```

Dining/environment bonus XP must pass through `applyLifeXpGain` instead of direct `xp + bonus`. Do not persist a version upgrade on validation failure, failed gathering, or cancelled action.

- [ ] **Step 4: Preserve fishing reward semantics**

Compute `beforeLevel` from the already migrated state. `addFishingCatchXp` may report a level-up only for the current catch. `fishingLevelRewardCoins` uses that result and never the raw pre-migration level.

- [ ] **Step 5: Run route tests and verify GREEN**

Expected: all changed route tests PASS; retry/idempotency assertions pass.

- [ ] **Step 6: Commit Task 3 paths only**

Use `git commit --only` with the exact route and test files changed, message:

```text
feat: migrate and cap life experience writes
```

---

### Task 4: 직종별 Lv.51~100 생산 보너스

**Files:**
- Create: `src/adventure/v2/lifeLevelBonuses.ts`
- Create: `src/adventure/v2/lifeLevelBonuses.test.ts`
- Modify: `src/adventure/v2/farm.ts`
- Modify: `src/adventure/v2/farm.test.ts`
- Modify: `src/adventure/v2/fishingProgression.ts`
- Modify: `src/adventure/v2/fishingProgression.test.ts`
- Modify: `src/adventure/v2/woodcuttingSeedDrops.ts`
- Modify: `src/adventure/v2/woodcuttingSeedDrops.test.ts`
- Modify: `src/adventure/v2/lifeCrafting.ts`
- Modify: `src/adventure/v2/lifeCrafting.test.ts`
- Modify: `src/adventure/data/v2/miningSpots.ts`
- Modify: `src/adventure/data/v2/miningSpots.test.ts`
- Modify: `src/app/api/v2/woodcutting/start/route.ts`
- Modify: `src/app/api/v2/woodcutting/auto/route.ts`
- Modify: `src/app/api/v2/mining/start/route.ts`
- Modify: `src/app/api/v2/mining/auto/route.ts`
- Modify: `src/app/api/v2/woodcutting/chop/route.ts`
- Modify: `src/app/api/v2/mining/strike/route.ts`
- Modify: `src/app/api/v2/cooking/route.ts`
- Modify: `src/lib/server/farmHarvestRoute.test.ts`
- Modify: `src/lib/server/woodcuttingRoute.test.ts`
- Modify: `src/lib/server/miningRoute.test.ts`
- Modify: `src/lib/server/fishingReelRoute.test.ts`
- Modify: `src/app/api/v2/cooking/route.test.ts`

**Interfaces:**
- Produces: `farmingPost50Bonuses(level)`, `woodcuttingPost50Bonuses(level)`, `miningPost50Bonuses(level)`, `fishingPost50Bonuses(level)`, `cookingPost50Bonuses(level)`.
- All functions return zero-valued fields at level 50 or below.

- [ ] **Step 1: Write failing pure bonus tests**

```ts
expect(farmingPost50Bonuses(50)).toEqual({ yieldBonusPct: 0, rareChancePct: 0 });
expect(farmingPost50Bonuses(100)).toEqual({ yieldBonusPct: 5, rareChancePct: 1 });
expect(woodcuttingPost50Bonuses(100)).toMatchObject({ bonusLogChancePct: 5, seedChancePct: 0.5, rareResultChancePct: 1 });
expect(miningPost50Bonuses(100)).toMatchObject({ bonusOreChancePct: 5, byproductChancePct: 0.5, rareByproductChancePct: 1 });
expect(fishingPost50Bonuses(60)).toMatchObject({ sizeBonusPct: 1 });
expect(fishingPost50Bonuses(75)).toMatchObject({ specialWeightPct: 3 });
expect(fishingPost50Bonuses(100)).toEqual({ sizeBonusPct: 3, specialWeightPct: 5, rareSizeBonusPct: 1, bigCatchSizeBonusPct: 1 });
expect(cookingPost50Bonuses(100)).toEqual({ masterpieceChancePct: 5, materialReductionPct: 2, rareIngredientSaveChancePct: 2 });
```

- [ ] **Step 2: Run pure tests and verify RED**

Run: `npm test -- src/adventure/v2/lifeLevelBonuses.test.ts`

Expected: FAIL because the module is absent.

- [ ] **Step 3: Implement pure piecewise/step bonus functions**

Use `Math.max(0, Math.min(50, floor(level) - 50))` for continuous progress. Farming/woodcutting/mining primary bonuses and cooking masterpiece use `post50Levels * 0.1`. Fishing follows the exact two-segment interpolation in the design. Secondary milestone bonuses change only at 60, 75, 90, and 100.

- [ ] **Step 4: Write failing integration tests for reward application**

Prove that Lv.50 behavior is byte-identical and deterministic RNG boundaries change at milestone levels:

- farm harvest remainder includes the level yield bonus and rare chance;
- woodcutting start/auto includes bonus log chance, and seed roll receives the Lv.60 addition;
- mining manual/auto applies general byproduct and rough-gem rare bonus without changing base rules below Lv.60;
- fishing `levelBonuses` adds post-50 values;
- cooking combines level bonuses with skill/prep bonuses once, not once per quantity.

- [ ] **Step 5: Run integration tests and verify RED**

Run the bonus test plus the changed domain/route tests.

Expected: FAIL at Lv.60+ expectations; existing Lv.50 assertions pass.

- [ ] **Step 6: Wire bonuses into existing calculation points**

Add post-50 bonuses before existing final chance clamps. Do not change old stacking order. Mining `roughGem` receives `rareByproductChancePct`; other byproduct rules receive only `byproductChancePct`. Woodcutting rare-result bonus applies to the existing hidden-blueprint roll, not to high-grade seed supply.

- [ ] **Step 7: Run Task 4 tests and commit**

Expected: all bonus and affected route tests PASS.

Commit only Task 4 paths with message:

```text
feat: add level 100 life mastery bonuses
```

---

### Task 5: Lv.60·75·90·100 업적과 Lv.100 칭호

**Files:**
- Modify: `src/adventure/data/v2/v2Quests.ts`
- Modify: `src/adventure/data/v2/v2Quests.test.ts`
- Modify: `src/adventure/data/titles.ts`
- Modify: `src/adventure/data/titles.test.ts`

**Interfaces:**
- Produces title IDs: `ach_farming_transcendent`, `ach_worldtree_touch`, `ach_deep_mine_ruler`, `ach_boundless_angler`, `ach_celestial_banquet`.
- Produces four level achievements per activity at 60/75/90/100 with points 20/30/40/60.

- [ ] **Step 1: Write failing quest and title catalog tests**

```ts
expect(levelGoals("farming")).toEqual([10, 25, 50, 60, 75, 90, 100]);
expect(quest("farm_level100")).toMatchObject({
  goal: 100,
  points: 60,
  reward: { titleId: "ach_farming_transcendent" },
});
expect(TITLES.ach_farming_transcendent.name).toBe("대지의 초월자");
```

Repeat title/name assertions for the other four activities. Existing Lv.50 quest IDs must still be present exactly once.

- [ ] **Step 2: Run catalog tests and verify RED**

Run: `npm test -- src/adventure/data/v2/v2Quests.test.ts src/adventure/data/titles.test.ts`

Expected: FAIL on missing milestones/title IDs.

- [ ] **Step 3: Add catalog entries**

Use stable IDs:

```text
farm_level60/75/90/100
wood_level60/75/90/100
mine_level60/75/90/100
fish_level60/75/90/100
cooking_level60/75/90/100
```

Only Lv.100 entries grant titles. All four use the existing `legendary` badge tier because no new badge enum is introduced.

- [ ] **Step 4: Run tests and commit**

Expected: quest and title tests PASS.

```bash
git commit --only src/adventure/data/v2/v2Quests.ts src/adventure/data/v2/v2Quests.test.ts src/adventure/data/titles.ts src/adventure/data/titles.test.ts -m "feat: add life mastery milestone achievements"
```

---

### Task 6: 생활 요약·개별 UI·랭킹·관리자 상한

**Files:**
- Create: `src/adventure/v2/LifeLevelProgress.tsx`
- Create: `src/adventure/v2/LifeLevelProgress.test.tsx`
- Modify: `src/adventure/v2/lifeSummary.ts`
- Modify: `src/adventure/v2/lifeSummary.test.ts`
- Modify: `src/adventure/v2/LifeMasterySummaryCard.tsx`
- Modify: `src/adventure/v2/LifeMasterySummaryCard.test.tsx`
- Modify: `src/adventure/v2/AdventurerFarmPanel.tsx`
- Modify: `src/adventure/v2/WoodcuttingView.tsx`
- Modify: `src/adventure/v2/MiningView.tsx`
- Modify: `src/adventure/v2/FishingView.tsx`
- Modify: `src/adventure/v2/CookingPanel.tsx`
- Modify: `src/adventure/v2/AdventurerFarmPanel.test.tsx`
- Create: `src/adventure/v2/WoodcuttingView.test.tsx`
- Create: `src/adventure/v2/MiningView.test.tsx`
- Modify: `src/adventure/v2/FishingView.test.ts`
- Modify: `src/adventure/v2/CookingPanel.test.tsx`
- Modify: `src/app/api/v2/cooking/route.ts`
- Modify: `src/app/api/v2/cooking/route.test.ts`
- Modify: `src/adventure/rankings/RankingsView.tsx`
- Create: `src/adventure/rankings/RankingsView.test.tsx`
- Modify: `src/app/api/rankings/route.test.ts`
- Modify: `src/app/api/admin/users/review-op-preset/route.ts`
- Modify: `src/app/api/admin/users/review-op-preset/route.test.ts`
- Modify: `src/admin/tabs/users/ReviewOpPresetSection.tsx`
- Modify: `src/admin/tabs/users/ReviewOpPresetSection.test.tsx`
- Modify: `src/admin/tabs/UsersTab.tsx`

**Interfaces:**
- Consumes: common cap/progress and milestone bonus helpers.
- Produces: `<LifeLevelProgress level xpIntoLevel xpForNext milestones />` using existing opaque surface constants.
- Displays: `/ 100`, next milestone at 60/75/90/100, and `최종 숙련 달성 · MAX` at cap.

- [ ] **Step 1: Write failing summary/ranking/admin tests**

```ts
expect(LIFE_MASTERY_ACTIVITY_LEVEL_CAP).toBe(100);
expect(LIFE_MASTERY_MAX_LEVEL).toBe(500);
expect(lifeSummary.lifeMastery.maxLevel).toBe(500);
expect(rankingHtml).toContain("각 생활은 Lv.100까지 반영");
expect(reviewPresetResult).toMatchObject({ lifeLevels: {
  farming: 100, woodcutting: 100, mining: 100, fishing: 100, cooking: 100,
} });
```

- [ ] **Step 2: Write failing progress component tests**

```ts
expect(render({ level: 59 })).toContain("다음 숙련 단계 Lv.60");
expect(render({ level: 76 })).toContain("다음 숙련 단계 Lv.90");
expect(render({ level: 100 })).toContain("최종 숙련 달성 · MAX");
expect(render({ level: 100 })).not.toContain("다음 레벨");
```

Also assert the migration response notice copy is shown when `levelCurveMigrated` is true.

- [ ] **Step 3: Run UI/integration tests and verify RED**

Run all test files listed in this task.

Expected: FAIL on 50/250 copy and missing shared progress component.

- [ ] **Step 4: Implement shared progress presentation and replace hard-coded caps**

Use `SURFACE_INSET` for the new milestone row. Do not add translucent card backgrounds. Cooking API `nextLevelXp` compares against `COOKING_LEVEL_CAP`, never literal 50.

Each activity screen passes its already-derived level/progress values and the activity-specific milestone labels. No component recalculates XP independently.

- [ ] **Step 5: Update life summary next-goal behavior**

At Lv.50+ return the next mastery milestone before falling back to `null`. At Lv.100 all activities report `xpForNext: 0` and `nextGoal: null`.

- [ ] **Step 6: Run Task 6 tests and commit**

Expected: all summary, ranking, admin, and component tests PASS in light/dark markup without new translucent classes.

Commit only Task 6 paths with message:

```text
feat: show level 100 life mastery progression
```

---

### Task 7: Cross-feature verification and final commit hygiene

**Files:**
- Verify all files changed in Tasks 1~6.
- Modify only failing tests or implementation directly related to this feature.

**Interfaces:**
- Confirms the complete design contract; produces no new public API.

- [ ] **Step 1: Run the focused life suite**

```bash
npm test -- src/adventure/v2/lifeLevelProgression.test.ts src/adventure/v2/lifeLevelBonuses.test.ts src/adventure/v2/farm.test.ts src/adventure/v2/cooking.test.ts src/adventure/v2/fishingProgression.test.ts src/adventure/v2/woodcuttingProgression.test.ts src/adventure/v2/woodcuttingSession.test.ts src/adventure/v2/miningProgression.test.ts src/adventure/v2/miningSession.test.ts src/adventure/v2/lifeSummary.test.ts src/adventure/data/v2/v2Quests.test.ts src/adventure/data/titles.test.ts src/app/api/v2/cooking/route.test.ts src/lib/server/fishingReelRoute.test.ts src/app/api/rankings/route.test.ts
```

Expected: all focused tests PASS.

- [ ] **Step 2: Run TypeScript and targeted ESLint**

```bash
npx tsc --noEmit
npx eslint src/adventure/v2/lifeLevelProgression.ts src/adventure/v2/lifeLevelBonuses.ts src/adventure/v2/farm.ts src/adventure/v2/cooking.ts src/adventure/v2/fishingProgression.ts src/adventure/v2/woodcuttingProgression.ts src/adventure/v2/woodcuttingSession.ts src/adventure/v2/miningProgression.ts src/adventure/v2/miningSession.ts src/adventure/v2/lifeSummary.ts src/adventure/v2/LifeLevelProgress.tsx src/adventure/v2/LifeMasterySummaryCard.tsx src/adventure/v2/AdventurerFarmPanel.tsx src/adventure/v2/WoodcuttingView.tsx src/adventure/v2/MiningView.tsx src/adventure/v2/FishingView.tsx src/adventure/v2/CookingPanel.tsx src/adventure/v2/lifeCrafting.ts src/adventure/v2/woodcuttingSeedDrops.ts src/adventure/data/v2/miningSpots.ts src/adventure/data/v2/v2Quests.ts src/adventure/data/titles.ts src/adventure/rankings/RankingsView.tsx src/app/api/v2/farm/harvest/route.ts src/app/api/v2/farm/ranch/collect/route.ts src/app/api/v2/woodcutting/start/route.ts src/app/api/v2/woodcutting/chop/route.ts src/app/api/v2/woodcutting/auto/route.ts src/app/api/v2/mining/start/route.ts src/app/api/v2/mining/strike/route.ts src/app/api/v2/mining/auto/route.ts src/app/api/v2/fishing/reel/route.ts src/app/api/v2/cooking/route.ts src/app/api/admin/users/review-op-preset/route.ts src/admin/tabs/users/ReviewOpPresetSection.tsx src/admin/tabs/UsersTab.tsx
```

Expected: exit 0 with no errors.

- [ ] **Step 3: Run the full test suite**

Run: `npm test`

Expected: exit 0; skipped tests are allowed, failed tests are not.

- [ ] **Step 4: Review requirements and diff**

Run:

```bash
git diff --check
git status --short
git log --oneline -10
```

Confirm every design requirement maps to a passing test, no deployment files changed, and unrelated concurrent changes remain unstaged/uncommitted by this task.

- [ ] **Step 5: Commit any final feature-only corrections**

If verification required corrections, commit only those exact paths with:

```text
fix: complete life level 100 integration
```

Do not amend or rewrite concurrent commits.
