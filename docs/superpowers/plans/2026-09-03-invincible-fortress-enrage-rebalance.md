# Invincible Fortress Enrage Rebalance Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reduce every Invincible Fortress barrier to 1,500,000 durability and replace its five enrage outcomes with eight increasingly dangerous phase-local outcomes.

**Architecture:** Keep durability, tier thresholds, multipliers, tier validation, and resource formatting centralized in `invincibleFortressMechanic.ts`. The ATB engine and coop UI continue consuming that module's state and exported values; they must not duplicate threshold or multiplier tables.

**Tech Stack:** TypeScript, React, Vitest, Next.js application tests, ESLint, TypeScript compiler

## Global Constraints

- Barrier durability is exactly 1,500,000 for all four trials.
- Trial duration remains exactly 400 ATB ticks.
- There are exactly eight outcomes, numbered 0 through 7.
- Tier thresholds are 1,500,000 / 1,350,000 / 1,125,000 / 900,000 / 675,000 / 450,000 / 225,000, with lower bounds inclusive.
- Attack bonuses by tier are 0%, 10%, 25%, 45%, 70%, 95%, 120%, and 150%.
- Raw speed bonuses by tier are 0%, 15%, 35%, 60%, 90%, 125%, 160%, and 200%.
- A destroyed barrier immediately yields tier 0 and overflow damage continues into the body in the same hit.
- Each completed trial replaces rather than accumulates the enrage applied to the next HP phase.
- Existing stored tiers 0 through 4 remain valid; no database migration is added.
- Do not change rewards, summoning, other bosses, production, or deployment configuration.

---

### Task 1: Rebalance the authoritative fortress mechanic

**Files:**
- Modify: `src/adventure/v2/combat/invincibleFortressMechanic.test.ts`
- Modify: `src/adventure/v2/combat/invincibleFortressMechanic.ts`

**Interfaces:**
- Produces: `INVINCIBLE_FORTRESS_BARRIER_HP = 1_500_000`
- Produces: `InvincibleFortressEnrageTier = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7`
- Produces: `invincibleFortressTierForDamage(damage, maxHp)` using the approved seven boundaries
- Produces: `invincibleFortressEnrageMultipliers(tier)` returning the approved eight multiplier pairs
- Produces: numeric tier strings from `invincibleFortressResourceSnapshot`

- [ ] **Step 1: Rewrite the mechanic expectations first**

Change the durability test to expect `1_500_000`. Replace the boundary table with exact lower-bound and one-below cases:

```ts
it.each([
  [1_500_000, 0],
  [1_499_999, 1],
  [1_350_000, 1],
  [1_349_999, 2],
  [1_125_000, 2],
  [1_124_999, 3],
  [900_000, 3],
  [899_999, 4],
  [675_000, 4],
  [674_999, 5],
  [450_000, 5],
  [449_999, 6],
  [225_000, 6],
  [224_999, 7],
  [0, 7],
] as const)("grades %i barrier damage as tier %i", (damage, tier) => {
  expect(invincibleFortressTierForDamage(damage, MAX_HP)).toBe(tier);
});
```

Update the exact-destroy and overflow cases to consume 1,500,000 of barrier, preserving the same body-overflow assertions. Add normalization coverage that accepts tiers 5, 6, and 7 in `enrageTier`/`barrierResults`, preserves legacy tiers 0 through 4, and clamps a persisted barrier measurement above the new target to 1,500,000.

Replace the multiplier expectation with:

```ts
expect([0, 1, 2, 3, 4, 5, 6, 7].map((tier) =>
  invincibleFortressEnrageMultipliers(tier as InvincibleFortressEnrageTier),
)).toEqual([
  { atkMult: 1, spdMult: 1 },
  { atkMult: 1.1, spdMult: 1.15 },
  { atkMult: 1.25, spdMult: 1.35 },
  { atkMult: 1.45, spdMult: 1.6 },
  { atkMult: 1.7, spdMult: 1.9 },
  { atkMult: 1.95, spdMult: 2.25 },
  { atkMult: 2.2, spdMult: 2.6 },
  { atkMult: 2.5, spdMult: 3 },
]);
```

Expect active snapshots to show `1,500,000` and `예상 3단계`-style numeric output; expect completed snapshots to show `3단계 · 공격 +45% · 속도 +60%`.

- [ ] **Step 2: Run the mechanic test and confirm the old implementation fails**

