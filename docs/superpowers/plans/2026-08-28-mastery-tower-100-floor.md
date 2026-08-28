# Mastery Tower 100-Floor Challenge Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extend Mastery Tower to 100 floors as a steep, reward-free challenge above floor 50 while preserving the existing daily mastery economy.

**Architecture:** Split content and reward caps in the existing pure tower model, add an exponential power curve and deterministic boss presets above floor 50, then let the existing route/state/UI layers consume those definitions. Keep the `mastery-tower.v1` save shape and ranking contract unchanged.

**Tech Stack:** TypeScript, React 19, Next.js App Router, Vitest, existing deterministic battle engine.

## Global Constraints

- `MASTERY_TOWER_MAX_FLOOR` is 100 and `MASTERY_TOWER_REWARD_MAX_FLOOR` is 50.
- Floors 1-50 retain their exact current power and reward values.
- Floors 51-100 grant no reward beyond the floor-50 daily base of 2,400 certificates.
- Required power above 50 is `roundTo10(5100 * (105000 / 5100) ** ((floor - 50) / 50))`.
- Rankings remain lifetime-best-floor only.
- Existing KST reset, 200 stamina entry, 30-second cooldown, weekly checkpoints, and 80-turn battles remain.
- No DB migration and no deployment.

---

### Task 1: Pure progression, reward cap, and boss catalog

**Files:**
- Modify: `src/adventure/data/v2/masteryTower.ts`
- Modify: `src/adventure/data/v2/masteryTower.test.ts`

**Interfaces:**
- Produces: `MASTERY_TOWER_REWARD_MAX_FLOOR`, 100-floor `masteryTowerRequiredPower()`, capped `masteryTowerFloorReward()`, extended checkpoints/state parsing, and boss presets from `masteryTowerGuardianForFloor()`.
- Consumes: existing tower state and battle monster types.

- [ ] **Step 1: Add failing reward and curve tests**

Assert:

```ts
expect(MASTERY_TOWER_MAX_FLOOR).toBe(100);
expect(MASTERY_TOWER_REWARD_MAX_FLOOR).toBe(50);
expect(masteryTowerFloorReward(51)).toBe(2400);
expect(masteryTowerFloorReward(100)).toBe(2400);
expect(masteryTowerRequiredPower(51)).toBe(5420);
expect(masteryTowerRequiredPower(60)).toBe(9340);
expect(masteryTowerRequiredPower(70)).toBe(17100);
expect(masteryTowerRequiredPower(80)).toBe(31310);
expect(masteryTowerRequiredPower(90)).toBe(57340);
expect(masteryTowerRequiredPower(100)).toBe(105000);
```

Also assert that a 50-floor save advances to floor 51, week best 90 offers start floor 91, and values above 100 clamp to 100.

- [ ] **Step 2: Run the test and verify RED**

Run: `npm test -- src/adventure/data/v2/masteryTower.test.ts`

Expected: failures show the old max floor, uncapped reward, and linear power curve.

- [ ] **Step 3: Implement caps and progression**

Add the reward cap constant, cap only reward calculation at 50, set max floor to 100, and use the approved exponential formula above floor 50. Leave every branch for floors 1-50 unchanged.

- [ ] **Step 4: Add failing boss preset tests**

For floors 60, 70, 80, 90, and 100 assert the approved names, physical/magic basic attack, skill IDs, and relative identity (60 attack-focused, 80 fastest, 90 highest defensive multiplier result, 100 strongest).

- [ ] **Step 5: Implement deterministic boss presets**

Extend `towerGuardianBossGimmick()` with the exact multipliers from the approved design and reuse existing skills:

```ts
60: ["mob_crushing_blow", "mob_savage_roar", "mob_rending_claw"]
70: ["mob_arcane_nova", "mob_chilling_touch", "mob_venom_bite"]
80: ["mob_savage_roar", "mob_crushing_blow", "mob_chilling_touch"]
90: ["mob_crushing_blow", "mob_rending_claw", "mob_savage_roar"]
100: ["mob_arcane_nova", "mob_savage_roar", "mob_crushing_blow", "mob_chilling_touch"]
```

- [ ] **Step 6: Run the pure model tests and commit**

Run: `npm test -- src/adventure/data/v2/masteryTower.test.ts`

