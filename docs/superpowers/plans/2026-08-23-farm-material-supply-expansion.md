# Farm Material Supply Expansion Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Expand the farm from six to eight plots and make fertilized plots yield exactly one additional normal crop while keeping existing harvest bonuses and downstream contracts intact.

**Architecture:** Extend the existing farm-domain constants and upgrade catalog so parsing, purchasing, and UI progress continue to derive from one maximum. Apply the fertilizer quantity bonus inside `harvestPlot` after the existing percentage bonus calculation, then derive the endgame shop requirement from the same maximum. Existing API response shapes and batch-action flows remain unchanged.

**Tech Stack:** TypeScript, React 19, Next.js 16.2, Vitest, Testing Library, ESLint

## Global Constraints

- Do not deploy to any environment.
- Preserve existing 2–6 plot saves and require explicit purchases for plots 7 and 8.
- Plot 7 costs 300 farm reputation and plot 8 costs 500 farm reputation.
- Fertilizer retains its 20% remaining-time reduction capped at two hours and adds exactly one normal crop at harvest.
- Fertilizer does not change percentage-yield remainder math, rare harvest odds or pity, or farming XP.
- The farm endgame shop requires eight plots and all four paid ranch pens.
- Reuse the existing batch actions, UI surfaces, API contracts, and image assets.

---

### Task 1: Extend farm plots and saved-state normalization

**Files:**
- Modify: `src/adventure/v2/farm.test.ts`
- Modify: `src/adventure/v2/farm.ts`

**Interfaces:**
- Consumes: `FARM_PLOT_COUNT`, `FARM_MAX_PLOT_COUNT`, `FARM_PLOT_UPGRADES`, `parseFarmState`, `buyFarmPlotUpgrade`, `nextFarmPlotUpgrade`
- Produces: `FARM_MAX_PLOT_COUNT = 8` and upgrade rows `{ plotCount: 7, costReputation: 300 }`, `{ plotCount: 8, costReputation: 500 }`

- [ ] **Step 1: Write failing plot-expansion tests**

Extend `buys farm plot growth with available reputation` with a base reputation of `1_150`, buy through the sixth upgrade, and require:

```ts
const { state: fifth } = buyFarmPlotUpgrade(fourth);
expect(fifth.plots).toHaveLength(7);
expect(fifth.stats.reputationSpent).toBe(650);

const { state: sixth } = buyFarmPlotUpgrade(fifth);
expect(sixth.plots).toHaveLength(8);
expect(sixth.stats.reputationSpent).toBe(1_150);
expect(farmAvailableReputation(sixth)).toBe(0);
expect(nextFarmPlotUpgrade(sixth)).toBeNull();
```

Add a parser test that supplies nine valid-looking plot rows, expects exactly eight preserved rows, and verifies `plot-8` exists while `plot-9` is discarded.

- [ ] **Step 2: Run the domain test and verify RED**

Run: `npm test -- src/adventure/v2/farm.test.ts`

Expected: FAIL because the fifth plot purchase is currently maxed at six and the parser clamps saves to six plots.

- [ ] **Step 3: Implement the two expansion tiers**

In `farm.ts`, change the maximum and append the upgrades:

```ts
export const FARM_MAX_PLOT_COUNT = 8;

export const FARM_PLOT_UPGRADES: readonly FarmPlotUpgrade[] = [
  { plotCount: 3, costReputation: 20, title: "작은 밭두렁" },
  { plotCount: 4, costReputation: 50, title: "두 번째 밭두렁" },
  { plotCount: 5, costReputation: 100, title: "작은 공동 텃밭" },
  { plotCount: 6, costReputation: 180, title: "넓은 공동 텃밭" },
  { plotCount: 7, costReputation: 300, title: "마을 공동 농장" },
  { plotCount: 8, costReputation: 500, title: "풍요의 대농장" },
];
```

Do not alter initial plot count or migration behavior beyond the shared maximum.

