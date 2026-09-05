# Speed Return Curve Rework Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make SPD 100 equal a 100-tick action interval, deliver about 4.8× action frequency at SPD 1000, continue diminishing growth to a safe SPD 20000 ceiling, and retune Heavenly Bow's Starpath attack conversion maximum to 20%.

**Architecture:** Keep the deterministic ATB scheduler and its 1000-action guard, replacing the single square-root curve with one continuous three-segment pure function. Preserve power-score behavior through SPD 1024, then score overflow SPD through the same action-rate curve instead of raw linear SPD.

**Tech Stack:** TypeScript, React 19 server-rendered manual content, Vitest, Next.js 16 App Router.

## Global Constraints

- SPD 100 must produce action rate 100 and action interval 100 ticks.
- SPD 1000 must produce action rate 480 and action interval 21 ticks.
- SPD 20000 and above must produce action rate 1000 and action interval 10 ticks.
- The existing `ATB_ACTION_GUARD = 1000` and `ATB_TIMELINE_TICK_CAP = 3000` remain unchanged.
- Power scores through SPD 1024 remain byte-for-byte compatible.
- `v2c_heavenlybow_starpath.passive.spdToAtkMaxPct` becomes 20; its other effects remain unchanged.
- Do not deploy or change maintenance mode.

---

### Task 1: Three-segment ATB action-rate curve

**Files:**
- Modify: `src/adventure/v2/combat/combatTimeline.test.ts`
- Modify: `src/adventure/v2/combat/combatTimeline.ts`

**Interfaces:**
- Preserves: `actionRate(spd: number): number` and `actionInterval(spd: number): number`.
- Produces constants for the reference SPD, middle/high boundaries, exponents, rate ceiling, and technical SPD ceiling.

- [x] **Step 1: Replace the old cap expectations with failing boundary tests**

Add assertions equivalent to:

```ts
expect(actionRate(100)).toBeCloseTo(100, 10);
expect(actionInterval(100)).toBe(100);
expect(actionRate(1_000)).toBeCloseTo(480, 10);
expect(actionInterval(1_000)).toBe(21);
expect(actionInterval(20_000)).toBe(10);
expect(actionInterval(200_000)).toBe(10);
```

Also assert representative intervals 64→125, 200→63, 400→39, 800→25,
2000→18, 4000→15, 10000→12, and confirm SPD 1000 is between 4.5× and
5× as frequent as SPD 100.

- [x] **Step 2: Run the focused timeline test and verify RED**

Run: `npx vitest run src/adventure/v2/combat/combatTimeline.test.ts`

Expected: failures such as SPD 100 yielding 80 instead of 100, SPD 1000 yielding
26 instead of 21, and SPD 20000 yielding 25 instead of 10.

- [x] **Step 3: Implement the continuous piecewise curve**

Use these exact boundary values and derived exponents:

```ts
export const RATE_REF_SPD = 100;
export const MID_RATE_SPD = 1_000;
export const PLAYER_ACTION_SPD_CAP = 20_000;
export const RATE_CAP = 1_000;
export const SPD_RATE_POW = 0.5;
export const MID_SPD_RATE_POW = Math.log(4.8) / Math.log(10);
export const HIGH_SPD_RATE_POW =
  Math.log(RATE_CAP / 480) /
  Math.log(PLAYER_ACTION_SPD_CAP / MID_RATE_SPD);
```

Return `RATE_CAP` immediately at or above `PLAYER_ACTION_SPD_CAP`. Below it,
calculate the low segment from rate 100 at SPD 100, the middle segment from
that same anchor, and the high segment from rate 480 at SPD 1000.

- [x] **Step 4: Run the focused timeline test and verify GREEN**

Run: `npx vitest run src/adventure/v2/combat/combatTimeline.test.ts`

Expected: all timeline tests pass with the new exact boundary values.

### Task 2: Overflow-aware combat power

**Files:**
- Modify: `src/adventure/data/v2/power.test.ts`
- Modify: `src/adventure/data/v2/power.ts`

**Interfaces:**
- Produces: `effectiveSpeedForPower(spd: number): number`.
- Consumes: `actionRate` and the SPD 1024 compatibility boundary.

- [x] **Step 1: Write failing power-score compatibility and overflow tests**

