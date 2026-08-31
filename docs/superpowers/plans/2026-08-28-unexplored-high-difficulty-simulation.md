# Unexplored High-Difficulty Simulation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extend the simulation-only unexplored monster curve through difficulty 120, keep monster action speed bounded, and measure the resulting 95/100/105/110/115/120 combat distribution against the anonymous live top 30.

**Architecture:** Keep the existing hunt scaler and combat engine unchanged. Add a pure unexplored high-difficulty overlay for HP/ATK/DEF after difficulty 100, extend the existing speed-band calibration with tapering anchor points through 120, and let the existing monster generator consume both. The existing SELECT-only live runner will report the expanded difficulty set without persisting results.

**Tech Stack:** TypeScript, Vitest, existing v2 hunt scaler and ATB combat helpers, existing anonymous PostgreSQL simulation CLI.

**Execution note (2026-08-28):** The initial quadratic overlay documented below was deliberately replaced after the read-only live runs showed that it left too much high-end headroom. The accepted simulation candidate uses `hp = 1 + 2x + x² + 3x³`, `atk = 1 + 1.5x + 0.5x² + 1.5x³`, and `def = 1 + 0.1x + 0.2x²`, where `x = (difficulty - 100) / 20`. Its final mechanics win rates were 20.8% at 105, 5.0% at 110, 0.6% at 115, and 0.0% at 120. The implementation and tests are the source of truth for the calibrated values; the task steps below retain the initial test-first sequence as an execution record.

## Global Constraints

- The default unexplored entry target is difficulty 95 and the candidate maximum is 120.
- Difficulties 95 and 100 must preserve the already measured candidate stats and tempo exactly.
- Difficulty 101+ may be numerically severe, but must not add immunity, unavoidable instant death, or a new hard-counter mechanic.
- Speed growth must taper after 100; high difficulty pressure comes mainly from HP, ATK, DEF, MDEF, and existing pool identities.
- Do not modify `monsterScale`, `v2Monsters`, `combatTimeline`, existing hunt APIs, live drops, or persisted data.
- Database access remains one connection and `SELECT`-only; all player output remains anonymous.
- Do not deploy.

---

### Task 1: Extend the pure difficulty and tempo curve

**Files:**
- Modify: `src/adventure/data/v2/unexploredSimulationBalance.test.ts`
- Modify: `src/adventure/data/v2/unexploredSimulationBalance.ts`

**Interfaces:**
- Consumes: existing `actionInterval`, `actionRate`, `depthSpdCorrection`, and `effectiveMonsterSpd` helpers.
- Produces: `UNEXPLORED_SIMULATION_DIFFICULTIES = [90, 95, 100, 105, 110, 115, 120]`, interpolated `unexploredRawSpd(difficulty, band)`, and `unexploredHighDifficultyMultipliers(difficulty)` returning `{ hp, atk, def }`.

- [x] **Step 1: Write failing speed-taper and stat-overlay tests**

Add behavior tests with hand-derived anchors:

```ts
expect(UNEXPLORED_SIMULATION_DIFFICULTIES).toEqual([
  90, 95, 100, 105, 110, 115, 120,
]);
expect(unexploredRawSpd(105, "extreme")).toBe(116);
expect(unexploredRawSpd(110, "extreme")).toBe(122);
expect(unexploredRawSpd(115, "extreme")).toBe(126);
expect(unexploredRawSpd(120, "extreme")).toBe(129);
expect(unexploredRawSpd(101, "normal")).toBe(28);
expect(unexploredRawSpd(119, "normal")).toBe(38);
expect(unexploredHighDifficultyMultipliers(100)).toEqual({ hp: 1, atk: 1, def: 1 });
expect(unexploredHighDifficultyMultipliers(110)).toEqual({ hp: 1.325, atk: 1.1875, def: 1.1 });
expect(unexploredHighDifficultyMultipliers(120)).toEqual({ hp: 2, atk: 1.55, def: 1.3 });
```

Assert that all four action-ratio series are non-increasing through 120 and each difficulty-120 ratio is lower than its difficulty-100 value. The ATB interval is integer-valued, so adjacent anchors may have the same displayed ratio. Assert each five-level raw-speed increment after 100 is no larger than the preceding increment for that band. Assert invalid non-integer and out-of-range difficulties throw `Unsupported unexplored difficulty: <value>`.

Also update the existing report-row assertion to require 28 rows, with this final literal row:

```ts
expect(unexploredTempoRows()).toHaveLength(28);
expect(unexploredTempoRows().at(-1)).toEqual({
  difficulty: 120,
  band: "extreme",
  rawSpd: 129,
  playerActionsPerMonsterAction: 29 / 27,
});
```

- [x] **Step 2: Run the focused test and verify RED**

Run: `npx vitest run src/adventure/data/v2/unexploredSimulationBalance.test.ts`

Expected: FAIL because the expanded difficulties, high-difficulty anchors, interpolation, and multiplier export do not exist.

- [x] **Step 3: Implement bounded speed interpolation and the stat overlay**

