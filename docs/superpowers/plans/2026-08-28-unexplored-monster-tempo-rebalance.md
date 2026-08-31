# Unexplored Monster Tempo Rebalance Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reprofile the simulation-only unexplored monster roster so difficulty 90/95/100 raises real monster speed, sharpens soft-counter identities, and targets a 20–40% mechanics win rate at difficulty 100 without changing existing hunting grounds.

**Architecture:** Add one pure balance module that owns speed bands, raw speed tables, calibrated action ratios, and attack-pressure compensation. The existing monster-pool catalog owns each monster's band and relative identity stats; the simulation generator consumes both to build moderated base proxies and specialized monsters. The live script remains read-only and reports the generated tempo before running the existing anonymous top-30 simulation.

**Tech Stack:** TypeScript, Vitest, existing v2 ATB combat helpers, existing read-only PostgreSQL simulation script.

## Global Constraints

- Do not modify `v2Monsters`, the existing hunt scaler, `combatTimeline`, or live hunt APIs.
- Do not use `directActionSpd`; generated monsters must use the normal monster speed conversion.
- Existing hunting grounds and persisted data must remain byte-for-byte unaffected.
- Database access remains `SELECT`-only and output remains anonymous.
- Do not deploy.

---

### Task 1: Pure tempo and attack-pressure calibration

**Files:**
- Create: `src/adventure/data/v2/unexploredSimulationBalance.ts`
- Create: `src/adventure/data/v2/unexploredSimulationBalance.test.ts`

**Interfaces:**
- Consumes: `actionInterval`, `actionRate`, `depthSpdCorrection`, and `effectiveMonsterSpd` from `@/adventure/v2/combat/combatTimeline`.
- Produces: `UnexploredSpeedBand`, `unexploredRawSpd(difficulty, band)`, `unexploredCalibratedActionRatio(difficulty, band)`, and `unexploredAttackCompensation(difficulty, band)`.

- [x] **Step 1: Write failing literal calibration tests**

```ts
expect(unexploredRawSpd(90, "slow")).toBe(10);
expect(unexploredRawSpd(95, "normal")).toBe(20);
expect(unexploredRawSpd(100, "extreme")).toBe(107);
expect(unexploredCalibratedActionRatio(90, "normal")).toBeCloseTo(76 / 27);
expect(unexploredCalibratedActionRatio(100, "fast")).toBeCloseTo(38 / 27);
expect(unexploredAttackCompensation(90, "normal")).toBeCloseTo(1.05 * Math.sqrt(75 / 111));
expect(unexploredAttackCompensation(100, "extreme")).toBeCloseTo(1.15 * Math.sqrt(75 / 663));
```

Also assert every band becomes strictly faster from 90 to 95 to 100.

- [x] **Step 2: Run the focused test and verify RED**

Run: `npx vitest run src/adventure/data/v2/unexploredSimulationBalance.test.ts`

Expected: FAIL because the module and exports do not exist.

- [x] **Step 3: Implement the pure calibration module**

Use the literal raw-speed table:

```ts
const RAW_SPD = {
  90: { slow: 10, normal: 15, fast: 42, extreme: 62 },
  95: { slow: 13, normal: 20, fast: 54, extreme: 83 },
  100: { slow: 17, normal: 27, fast: 71, extreme: 107 },
} as const;

const PRESSURE = { 90: 1.05, 95: 1.1, 100: 1.15 } as const;
```

Use player SPD 930 only to report the calibration ratio. For attack compensation, compare the normal converted monster action rate at source raw SPD 9 against the selected band at the same capped depth correction, then multiply by `PRESSURE[difficulty]`.

- [x] **Step 4: Run the focused test and verify GREEN**

Run: `npx vitest run src/adventure/data/v2/unexploredSimulationBalance.test.ts`

Expected: PASS.

- [x] **Step 5: Commit the pure calibration**

```bash
git add src/adventure/data/v2/unexploredSimulationBalance.ts src/adventure/data/v2/unexploredSimulationBalance.test.ts
git commit -m "feat: calibrate unexplored monster tempo"
```

### Task 2: Encode speed roles and sharpen pool identities

**Files:**
- Modify: `src/adventure/data/v2/unexploredMonsterPools.ts`
- Modify: `src/adventure/data/v2/unexploredMonsterPools.test.ts`

**Interfaces:**
- Consumes: `UnexploredSpeedBand` from `./unexploredSimulationBalance` as a type-only import.
- Produces: every `UnexploredMonsterDefinition` with `speedBand` plus relative HP/ATK/DEF/MDEF values; renamed `bonus_attack_50` ability.

- [x] **Step 1: Write failing catalog behavior tests**

Assert literal representative profiles that catch wrong role assignment or a softened identity:

