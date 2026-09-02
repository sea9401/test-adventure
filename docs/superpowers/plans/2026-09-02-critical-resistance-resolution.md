# Critical Resistance Resolution Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Apply critical resistance before the critical chance cap and overflow conversion, remove the defender's 50%p resistance cap, preserve guaranteed critical hits, and expose the effective resistance in character details.

**Architecture:** Add one pure critical-resolution helper next to the existing overflow helper, then use it from PvP basic and skill critical paths. Keep PvE monster subtraction intact, remove only the derivation cap, and extend the existing stats panel contract with the derived combat value.

**Tech Stack:** TypeScript, React, Vitest, React server rendering tests

## Global Constraints

- Probability criticals subtract defender resistance from raw critical chance before chance capping and overflow conversion.
- Guaranteed critical effects continue to bypass resistance for both activation and overflow damage.
- Player critical resistance has no 50%p cap.
- Existing critical chance caps, overflow conversion coefficient, and overflow damage cap remain unchanged.
- No new critical-damage-resistance stat is introduced.

---

### Task 1: Shared post-resistance critical calculation

**Files:**
- Modify: `src/adventure/v2/combat/engine.damageHelpers.ts`
- Test: `src/adventure/v2/combat/engine.damageHelpers.test.ts`

**Interfaces:**
- Produces: `resolveCriticalChanceAfterResistance(rawCritPct: number, critResistPct: number, chanceCap?: number): { resistedCritPct: number; effectiveCritPct: number; overflowDamageBonus: number }`

- [ ] **Step 1: Write the failing helper test**

Add assertions that `150` raw, `50` resistance, and the default `75` cap return `{ resistedCritPct: 100, effectiveCritPct: 75, overflowDamageBonus: 0.25 }`; resistance above raw returns all zeroes; and a custom chance cap changes only `effectiveCritPct` while keeping the existing 75%-based overflow rule.

- [ ] **Step 2: Run the helper test and verify RED**

Run: `npm test -- src/adventure/v2/combat/engine.damageHelpers.test.ts`

Expected: FAIL because `resolveCriticalChanceAfterResistance` is not exported.

- [ ] **Step 3: Implement the pure helper**

Compute `resistedCritPct = Math.max(0, rawCritPct - Math.max(0, critResistPct))`, `effectiveCritPct = Math.min(chanceCap, resistedCritPct)`, and `overflowDamageBonus = computeCritOverflowBonus(resistedCritPct)`.

- [ ] **Step 4: Run the helper test and verify GREEN**

Run: `npm test -- src/adventure/v2/combat/engine.damageHelpers.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit the helper**

```bash
git add src/adventure/v2/combat/engine.damageHelpers.ts src/adventure/v2/combat/engine.damageHelpers.test.ts
git commit -m "refactor: centralize resisted critical chance"
```

### Task 2: Remove the critical resistance cap

**Files:**
- Modify: `src/lib/server/derivePlayerCombatV2.ts`
- Modify: `src/lib/server/v2CombatCoefficients.ts`
- Test: `src/lib/server/derivePlayerCombatV2.test.ts`
- Test: `src/adventure/v2/combat/engine.critMob.test.ts`

**Interfaces:**
- Produces: uncapped `PlayerCombat.critResistPct` from SPI, equipment, and liberation bonuses.

- [ ] **Step 1: Change the derivation test to require an uncapped value**

For allocated SPI `1000`, assert the derived value is `(1000 + 15) * 0.1` instead of `50`. Add equipment and liberation coverage showing they remain additive above 50%p.

- [ ] **Step 2: Run derivation and monster tests and verify RED**

Run: `npm test -- src/lib/server/derivePlayerCombatV2.test.ts src/adventure/v2/combat/engine.critMob.test.ts`

Expected: the uncapped derivation assertion fails at the old value `50`.

- [ ] **Step 3: Remove the derivation cap**

Return the non-negative sum of `totalStats.spi * CRIT_RESIST_PER_SPI`, `equipAcc.critResist`, and liberation `critResistPp`. Remove the unused `CRIT_RESIST_PCT_CAP` export and update comments to describe uncapped percentage-point subtraction.

- [ ] **Step 4: Run derivation and monster tests and verify GREEN**

Run: `npm test -- src/lib/server/derivePlayerCombatV2.test.ts src/adventure/v2/combat/engine.critMob.test.ts`

Expected: PASS, including existing PvE monster resistance behavior.

- [ ] **Step 5: Commit cap removal**

```bash
git add src/lib/server/derivePlayerCombatV2.ts src/lib/server/v2CombatCoefficients.ts src/lib/server/derivePlayerCombatV2.test.ts src/adventure/v2/combat/engine.critMob.test.ts
git commit -m "balance: remove critical resistance cap"
```

### Task 3: Use resistance-first math in PvP

**Files:**
- Modify: `src/adventure/v2/combat/engine.pvpPhase.ts`
- Modify: `src/adventure/v2/combat/engine-pvp.ts`
- Test: `src/adventure/battle/engine-pvp.test.ts`

**Interfaces:**
- Consumes: `resolveCriticalChanceAfterResistance(...)` from Task 1.
- Produces: PvP basic and direct-skill critical rolls and overflow multipliers based on post-resistance critical chance.

- [ ] **Step 1: Add failing PvP behavior tests**

Add a basic-attack case with 150% raw chance and 50%p resistance where a `0.5` random roll crits, proving the effective chance is 75% rather than the old 25%. Assert its overflow multiplier uses only 25%p excess. Add a direct-skill case with `skillCritOverflow` showing the same reduced excess. Add guaranteed basic and skill critical cases proving they retain the raw 50%p overflow bonus even against 150%p resistance.

- [ ] **Step 2: Run the PvP tests and verify RED**

Run: `npm test -- src/adventure/battle/engine-pvp.test.ts`

Expected: probability and overflow assertions fail under cap-before-resistance math.

- [ ] **Step 3: Integrate the shared helper**

In `engine.pvpPhase.ts`, replace the separate cap/subtract calculation and raw overflow call with the helper result. In `engine-pvp.ts`, resolve direct-skill raw chance against defender resistance before the 75% cap, and use the helper's overflow bonus only when `skillCritOverflow` is enabled. For `fatedChainConsumed`, `focusedBreathConsumed`, berserker forced crit, and evade-prepared forced crit, bypass the probability roll and compute overflow from raw pre-resistance critical chance.

- [ ] **Step 4: Run the PvP tests and verify GREEN**

Run: `npm test -- src/adventure/battle/engine-pvp.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit PvP integration**