- [ ] **Step 4: Run the farm-domain test and verify GREEN**

Run: `npm test -- src/adventure/v2/farm.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit the plot expansion**

```bash
git add src/adventure/v2/farm.ts src/adventure/v2/farm.test.ts
git commit -m "feat: expand farm to eight plots"
```

### Task 2: Add the fertilized harvest quantity bonus and update its copy

**Files:**
- Modify: `src/adventure/v2/farm.test.ts`
- Modify: `src/adventure/v2/farm.ts`
- Modify: `src/adventure/v2/lifeCrafting.test.ts`
- Modify: `src/adventure/v2/lifeCrafting.ts`
- Modify: `src/adventure/v2/farmEndgameShop.test.ts`
- Modify: `src/adventure/v2/farmEndgameShop.ts`

**Interfaces:**
- Consumes: `FarmPlot.fertilized`, `harvestPlot`, `LIFE_CRAFTING_RECIPES`, `FARM_ENDGAME_SHOP_ITEMS`
- Produces: `harvestPlot(...).result.quantity` including one fixed fertilizer crop and matching fertilizer descriptions

- [ ] **Step 1: Write failing harvest and copy tests**

Add a farm-domain test that plants identical corn plots, marks one plot `fertilized: true`, harvests both with `rng = () => 0`, and requires quantities `5` and `6`. Add a second assertion using `{ yieldBonusPct: 10 }` that the fertilizer still adds one while `yieldBonusRemainderPct` remains the same as an unfertilized harvest.

In `lifeCrafting.test.ts`, require the `organic_fertilizer` recipe description to contain `수확량을 1개 늘립니다`. In `farmEndgameShop.test.ts`, require the `fertilizer-bundle` note to contain `수확량 +1`.

- [ ] **Step 2: Run targeted tests and verify RED**

Run: `npm test -- src/adventure/v2/farm.test.ts src/adventure/v2/lifeCrafting.test.ts src/adventure/v2/farmEndgameShop.test.ts`

Expected: FAIL because fertilizer currently changes only `readyAt` and the two descriptions mention only time reduction.

- [ ] **Step 3: Implement the fixed fertilizer yield**

Keep existing percentage-bonus progress based on the rolled crop amount and calculate the final quantity as:

```ts
const fertilizerQuantity = plot.fertilized ? 1 : 0;
const quantity = baseQuantity + bonusQuantity + fertilizerQuantity;
```

Update the organic fertilizer crafting description to:

```ts
"자라는 중인 밭에 사용해 남은 재배 시간을 20%(최대 2시간) 줄이고, 수확량을 1개 늘립니다. 파종당 1회만 사용합니다."
```

Update the endgame fertilizer bundle note to:

```ts
"재배 시간을 줄이고 수확량 +1을 적용하는 유기질 거름을 보충합니다."
```

- [ ] **Step 4: Run targeted tests and verify GREEN**

Run: `npm test -- src/adventure/v2/farm.test.ts src/adventure/v2/lifeCrafting.test.ts src/adventure/v2/farmEndgameShop.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit the fertilizer production bonus**

```bash
git add src/adventure/v2/farm.ts src/adventure/v2/farm.test.ts src/adventure/v2/lifeCrafting.ts src/adventure/v2/lifeCrafting.test.ts src/adventure/v2/farmEndgameShop.ts src/adventure/v2/farmEndgameShop.test.ts
git commit -m "feat: increase fertilized farm harvests"
```

### Task 3: Align the endgame shop with eight plots

**Files:**
- Modify: `src/adventure/v2/farmEndgameShop.test.ts`
- Modify: `src/adventure/v2/farmEndgameShop.ts`
- Modify: `src/adventure/v2/FarmEndgameShopPanel.test.tsx`
- Modify: `src/adventure/v2/AdventurerFarmPanel.test.tsx`

**Interfaces:**
- Consumes: `FARM_MAX_PLOT_COUNT`, `farmEndgameShopProgress`, `FarmEndgameShopProgress`
- Produces: all endgame shop payloads and UI fixtures using `requiredPlots: 8`