```ts
expect(UNEXPLORED_MONSTER_BY_ID.armored_shieldman).toMatchObject({
  speedBand: "slow",
  stats: { hp: 1.1, atk: 0.9, def: 1.8, magicDef: 0.85 },
});
expect(UNEXPLORED_MONSTER_BY_ID.rushing_machine.speedBand).toBe("extreme");
expect(UNEXPLORED_MONSTER_BY_ID.phantom_stalker.speedBand).toBe("extreme");
expect(UNEXPLORED_MONSTER_BY_ID.combo_automaton.abilities).toContain("bonus_attack_50");
expect(UNEXPLORED_MONSTER_BY_ID.crust_destroyer).toMatchObject({
  speedBand: "slow",
  stats: { hp: 1.55, atk: 1.35, def: 1.25, magicDef: 0.9 },
});
```

Loop over all definitions to assert `speedBand` is one of the four approved values and `stats` contains only positive HP/ATK/DEF/MDEF multipliers.

- [x] **Step 2: Run the pool test and verify RED**

Run: `npx vitest run src/adventure/data/v2/unexploredMonsterPools.test.ts`

Expected: FAIL because `speedBand` and `bonus_attack_50` do not exist and old profiles are weaker.

- [x] **Step 3: Replace relative speed multipliers with approved bands**

Remove `spd` from `UnexploredRelativeStats`, add `speedBand` to `UnexploredMonsterDefinition`, and encode the approved 12×3 table. Use these profile changes:

- Iron DEF: `1.8 / 1.65 / 1.9`; MDEF: `0.85 / 0.75 / 0.8`.
- Mana MDEF: `1.9 / 1.7 / 1.85`; DEF: `0.85 / 0.7 / 0.9`.
- Regen HP: `1.45 / 1.2 / 1.7`; both defenses remain within `0.8–1.0`.
- Runaway HP: `0.9 / 0.8 / 0.95`; role ATK: `0.9 / 0.75 / 0.9`.
- Shadow HP: `0.85 / 0.75 / 0.7`; DEF remains within `0.65–0.8`.
- Colossus HP: `1.4 / 1.25 / 1.55`; preserve role ATK `1.1 / 1.25 / 1.35`.

Keep the remaining approved relative profiles unless they fall outside the design ranges. Rename `guaranteed_bonus_attack` to `bonus_attack_50`.

- [x] **Step 4: Run catalog tests and verify GREEN**

Run: `npx vitest run src/adventure/data/v2/unexploredMonsterPools.test.ts`

Expected: PASS.

- [x] **Step 5: Commit the catalog changes**

```bash
git add src/adventure/data/v2/unexploredMonsterPools.ts src/adventure/data/v2/unexploredMonsterPools.test.ts
git commit -m "feat: sharpen unexplored monster identities"
```

### Task 3: Reprofile base proxies and apply tempo compensation

**Files:**
- Modify: `src/adventure/data/v2/unexploredSimulationMonsters.ts`
- Modify: `src/adventure/data/v2/unexploredSimulationMonsters.test.ts`

**Interfaces:**
- Consumes: balance helpers from Task 1 and `speedBand` catalog data from Task 2.
- Produces: moderated base proxy monsters, compensated special monsters, and existing `unexploredCommonBaseline` behavior based on unprofiled Star Grave source proxies.

- [x] **Step 1: Write failing generator tests**

At difficulties 90/95/100, assert the five base proxies have raw speed bands `[slow, fast, normal, normal, normal]`, which yields:

```ts
expect(unexploredBaseProxyMonsters(90).map((entry) => entry.monster.spd)).toEqual([10, 42, 15, 15, 15]);
expect(unexploredBaseProxyMonsters(100).map((entry) => entry.monster.spd)).toEqual([17, 71, 27, 27, 27]);
```

Assert the base warden is no longer the unmoderated source profile and matches the common baseline multipliers; assert the comet has exactly 30% evasion and 30% crit. Assert representative special monsters receive raw band speeds and hand-derived compensated attack values. Assert every generated monster omits `directActionSpd`.

Update mechanics assertions to require bonus attack 50%, shadow evasion `35 / 45 / 50`, and mana status resistance `20 / 40`.

- [x] **Step 2: Run generator tests and verify RED**

Run: `npx vitest run src/adventure/data/v2/unexploredSimulationMonsters.test.ts`

Expected: FAIL on base proxy speeds, moderated profiles, compensated attacks, and revised mechanics.

- [x] **Step 3: Split source baseline construction from base profiling**

Create an internal source-proxy builder that extends the five Star Grave monsters only for median calculation. Build public base proxies from the median with the exact design profiles and copy each source monster's semantic combat fields and attached dungeon skills. Override the comet's evasion and crit to 30.

- [x] **Step 4: Apply band speed and pressure compensation to special monsters**

Set `spd` using `unexploredRawSpd(difficulty, definition.speedBand)`. Set ATK to:

```ts
Math.round(
  baseline.atk *
    definition.stats.atk *
    unexploredAttackCompensation(difficulty, definition.speedBand),
)
```

Change semantic adapters to 20/40% mana status resistance, 35/45/50% shadow evasion, and 50% combo-automaton bonus attacks.

- [x] **Step 5: Run generator and catalog tests and verify GREEN**

Run: `npx vitest run src/adventure/data/v2/unexploredSimulationMonsters.test.ts src/adventure/data/v2/unexploredMonsterPools.test.ts src/adventure/data/v2/unexploredSimulationBalance.test.ts`