Keep the existing 90/95/100 speed anchors unchanged and add:

```ts
const HIGH_SPEED_ANCHORS = {
  105: { slow: 19, normal: 31, fast: 78, extreme: 116 },
  110: { slow: 21, normal: 34, fast: 83, extreme: 122 },
  115: { slow: 23, normal: 36, fast: 86, extreme: 126 },
  120: { slow: 24, normal: 38, fast: 88, extreme: 129 },
} as const;
```

Linearly interpolate between adjacent five-level anchors and round to the nearest integer. Validate integer difficulties from 90 through 120. Keep attack-pressure multiplier 1.15 from 100 through 120 so faster bands lower per-hit ATK instead of multiplying total pressure again.

For difficulty above 100, let `x = (difficulty - 100) / 20` and return:

```ts
{
  hp: 1 + 0.3 * x + 0.7 * x * x,
  atk: 1 + 0.2 * x + 0.35 * x * x,
  def: 1 + 0.1 * x + 0.2 * x * x,
}
```

Return `{ hp: 1, atk: 1, def: 1 }` at 100 and below.

- [x] **Step 4: Run the focused test and verify GREEN**

Run: `npx vitest run src/adventure/data/v2/unexploredSimulationBalance.test.ts`

Expected: PASS.

- [x] **Step 5: Commit the pure curve**

```bash
git add src/adventure/data/v2/unexploredSimulationBalance.ts src/adventure/data/v2/unexploredSimulationBalance.test.ts
git commit -m "feat: extend unexplored difficulty curve"
```

### Task 2: Apply the high-difficulty overlay to generated monsters

**Files:**
- Modify: `src/adventure/data/v2/unexploredSimulationMonsters.test.ts`
- Modify: `src/adventure/data/v2/unexploredSimulationMonsters.ts`

**Interfaces:**
- Consumes: `unexploredHighDifficultyMultipliers(difficulty)` from Task 1.
- Produces: base and special simulation monsters whose HP/ATK/DEF/MDEF use the overlay after the existing hunt-scale baseline, role profile, and tempo compensation.

- [x] **Step 1: Write failing generator tests**

Assert every anchor difficulty generates five base and 36 special monsters without `directActionSpd`. Preserve these difficulty-100 representative values:

```ts
expect(unexploredBaseProxyMonsters(100)[0].monster).toMatchObject({
  hp: 260_510,
  atk: 10_562,
  def: 2_079,
  magicDef: 2_159,
  spd: 17,
});
expect(
  unexploredSpecialMonsters(100, "stats").find(
    (entry) => entry.monsterId === "armored_shieldman",
  )?.monster,
).toMatchObject({
  hp: 229_249,
  atk: 10_562,
  def: 2_673,
  magicDef: 2_294,
  spd: 17,
});
```

At difficulty 110, assert exact values after applying `{ hp: 1.325, atk: 1.1875, def: 1.1 }`:

```ts
expect(unexploredBaseProxyMonsters(110)[0].monster).toMatchObject({
  hp: 438_350,
  atk: 14_571,
  def: 2_640,
  magicDef: 2_742,
  spd: 21,
});
expect(
  unexploredSpecialMonsters(110, "stats").find(
    (entry) => entry.monsterId === "armored_shieldman",
  )?.monster,
).toMatchObject({
  hp: 385_748,
  atk: 14_571,
  def: 3_394,
  magicDef: 2_913,
  spd: 21,
});
```

Assert difficulty 120 is strictly stronger than 115 in HP, ATK, DEF, and MDEF for both representatives.

- [x] **Step 2: Run the generator test and verify RED**

Run: `npx vitest run src/adventure/data/v2/unexploredSimulationMonsters.test.ts`

Expected: FAIL because high-difficulty generation is outside the old difficulty type and does not apply the overlay.

- [x] **Step 3: Apply the overlay once at the generator boundary**

Read the multiplier once per generator call. Multiply the already computed profile HP by `hp`, the compensated profile ATK by `atk`, and both DEF and MDEF by `def`, rounding only the final result. Do not multiply accuracy, evasion, status reduction, skill values, raw speed, drops, or EXP.

- [x] **Step 4: Run focused generator and balance tests and verify GREEN**

Run:

```bash
npx vitest run src/adventure/data/v2/unexploredSimulationBalance.test.ts src/adventure/data/v2/unexploredSimulationMonsters.test.ts src/adventure/data/v2/unexploredMonsterPools.test.ts
```

Expected: PASS.

- [x] **Step 5: Commit generated high-difficulty monsters**

```bash
git add src/adventure/data/v2/unexploredSimulationMonsters.ts src/adventure/data/v2/unexploredSimulationMonsters.test.ts
git commit -m "feat: scale unexplored high difficulty monsters"
```

### Task 3: Verify the expanded local simulation surface

**Files:**
- Verify: `scripts/sim-unexplored-live-top.ts`
- Verify: `src/adventure/data/v2/unexploredSimulationAnalysis.ts`