Run: `npx vitest run src/adventure/v2/combat/invincibleFortressMechanic.test.ts`

Expected: FAIL on old 3,000,000 durability, old four thresholds, old five-tier validation/multipliers, and old adjective labels.

- [ ] **Step 3: Implement the new authoritative constants and tier logic**

Set `INVINCIBLE_FORTRESS_BARRIER_HP` to `1_500_000`, extend `InvincibleFortressEnrageTier` and `isEnrageTier` through 7, and replace `INVINCIBLE_FORTRESS_ENRAGE` with the eight approved multiplier pairs. Implement tier boundaries in descending order using inclusive `>=` checks.

Remove `ENRAGE_LABELS`. During an active barrier return the numeric projection, and outside a barrier return the numeric applied tier with its percentages:

```ts
return {
  fortressEnrage: `예상 ${tier}단계`,
};

return {
  fortressEnrage:
    `${tier}단계` +
    ` · 공격 +${atk}%` +
    ` · 속도 +${spd}%`,
};
```

Keep all damage routing, four HP boundaries, 400 ticks, and phase-local replacement unchanged.

- [ ] **Step 4: Run the mechanic test and confirm it passes**

Run: `npx vitest run src/adventure/v2/combat/invincibleFortressMechanic.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit the mechanic change**

```bash
git add src/adventure/v2/combat/invincibleFortressMechanic.ts src/adventure/v2/combat/invincibleFortressMechanic.test.ts
git commit -m "balance: strengthen fortress enrage trials"
```

### Task 2: Update ATB logs and coop status consumers

**Files:**
- Modify: `src/adventure/v2/combat/invincibleFortressAtb.test.ts`
- Modify: `src/adventure/v2/coop/InvincibleFortressStatus.tsx`
- Modify: `src/adventure/v2/coop/InvincibleFortressStatus.test.tsx`
- Modify: `src/adventure/data/v2/coopBosses.test.ts`
- Modify: `src/app/api/v2/coop/route.test.ts`
- Modify: `src/app/api/v2/coop/[sessionId]/route.test.ts`
- Modify: `src/adventure/battle/BattleLogList.test.tsx`
- Modify: `src/adventure/v2/coop/V2CoopBossListView.test.tsx`
- Modify: `src/adventure/v2/combat/unexploredBossBalanceSim.test.ts`
- Modify: `scripts/sim-v2-coop-boss.ts`

**Interfaces:**
- Consumes: `INVINCIBLE_FORTRESS_BARRIER_HP`, `InvincibleFortressEnrageTier`, and `invincibleFortressEnrageMultipliers` from Task 1
- Produces: coop status rendering for safe tiers 0 through 7 without a second label table
- Preserves: API field names `fortressBarrierTarget`, `fortressEnrageTier`, and `fortressProjectedEnrageTier`

- [ ] **Step 1: Update integration and UI expectations first**

Change ATB log assertions to use `1,500,000` as the maximum and to expect a destroying hit to log `방벽 피해 +1,500,000 · 남은 0 / 1,500,000`. Adjust large-hit fixtures only as needed to preserve their original intent: one test for exact destroy, one for overflow into body, and one for crossing a body boundary into the next barrier.

In the status component tests, use a target of `1_500_000`, a projected tier of 7, and expect `예상 광폭: 7단계`. For the inactive case use tier 7 and expect `현재 광폭: 7단계` plus `공격 +150% · 속도 +200%`.

Update coop/API response expectations from a `3_000_000` target to `1_500_000`, and include a tier 7 value in at least one serialization assertion to prove the widened tier reaches the UI boundary unchanged.

Change the BattleLogList fixture's `fortressEnrage` value from `보통` to `예상 3단계` and assert that the rendered resource row contains `성채 광폭 예상 3단계`.

Update the coop list-card fixture to the 1,500,000 target and numeric tier 7. Extend the balance simulator's tier-to-minimum-damage ratios through tier 7 using the authoritative ratios exported by `invincibleFortressMechanic.ts`; measure the first normal hit after maximum tier 7 rather than the former maximum tier 4. Assert that the fixed-seed maximum-tier normal hit exceeds one representative player HP but remains below twice that HP.

- [ ] **Step 2: Run the focused integration/UI/API tests and confirm failure**

Run:

```bash
npx vitest run \
  src/adventure/v2/combat/invincibleFortressAtb.test.ts \
  src/adventure/v2/coop/InvincibleFortressStatus.test.tsx \
  src/adventure/data/v2/coopBosses.test.ts \
  src/app/api/v2/coop/route.test.ts \
  'src/app/api/v2/coop/[sessionId]/route.test.ts' \
  src/adventure/battle/BattleLogList.test.tsx