Commit: `feat: extend mastery tower challenge to 100 floors`

### Task 2: Route and rollover compatibility

**Files:**
- Modify: `src/app/api/v2/mastery-tower/route.test.ts`
- Modify: `src/app/api/v2/mastery-tower/attempt/route.test.ts`
- Modify: `src/app/api/v2/mastery-tower/claim/route.test.ts`
- Modify only if tests require: corresponding `route.ts` files and `src/lib/server/masteryTowerRollover.ts`

**Interfaces:**
- Consumes: Task 1 tower definitions.
- Produces: API status/attempt/claim behavior for floor 100 with floor-50 reward cap.

- [ ] **Step 1: Add failing API boundary tests**

Cover a 50-floor state returning next floor 51, a 100-floor state returning practice floor 100, floor 101 rejection, and a 75-floor unclaimed state returning claim preview total 2,400.

- [ ] **Step 2: Run route tests and verify RED**

Run: `npm test -- src/app/api/v2/mastery-tower/route.test.ts src/app/api/v2/mastery-tower/attempt/route.test.ts src/app/api/v2/mastery-tower/claim/route.test.ts src/lib/server/masteryTowerRollover.test.ts`

- [ ] **Step 3: Make the narrow route adjustments**

Replace hard-coded `50층` practice/cooldown copy with `${MASTERY_TOWER_MAX_FLOOR}층`; keep claim calculations delegated to `masteryTowerClaimPreview()`.

- [ ] **Step 4: Verify and commit**

Run the Task 2 test command and commit `feat: support 100-floor mastery tower attempts`.

### Task 3: Player UI, manual, and ranking display

**Files:**
- Modify: `src/adventure/v2/V2MasteryTowerView.tsx`
- Modify: `src/adventure/v2/V2MasteryTowerBattleView.tsx`
- Modify: existing tests beside those components or `src/app/manual/current-content.test.tsx`
- Modify: `src/app/manual/content/jobs.tsx`
- Modify only if required: `src/adventure/rankings/RankingsView.tsx`

**Interfaces:**
- Consumes: both tower cap constants and API output.
- Produces: explicit reward-cap/challenge labels and 100-floor practice text.

- [ ] **Step 1: Add failing presentation tests**

Assert that a 50+ state displays `일일 보상 상한 달성`, floor 51+ displays `도전 구간 · 추가 보상 없음`, and completed state displays `100층 연습 재도전`. Assert the manual mentions total 100 floors and reward only through floor 50.

- [ ] **Step 2: Run presentation tests and verify RED**

Run: `npm test -- src/adventure/v2/V2MasteryTowerView.test.tsx src/adventure/v2/V2MasteryTowerBattleView.test.tsx src/app/manual/current-content.test.tsx src/adventure/rankings/RankingsView.test.tsx`

- [ ] **Step 3: Implement copy and display changes**

Import `MASTERY_TOWER_REWARD_MAX_FLOOR`, show the challenge badge only for targets above 50, preserve the 2,400 preview, and update manual prose/table samples to include floors 60, 80, and 100 without adding milestone bonuses.

- [ ] **Step 4: Verify and commit**

Run the Task 3 test command and commit `feat: present mastery tower challenge floors`.

### Task 4: Balance simulation and release verification

**Files:**
- Modify only tests or presets required by evidence from existing tower simulation utilities.

**Interfaces:**
- Consumes: completed 100-floor model and representative battle fixtures.
- Produces: a verified, committed feature branch with no deployment.

- [ ] **Step 1: Run focused tower and battle tests**

Run all `masteryTower` tests plus battle-engine tests. Confirm existing floor 1-50 assertions remain unchanged and representative high-end fixtures cannot clear floor 100.

- [ ] **Step 2: Run static checks**

Run: `env NODE_OPTIONS=--max-old-space-size=4096 npx tsc --noEmit`

Run targeted ESLint on all modified TypeScript/TSX files.

- [ ] **Step 3: Run the full unit suite**

Run: `npm test`

Expected: zero failed test files and zero failed tests.

- [ ] **Step 4: Inspect final state**

Run: `git diff --check origin/main...HEAD` and `git status --short --branch`. Confirm only tower code, tests, manual, and approved docs changed.