- [ ] **Step 1: Write the failing eight-plot unlock test**

Change `completedFarm()` to build eight plots. Require a seven-plot farm with all paid pens to remain locked and require the completed eight-plot farm to unlock:

```ts
expect(
  farmEndgameShopProgress({ ...completedFarm(), plots: completedFarm().plots.slice(0, 7) })
    .unlocked,
).toBe(false);
expect(farmEndgameShopProgress(completedFarm())).toMatchObject({
  unlocked: true,
  requiredPlots: 8,
});
```

Update panel fixtures and assertions from `6/6` to `7/8` for locked progress and use eight plots for unlocked fixtures. Update the mocked endgame view in `AdventurerFarmPanel.test.tsx` to `requiredPlots: 8`.

- [ ] **Step 2: Run endgame tests and verify RED**

Run: `npm test -- src/adventure/v2/farmEndgameShop.test.ts src/adventure/v2/FarmEndgameShopPanel.test.tsx src/adventure/v2/AdventurerFarmPanel.test.tsx`

Expected: FAIL because progress still unlocks and reports completion at six plots.

- [ ] **Step 3: Derive the endgame requirement from the farm maximum**

Import `FARM_MAX_PLOT_COUNT` alongside `FarmState` and replace hard-coded sixes:

```ts
export type FarmEndgameShopProgress = {
  unlocked: boolean;
  plots: number;
  requiredPlots: typeof FARM_MAX_PLOT_COUNT;
  pens: number;
  requiredPens: 4;
};

return {
  unlocked: plots >= FARM_MAX_PLOT_COUNT && pens >= 4,
  plots,
  requiredPlots: FARM_MAX_PLOT_COUNT,
  pens,
  requiredPens: 4,
};
```

- [ ] **Step 4: Run endgame and farm UI tests and verify GREEN**

Run: `npm test -- src/adventure/v2/farmEndgameShop.test.ts src/adventure/v2/FarmEndgameShopPanel.test.tsx src/adventure/v2/AdventurerFarmPanel.test.tsx`

Expected: PASS.

- [ ] **Step 5: Commit the endgame requirement**

```bash
git add src/adventure/v2/farmEndgameShop.ts src/adventure/v2/farmEndgameShop.test.ts src/adventure/v2/FarmEndgameShopPanel.test.tsx src/adventure/v2/AdventurerFarmPanel.test.tsx
git commit -m "fix: align farm endgame unlock with plot cap"
```

### Task 4: Run regression and production checks

**Files:**
- Verify only; modify implementation files only if a check exposes an in-scope regression.

**Interfaces:**
- Consumes: Tasks 1–3
- Produces: verified local branch with no deployment

- [ ] **Step 1: Run focused farm and crafting regression tests**

Run: `npm test -- src/adventure/v2/farm.test.ts src/adventure/v2/farmEndgameShop.test.ts src/adventure/v2/FarmEndgameShopPanel.test.tsx src/adventure/v2/AdventurerFarmPanel.test.tsx src/adventure/v2/farmBatchActions.test.ts src/adventure/v2/lifeCrafting.test.ts`

Expected: PASS.

- [ ] **Step 2: Run the complete test suite**

Run: `npm test`

Expected: PASS with no new failures.

- [ ] **Step 3: Run static verification**

Run: `npx tsc --noEmit`

Expected: exit 0.

Run: `npm run lint`

Expected: exit 0.

- [ ] **Step 4: Run asset and production build checks**

Run: `npm run check-images`

Expected: exit 0; existing unreferenced-image warnings, if any, are reported separately.

Run: `npm run build`

Expected: exit 0, including the prebuild image optimizer and image checker.

- [ ] **Step 5: Inspect final repository state**

Run: `git status --short && git log -6 --oneline`

Expected: no uncommitted implementation changes and four implementation commits after the design and plan commits. Do not deploy or push.