**Interfaces:**
- Consumes: the expanded difficulty constant and `unexploredTempoRows()`.
- Produces: the existing anonymous summaries for all seven anchor difficulties without a separate CLI implementation path.

- [x] **Step 1: Inspect the CLI loop contract**

Confirm every difficulty loop reads `UNEXPLORED_SIMULATION_DIFFICULTIES`, every generated row uses the expanded `UnexploredSimulationDifficulty` type, ranking output still uses `anonymousUnexploredRankLabel`, and the PostgreSQL pool still sets `max: 1`. No source edit is required when these conditions hold.

- [x] **Step 2: Run focused verification**

Run:

```bash
npx vitest run src/adventure/data/v2/unexploredSimulationBalance.test.ts src/adventure/data/v2/unexploredSimulationMonsters.test.ts src/adventure/data/v2/unexploredMonsterPools.test.ts src/adventure/data/v2/unexploredSimulationAnalysis.test.ts
npx eslint scripts/sim-unexplored-live-top.ts src/adventure/data/v2/unexploredSimulationBalance.ts src/adventure/data/v2/unexploredSimulationBalance.test.ts src/adventure/data/v2/unexploredSimulationMonsters.ts src/adventure/data/v2/unexploredSimulationMonsters.test.ts
env NODE_OPTIONS=--max-old-space-size=4096 npx tsc --noEmit
git diff --check
```

Expected: every command exits 0 with no test failures, lint errors, type errors, or whitespace errors.

### Task 4: Run the read-only live simulation and calibrate against exact gates

**Files:**
- Modify only after a new failing expectation: `src/adventure/data/v2/unexploredSimulationBalance.test.ts`, `src/adventure/data/v2/unexploredSimulationBalance.ts`

**Interfaces:**
- Consumes: the completed SELECT-only anonymous live runner.
- Produces: reproducible overall, individual, pool, job, and build summaries at 95/100/105/110/115/120.

- [x] **Step 1: Run the anonymous live snapshot once**

Copy only the changed simulation files to a temporary directory on the production EC2 host and execute the documented command with `nice -n 19`. Use `/run/adventure-rpg/production.env`, one database connection, and the repository's installed dependencies. Do not change the checked-out application, service, maintenance mode, database, or deployment state. Remove the remote temporary directory after capturing output.

- [x] **Step 2: Evaluate the exact target bands**

- Difficulty 95 mechanics remains an entry challenge; compare it to the prior 42.1% result and flag a change larger than 2 percentage points.
- Difficulty 100 mechanics remains a current challenge; compare it to the prior 28.4% result and flag a change larger than 2 percentage points.
- Difficulty 105 mechanics overall is 5–20%, with no more than five players at 70% or higher.
- Difficulty 110 mechanics overall is 0–10%, with no player at 70% or higher.
- Difficulty 115 mechanics overall is 0–3%, with no player at 40% or higher.
- Difficulty 120 mechanics overall is 0–1%, with no player at 20% or higher.
- At difficulties 95–105, no one job or build label owns at least 70% of wins when at least two alternatives have wins, and no pool leaves at least 24 of 30 players below 5% unless at least three distinct build labels exceed 20% against it.
- At 110–120, widespread losses are intended and are not by themselves a hard-counter failure; inspect any remaining wins only for one mechanic bypassing the numerical curve.

- [x] **Step 3: Apply one bounded curve correction only if an exact band fails**

Write a failing literal multiplier test first. If 105 or 110 is too easy, increase only the HP quadratic coefficient by `0.10`; if too hard, decrease it by `0.10`. If 115 or 120 is too easy after the HP correction, increase only the ATK quadratic coefficient by `0.05`; if too hard, decrease it by `0.05`. Keep HP quadratic within `0.5–1.0` and ATK quadratic within `0.25–0.50`. Do not change speed anchors, monster-pool identities, existing hunt scaling, or the combat engine. Re-run the focused tests and the live simulation after each single correction.

- [x] **Step 4: Run final non-destructive verification**

Run:

```bash
npm test
npx eslint scripts/sim-unexplored-live-top.ts src/adventure/data/v2/unexploredSimulationBalance.ts src/adventure/data/v2/unexploredSimulationBalance.test.ts src/adventure/data/v2/unexploredSimulationMonsters.ts src/adventure/data/v2/unexploredSimulationMonsters.test.ts src/adventure/data/v2/unexploredMonsterPools.ts src/adventure/data/v2/unexploredMonsterPools.test.ts src/adventure/data/v2/unexploredSimulationAnalysis.ts src/adventure/data/v2/unexploredSimulationAnalysis.test.ts
env NODE_OPTIONS=--max-old-space-size=4096 npx tsc --noEmit
git diff --check
```

Expected: every command exits 0.

- [x] **Step 5: Commit evidence-driven calibration if changed**

```bash
git add src/adventure/data/v2/unexploredSimulationBalance.ts src/adventure/data/v2/unexploredSimulationBalance.test.ts
git commit -m "balance: calibrate unexplored high difficulty"
```

Do not create this commit when the initial curve satisfies every gate.