Expected: PASS.

- [x] **Step 6: Commit generated monster behavior**

```bash
git add src/adventure/data/v2/unexploredSimulationMonsters.ts src/adventure/data/v2/unexploredSimulationMonsters.test.ts
git commit -m "feat: reprofile unexplored simulation monsters"
```

### Task 4: Report calibrated action tempo

**Files:**
- Modify: `scripts/sim-unexplored-live-top.ts`
- Test: `src/adventure/data/v2/unexploredSimulationBalance.test.ts`

**Interfaces:**
- Consumes: `unexploredRawSpd` and `unexploredCalibratedActionRatio`.
- Produces: an anonymous, non-database tempo table before combat results.

- [x] **Step 1: Extend the balance test with report-row behavior**

Add a pure `unexploredTempoRows()` export that returns 12 literal rows ordered by difficulty then `slow / normal / fast / extreme`. Assert the first and last rows exactly, including raw SPD and rounded action ratio.

- [x] **Step 2: Run the balance test and verify RED**

Run: `npx vitest run src/adventure/data/v2/unexploredSimulationBalance.test.ts`

Expected: FAIL because `unexploredTempoRows` is missing.

- [x] **Step 3: Implement rows and print them from the live script**

Keep formatting in the CLI and computation in the pure module. Print difficulty, band, raw SPD, and `player actions : monster action` before the existing top-30 table. Do not print identifiers or database fields.

- [x] **Step 4: Run focused tests and static checks**

Run:

```bash
npx vitest run src/adventure/data/v2/unexploredSimulationBalance.test.ts src/adventure/data/v2/unexploredSimulationMonsters.test.ts src/adventure/data/v2/unexploredMonsterPools.test.ts
npx eslint scripts/sim-unexplored-live-top.ts src/adventure/data/v2/unexploredSimulationBalance.ts src/adventure/data/v2/unexploredSimulationMonsters.ts src/adventure/data/v2/unexploredMonsterPools.ts
env NODE_OPTIONS=--max-old-space-size=4096 npx tsc --noEmit
```

Expected: all commands exit 0 with no warnings.

- [x] **Step 5: Commit tempo reporting**

```bash
git add scripts/sim-unexplored-live-top.ts src/adventure/data/v2/unexploredSimulationBalance.ts src/adventure/data/v2/unexploredSimulationBalance.test.ts
git commit -m "feat: report unexplored monster tempo"
```

### Task 5: Run and calibrate the read-only top-30 simulation

**Files:**
- Modify only if evidence requires: `src/adventure/data/v2/unexploredSimulationBalance.ts`, `src/adventure/data/v2/unexploredMonsterPools.ts`, and their tests.

**Interfaces:**
- Consumes: the existing `scripts/sim-unexplored-live-top.ts` read-only live runner.
- Produces: reproducible anonymous difficulty, pool, job, and build summaries.

- [x] **Step 1: Run the anonymous live simulation once**

Use the same audited read-only environment and command path as the prior top-30 run. Confirm only one database connection is opened, SQL remains `SELECT`-only, and no persisted state changes.

- [x] **Step 2: Check exact acceptance gates**

- Difficulty 100 mechanics overall win rate is 20–40%.
- No one job or combined build label owns at least 70% of all wins when at least two alternatives win.
- No pool leaves at least 24 of 30 players below 5% unless at least three distinct build labels exceed 20% against it.
- Generated action ratios match the four approved bands at all three difficulties.

- [x] **Step 3: Apply bounded evidence-driven tuning only when a gate fails**

For a global difficulty-100 miss, change only the difficulty-100 pressure multiplier in `0.05` increments within `1.00–1.30`, add/update the literal compensation test first, and rerun. For a single-pool wall, change only that pool's primary specialty or compensating weakness by at most `0.10` per iteration, update its literal catalog test first, and rerun. Do not alter speed bands, existing hunting data, or the combat engine.

- [x] **Step 4: Run the full non-destructive verification suite**

Run:

```bash
npm test
npx eslint scripts/sim-unexplored-live-top.ts src/adventure/data/v2/unexploredSimulationBalance.ts src/adventure/data/v2/unexploredSimulationBalance.test.ts src/adventure/data/v2/unexploredSimulationMonsters.ts src/adventure/data/v2/unexploredSimulationMonsters.test.ts src/adventure/data/v2/unexploredMonsterPools.ts src/adventure/data/v2/unexploredMonsterPools.test.ts
env NODE_OPTIONS=--max-old-space-size=4096 npx tsc --noEmit
git diff --check
```

Expected: all commands exit 0.

- [x] **Step 5: Commit any evidence-driven calibration**

If Step 3 changed files:

```bash
git add src/adventure/data/v2/unexploredSimulationBalance.ts src/adventure/data/v2/unexploredSimulationBalance.test.ts src/adventure/data/v2/unexploredMonsterPools.ts src/adventure/data/v2/unexploredMonsterPools.test.ts
git commit -m "balance: calibrate unexplored monster pressure"
```