```

Expected: FAIL where consumers still clamp tiers to 4, use adjective labels, or assert the old target/log values.

- [ ] **Step 3: Make the coop status render numeric tiers**

Remove the local `TIER_LABELS` array from `InvincibleFortressStatus.tsx`. Change `safeTier` to clamp at 7. Render active projection as `예상 광폭: ${projectedTier}단계` and inactive state as `현재 광폭: ${currentTier}단계`; continue deriving attack and speed percentages from `invincibleFortressEnrageMultipliers`.

Do not add threshold calculations to React or API files. The engine log already reads the exported durability constant, so only expectation/fixture changes should be required there.

- [ ] **Step 4: Run the focused integration/UI/API tests and confirm they pass**

Run the exact Vitest command from Step 2.

Expected: PASS.

- [ ] **Step 5: Commit consumer changes**

```bash
git add src/adventure/v2/combat/invincibleFortressAtb.test.ts src/adventure/v2/coop/InvincibleFortressStatus.tsx src/adventure/v2/coop/InvincibleFortressStatus.test.tsx src/adventure/data/v2/coopBosses.test.ts src/app/api/v2/coop/route.test.ts 'src/app/api/v2/coop/[sessionId]/route.test.ts' src/adventure/battle/BattleLogList.test.tsx
git commit -m "feat: show eight fortress enrage tiers"
```

### Task 3: Run regression verification

**Files:**
- Verify only; no planned source changes

**Interfaces:**
- Consumes: completed Task 1 and Task 2 implementation
- Produces: evidence that the branch is ready for review without deploying it

- [ ] **Step 1: Search for stale fortress-specific values**

Run:

```bash
rg -n "3_000_000|3,000,000|TIER_LABELS|Math\.min\(4|EnrageTier = 0 \| 1 \| 2 \| 3 \| 4" \
  src/adventure/v2/combat/invincibleFortress* \
  src/adventure/v2/coop/InvincibleFortressStatus* \
  src/adventure/data/v2/coopBosses.test.ts \
  src/app/api/v2/coop \
  src/adventure/battle/BattleLogList.test.tsx
```

Expected: no stale production value or five-tier clamp; unrelated fixture prose is reviewed case by case.

- [ ] **Step 2: Run all fortress-related regression tests**

Run:

```bash
npx vitest run \
  src/adventure/v2/combat/invincibleFortressMechanic.test.ts \
  src/adventure/v2/combat/invincibleFortressAtb.test.ts \
  src/adventure/v2/combat/unexploredBossBalanceSim.test.ts \
  src/adventure/v2/coop/InvincibleFortressStatus.test.tsx \
  src/adventure/v2/coop/V2CoopBossListView.test.tsx \
  src/adventure/v2/coop/V2CoopBossDetailView.test.tsx \
  src/adventure/data/v2/coopBosses.test.ts \
  src/app/api/v2/coop/route.test.ts \
  'src/app/api/v2/coop/[sessionId]/route.test.ts' \
  src/app/api/v2/coop/attack/route.test.ts \
  src/adventure/battle/BattleLogList.test.tsx
```

Expected: PASS.

- [ ] **Step 3: Run static verification**

Run:

```bash
NODE_OPTIONS=--max-old-space-size=4096 npx tsc --noEmit
npx eslint \
  src/adventure/v2/combat/invincibleFortressMechanic.ts \
  src/adventure/v2/combat/invincibleFortressMechanic.test.ts \
  src/adventure/v2/combat/invincibleFortressAtb.test.ts \
  src/adventure/v2/coop/InvincibleFortressStatus.tsx \
  src/adventure/v2/coop/InvincibleFortressStatus.test.tsx \
  src/adventure/data/v2/coopBosses.test.ts \
  src/app/api/v2/coop/route.test.ts \
  'src/app/api/v2/coop/[sessionId]/route.test.ts'
git diff --check origin/staging...HEAD
```

Expected: all commands exit 0.

- [ ] **Step 4: Confirm branch state**

Run: `git status --short --branch && git log --oneline origin/staging..HEAD`

Expected: clean feature branch containing the design, plan, mechanic, and consumer commits only. Do not push, merge, or deploy.