Assert that `effectiveSpeedForPower(100) === 100` and
`effectiveSpeedForPower(1024) === 1024`. Assert SPD 2000 contributes more
power than SPD 1024, SPD 20000 is the maximum, and SPD 200000 equals SPD
20000. Retain existing low-stat exact score tests.

- [x] **Step 2: Run the focused power test and verify RED**

Run: `npx vitest run src/adventure/data/v2/power.test.ts`

Expected: the new helper is missing or SPD above 1024 remains identical.

- [x] **Step 3: Implement the compatibility-preserving power mapping**

For non-negative SPD through 1024 return raw SPD. Above 1024 return:

```ts
1024 * (actionRate(spd) / actionRate(1024))
```

Use the helper in `derivePowerScore` before applying `V2_POWER_WEIGHT.spd`.
Do not make the raw SPD 20000 flow directly into the score.

- [x] **Step 4: Run the focused power test and verify GREEN**

Run: `npx vitest run src/adventure/data/v2/power.test.ts`

Expected: all power tests pass and existing exact low-stat scores are unchanged.

### Task 3: Heavenly Bow Starpath retune

**Files:**
- Modify: `src/adventure/data/v2/v2Skills.test.ts`
- Modify: `src/adventure/data/v2/v2SkillsByJob.test.ts`
- Modify: `src/adventure/data/v2/v2SkillsCommonCatalog.ts`

**Interfaces:**
- Changes: `V2_SKILLS.v2c_heavenlybow_starpath.passive.spdToAtkMaxPct` from 30 to 20.
- Preserves: `speedToAttackBonusPct(spd, maxPct)` and every other Starpath passive field.

- [x] **Step 1: Change catalog expectations to 20 and add a failing SPD 1000 conversion assertion**

Update both catalog tests to expect 20. Assert the existing pure
`speedToAttackBonusPct(1000, 20)` helper returns approximately 13.3%, and verify
the generated skill description exposes the new 20% ceiling.

- [x] **Step 2: Run the focused skill tests and verify RED**

Run: `npx vitest run src/adventure/data/v2/v2Skills.test.ts src/adventure/data/v2/v2SkillsByJob.test.ts`

Expected: catalog assertions receive 30 instead of 20.

- [x] **Step 3: Change only Starpath's maximum conversion**

Set `spdToAtkMaxPct: 20` in `v2c_heavenlybow_starpath`. Preserve DEX +22%,
LUK +8%, accuracy +30%, critical chance +8%, skill critical damage +30%, and
the effective 14 SP cost. Because the lower conversion ceiling reduces the automatic
rubric cost to 13, raise the explicit floor from 11 to 14 to prevent an unrelated cost change.

- [x] **Step 4: Run the focused skill tests and verify GREEN**

Run the same focused Vitest command and confirm every test passes.

### Task 4: Player-facing combat formula documentation

**Files:**
- Modify: `src/app/manual/content/combat-formulas.tsx`

**Interfaces:**
- Consumes exported timeline boundary constants.
- Produces Korean manual copy matching the three-segment curve and technical ceiling.

- [x] **Step 1: Replace the obsolete formula copy**

Describe the three segments in player-facing language rather than exposing logarithmic
exponent constants. State the exact 100/1000/20000 intervals and that investment after
1000 continues with stronger diminishing returns until the technical ceiling.

- [x] **Step 2: Render the existing manual tests**

Run: `npx vitest run src/app/manual/current-content.test.tsx`

Expected: all existing manual rendering and content contracts pass. No exact copy test is
added because human-facing prose is documentation rather than executable behavior.

### Task 5: Integration verification and commit

**Files:**
- Verify all implementation and documentation files above.

- [x] Run focused ATB, PvP, power, skill, derive, BattleScene, and manual tests.
- [x] Run the level-design simulation at representative depths and compare timeouts and build spread.
- [x] Keep the tier-7 package-only simulator at its prior 80-tick sampling density, with equal attacker and defender speed.
- [x] Run `env NODE_OPTIONS=--max-old-space-size=4096 npx tsc --noEmit`.
- [x] Run ESLint on every changed TypeScript/TSX file.
- [x] Run `npm test` and confirm zero failures.
- [x] Run `git diff --check` and inspect the scoped diff.
- [x] Commit with message `balance: improve speed investment returns`.