```bash
git add src/adventure/v2/combat/engine.pvpPhase.ts src/adventure/v2/combat/engine-pvp.ts src/adventure/battle/engine-pvp.test.ts
git commit -m "balance: apply critical resistance before overflow"
```

### Task 4: Display effective critical resistance

**Files:**
- Modify: `src/adventure/character/StatsPanel.tsx`
- Modify: `src/adventure/character/StatsPanel.test.ts`
- Modify: `src/adventure/v2/V2CharacterScreen.tsx`
- Modify: `src/app/api/v2/me/state/stateSections.ts`
- Test: `src/app/api/v2/me/state/stateSections.test.ts`
- Modify: `src/app/api/v2/player/[name]/route.ts`
- Test: `src/app/api/v2/player/[name]/route.test.ts`

**Interfaces:**
- Consumes: optional `combat.critResistPct` already returned by the character-state API.
- Produces: a `치명타 저항` detail row and tooltip explaining pre-cap percentage-point subtraction.

- [ ] **Step 1: Add a failing stats-panel test**

Render `StatsPanel` with `critResistPct: 101.5` and assert that it contains `치명타 저항`, `101.5%p`, and a description mentioning that it is subtracted before the opponent's chance cap. Assert that both the private state section and public-character route preserve `critResistPct: 101.5`.

- [ ] **Step 2: Run the panel test and verify RED**

Run: `npm test -- src/adventure/character/StatsPanel.test.ts`

Expected: FAIL because the field is not part of `CombatStats` or rendered items.

- [ ] **Step 3: Add the field and detail row**

Extend both `CombatStats` and `V2CharacterScreen`'s combat payload type with `critResistPct?: number`. Preserve the field in the private and public character API projections. Render one-decimal `%p` output and add a plain-language tooltip stating that it subtracts from raw opponent critical chance before chance capping, while guaranteed critical hits ignore it.

- [ ] **Step 4: Run the panel test and verify GREEN**

Run: `npm test -- src/adventure/character/StatsPanel.test.ts src/app/api/v2/me/state/stateSections.test.ts 'src/app/api/v2/player/[name]/route.test.ts'`

Expected: PASS.

- [ ] **Step 5: Commit the UI**

```bash
git add src/adventure/character/StatsPanel.tsx src/adventure/character/StatsPanel.test.ts src/adventure/v2/V2CharacterScreen.tsx src/app/api/v2/me/state/stateSections.ts src/app/api/v2/me/state/stateSections.test.ts 'src/app/api/v2/player/[name]/route.ts' 'src/app/api/v2/player/[name]/route.test.ts'
git commit -m "feat: show effective critical resistance"
```

### Task 5: Full verification

**Files:**
- Verify all files changed in Tasks 1-4.

- [ ] **Step 1: Run focused regression tests**

Run: `npm test -- src/adventure/v2/combat/engine.damageHelpers.test.ts src/lib/server/derivePlayerCombatV2.test.ts src/adventure/v2/combat/engine.critMob.test.ts src/adventure/battle/engine-pvp.test.ts src/adventure/character/StatsPanel.test.ts src/app/api/v2/me/state/stateSections.test.ts 'src/app/api/v2/player/[name]/route.test.ts'`

Expected: all selected test files pass with zero failures.

- [ ] **Step 2: Run static verification**

Run: `env NODE_OPTIONS=--max-old-space-size=4096 npx tsc --noEmit`

Run: `npx eslint src/adventure/v2/combat/engine.damageHelpers.ts src/adventure/v2/combat/engine.damageHelpers.test.ts src/lib/server/derivePlayerCombatV2.ts src/lib/server/v2CombatCoefficients.ts src/lib/server/derivePlayerCombatV2.test.ts src/adventure/v2/combat/engine.critMob.test.ts src/adventure/v2/combat/engine.pvpPhase.ts src/adventure/v2/combat/engine-pvp.ts src/adventure/battle/engine-pvp.test.ts src/adventure/character/StatsPanel.tsx src/adventure/character/StatsPanel.test.ts src/adventure/v2/V2CharacterScreen.tsx src/app/api/v2/me/state/stateSections.ts src/app/api/v2/me/state/stateSections.test.ts 'src/app/api/v2/player/[name]/route.ts' 'src/app/api/v2/player/[name]/route.test.ts'`

Expected: both commands exit successfully with no errors.

- [ ] **Step 3: Review the final diff**

Run: `git diff --check origin/main...HEAD && git status --short`

Expected: no whitespace errors and only the planned branch changes.
