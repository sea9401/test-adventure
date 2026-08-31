# Cryomancer Frost Chill Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add the tier-5 Cryomancer job and make Frost Mage spells build a shared five-stack Frost Chill resource that automatically deals freeze damage and delays the target without skipping actions.

**Architecture:** Keep threshold and snapshot rules in a focused `frostChill.ts` pure module. Skill resolution only emits a per-cast chill request; PvE and PvP engines apply it after hit and hostile-status blocking, then route the triggered freeze hit through the existing direct magic damage pipeline and return a one-shot ATB delay. Store player-to-enemy chill separately from the existing monster-to-player `chillStacks` field.

**Tech Stack:** TypeScript, Next.js 16.2 app router, React, Vitest, existing v2 combat engines and catalog helpers.

## Global Constraints

- Job ID is `cryomancer`; it is tier 5, requires `frostmage: TIER5_UNLOCK_CUMLEVEL`, grows INT 3/SPI 2, and grants INT 18/SPI 8.
- Frost Chill starts at 0, triggers once at a threshold of 5, discards overflow, resets to 0, never decays, and is discarded after combat.
- `v2c_frostmage_glacier` keeps its damage/cost/proc values, removes shield and immediate delay, and emits Frost Chill +2 once per landed cast.
- `v2c_cryomancer_absolutezero` deals raw `INT × 2.20 + 540`, costs fixed MP 155, proc 30%, cooldown 0, learn cost 8,000, SP 7, and emits Frost Chill +3.
- `v2c_cryomancer_freezingpoint` costs learn 8,000/SP 6, grants max MP +12%, boosts only freeze damage by 50%, and raises freeze delay from 30% to 40%.
- Base freeze raw damage is `INT × 0.70 + max MP × 4% + 180`; it shares the triggering cast's hit and critical result and receives tier, defense, equipment, and PvP scaling exactly once.
- Frost Chill applies only after hit/guaranteed-evade/hostile-status-block checks; status blocking prevents chill and freeze but not direct skill damage.
- Current job ID never gates chill or mastery; any learned and equipped generator/mastery works cross-class.
- Existing Earth Mage, Elemental Lord formulas, monster-to-player `chillStacks`, old saves, and old replays must remain compatible.
- No DB migration, new image, deployment, hard freeze, stun, or turn skip.

---

### Task 1: Catalog the Cryomancer lineage and skill data

**Files:**
- Create: `src/adventure/data/v2/cryomancerCatalog.test.ts`
- Modify: `src/adventure/data/v2/v2JobCatalog.ts`
- Modify: `src/adventure/data/v2/v2JobCatalog.test.ts`
- Modify: `src/adventure/data/v2/v2Skills.ts`
- Modify: `src/adventure/data/v2/v2SkillsCommonCatalog.ts`
- Modify: `src/adventure/data/v2/v2SkillsByJob.ts`
- Modify: `src/adventure/data/v2/v2SkillsByJob.test.ts`
- Modify: `src/adventure/data/v2/proficiency.ts`

**Interfaces:**
- Produces: `V2_JOB_CATALOG.cryomancer`, skill IDs `v2c_cryomancer_absolutezero` and `v2c_cryomancer_freezingpoint`.
- Produces: `V2SkillDefinition.frostChillGain?: number`.
- Produces: passive fields `freezeDamagePct?: number` and `freezeDelayPct?: number`, aggregated by `aggregateEquippedPassives`.
- Consumes: existing `TIER5_UNLOCK_CUMLEVEL`, `dmg()`, skill power/SP pricing, and legacy job mapping conventions.

- [ ] **Step 1: Write the failing catalog test**

Create assertions equivalent to:

```ts
expect(V2_JOB_CATALOG.cryomancer).toMatchObject({
  name: "빙결술사",
  tier: 5,
  cultivateProfile: { int: 3, spi: 2 },
  jobBonus: { int: 18, spi: 8 },
  unlock: { prereqs: { frostmage: TIER5_UNLOCK_CUMLEVEL } },
});
expect(skillsForJob("cryomancer")).toEqual([
  "v2c_cryomancer_absolutezero",
  "v2c_cryomancer_freezingpoint",
]);
expect(V2_SKILLS.v2c_frostmage_glacier.effects).toEqual([
  expect.objectContaining({ kind: "damage", statCoef: 1.5, baseFlat: 290 }),
]);
expect(V2_SKILLS.v2c_frostmage_glacier.frostChillGain).toBe(2);
expect(V2_SKILLS.v2c_cryomancer_absolutezero).toMatchObject({
  fixedMpCost: 155,
  procChance: 30,
  spCost: 7,
  frostChillGain: 3,
});
expect(V2_SKILLS.v2c_cryomancer_freezingpoint.passive).toMatchObject({
  maxMpPct: 12,
  freezeDamagePct: 50,
  freezeDelayPct: 40,
});
```

- [ ] **Step 2: Run the catalog test and confirm RED**

Run: `npx vitest run src/adventure/data/v2/cryomancerCatalog.test.ts`

Expected: FAIL because the job, IDs, metadata, and catalog entries do not exist.

- [ ] **Step 3: Add the minimal catalog and aggregation implementation**

Add the exact job, legacy mapping, proficiency hybrid-parent entry, skill union IDs, skill definitions, `V2_SKILLS_BY_JOB.cryomancer`, and passive aggregation fields. Keep `v2c_frostmage_glacier` damage data and existing cost/proc values, remove its shield and `enemyDelay`, and set `frostChillGain: 2`.

- [ ] **Step 4: Run catalog and structural tests**

Run: `npx vitest run src/adventure/data/v2/cryomancerCatalog.test.ts src/adventure/data/v2/v2JobCatalog.test.ts src/adventure/data/v2/v2SkillsByJob.test.ts src/adventure/data/v2/v2Skills.test.ts`

Expected: PASS with updated total/tier-5 job counts and no Earth Mage or Elemental Lord changes.

- [ ] **Step 5: Commit the catalog slice**

```bash
git add src/adventure/data/v2/cryomancerCatalog.test.ts src/adventure/data/v2/v2JobCatalog.ts src/adventure/data/v2/v2JobCatalog.test.ts src/adventure/data/v2/v2Skills.ts src/adventure/data/v2/v2SkillsCommonCatalog.ts src/adventure/data/v2/v2SkillsByJob.ts src/adventure/data/v2/v2SkillsByJob.test.ts src/adventure/data/v2/proficiency.ts
git commit -m "feat: add cryomancer job catalog"
```

### Task 2: Implement the pure Frost Chill transition

**Files:**
- Create: `src/adventure/v2/combat/frostChill.ts`
- Create: `src/adventure/v2/combat/frostChill.test.ts`

**Interfaces:**
- Produces: `FROST_CHILL_THRESHOLD = 5`, `BASE_FREEZE_DELAY_PCT = 30`.
- Produces: `normalizeFrostChill(value: unknown): number`.
- Produces: `resolveFrostChillGain(current: unknown, gain: unknown, mastery?: { damagePct?: number; delayPct?: number }): FrostChillTransition`.
- Produces: `freezeRawDamage(args: { int: number; maxMp: number; damagePct: number }): number`.
- Produces: `frostChillSnapshot`, `mergeFrostChillSnapshot`, and log-format helpers.

- [ ] **Step 1: Write failing pure transition tests**

Cover exact transitions and formulas:

```ts
expect(resolveFrostChillGain(0, 2)).toMatchObject({ next: 2, triggered: false });
expect(resolveFrostChillGain(2, 2)).toMatchObject({ next: 4, triggered: false });
expect(resolveFrostChillGain(4, 2)).toMatchObject({
  next: 0,
  triggered: true,
  consumed: 5,
  delayPct: 30,
  damagePct: 0,
});
expect(resolveFrostChillGain(3, 99, { damagePct: 50, delayPct: 40 })).toMatchObject({
  next: 0,
  triggered: true,
  delayPct: 40,
  damagePct: 50,
});
expect(freezeRawDamage({ int: 100, maxMp: 1_000, damagePct: 0 })).toBe(290);
expect(freezeRawDamage({ int: 100, maxMp: 1_000, damagePct: 50 })).toBe(435);
```

Also assert missing, negative, `NaN`, and oversized current values normalize safely, overflow never carries, and one call triggers at most once.

- [ ] **Step 2: Run the pure tests and confirm RED**

Run: `npx vitest run src/adventure/v2/combat/frostChill.test.ts`

Expected: FAIL because `frostChill.ts` does not exist.

- [ ] **Step 3: Implement the minimal pure module**

Use a narrow transition shape:

```ts
export type FrostChillTransition = {
  previous: number;
  requestedGain: number;
  next: number;
  triggered: boolean;
  consumed: 0 | 5;
  damagePct: number;
  delayPct: number;
};
```

Clamp current state to 0..4, clamp requested gain to a non-negative integer, reset to zero on threshold, and never loop for multiple triggers.

- [ ] **Step 4: Run the pure tests and confirm GREEN**

Run: `npx vitest run src/adventure/v2/combat/frostChill.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit the pure module**

```bash
git add src/adventure/v2/combat/frostChill.ts src/adventure/v2/combat/frostChill.test.ts
git commit -m "feat: add frost chill transitions"
```

### Task 3: Carry chill requests through shared skill resolution and player derivation

**Files:**
- Create: `src/adventure/v2/combat/frostChillCast.test.ts`
- Modify: `src/adventure/v2/combat/combatShared.ts`
- Modify: `src/adventure/v2/combat/engineState.ts`
- Modify: `src/lib/server/derivePlayerCombatV2.ts`
- Modify: `src/lib/server/derivePlayerCombatV2.test.ts`

**Interfaces:**
- Produces: `V2SkillCastResult.frostChillGain: number` with zero in `EMPTY_CAST_RESULT_BASE`.
- Produces: `PlayerCombat.freezeDamagePct?: number` and `PlayerCombat.freezeDelayPct?: number`.
- Produces: `BattleStacks.enemyFrostChillStacks?: number` and `PvPSideStacks.frostChillStacks?: number` in the owning engine task.
- Consumes: Task 1 passive aggregate fields and skill metadata.

- [ ] **Step 1: Write failing cast and derivation tests**

Assert that a landed Glacier cast requests 2, Absolute Zero requests 3, ordinary skills request 0, and `removeMissedV2SkillTargetEffects` resets the request to 0. Assert `derivePlayerCombatV2Pure` emits `{ freezeDamagePct: 50, freezeDelayPct: 40 }` only when the mastery passive is aggregated.

- [ ] **Step 2: Run tests and confirm RED**

Run: `npx vitest run src/adventure/v2/combat/frostChillCast.test.ts src/lib/server/derivePlayerCombatV2.test.ts`

Expected: FAIL on missing result/player fields.

- [ ] **Step 3: Implement request and passive plumbing**

Set `frostChillGain` from the selected skill definition, keep it independent of current job ID, clear it on miss, and pass aggregated mastery fields through `derivePlayerCombatV2FromSaves` into `PlayerCombat`.

- [ ] **Step 4: Run tests and confirm GREEN**

Run: `npx vitest run src/adventure/v2/combat/frostChillCast.test.ts src/lib/server/derivePlayerCombatV2.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit shared plumbing**

```bash
git add src/adventure/v2/combat/frostChillCast.test.ts src/adventure/v2/combat/combatShared.ts src/adventure/v2/combat/engineState.ts src/lib/server/derivePlayerCombatV2.ts src/lib/server/derivePlayerCombatV2.test.ts
git commit -m "feat: expose frost chill cast requests"
```

### Task 4: Apply freeze damage, status blocking, logs, and ATB delay in PvE

**Files:**
- Create: `src/adventure/v2/combat/frostChillPve.test.ts`
- Modify: `src/adventure/v2/combat/engine.ts`
- Modify: `src/adventure/v2/combat/engine.atb.ts`
- Modify: `src/adventure/v2/combat/atbSkillCast.test.ts`

**Interfaces:**
- Produces: `applyPlayerV2SkillCast(...).enemyDelayPct` containing ordinary skill delay plus a triggered freeze delay, with freeze using the larger single one-shot value rather than recursively applying it.
- Consumes: Task 2 transition/damage helpers and Task 3 `frostChillGain`/mastery fields.

- [ ] **Step 1: Write failing PvE integration tests**

Create deterministic player/cast fixtures that verify:

```ts
expect(afterFirst.stacks.enemyFrostChillStacks).toBe(2);
expect(afterSecond.stacks.enemyFrostChillStacks).toBe(4);
expect(afterThird.stacks.enemyFrostChillStacks).toBe(0);
expect(thirdCast.enemyDelayPct).toBe(30);
expect(masteredThirdCast.enemyDelayPct).toBe(40);
```

Also assert freeze adds a separate magic hit, shares critical state, status blocking consumes the blocker and leaves chill unchanged, cross-class players work, and legacy battle applies damage but ignores the delay.

- [ ] **Step 2: Run PvE tests and confirm RED**

Run: `npx vitest run src/adventure/v2/combat/frostChillPve.test.ts src/adventure/v2/combat/atbSkillCast.test.ts`

Expected: FAIL because PvE does not store or apply enemy Frost Chill.

- [ ] **Step 3: Implement PvE transition after hostile-status gating**

Initialize the optional state only when needed, include `frostChillGain > 0` in hostile-status detection, run the transition only after miss and block decisions, add the freeze hit through the existing direct magic damage/critical/mitigation calculation, update the state and logs, and return the transition delay to the ATB caller. Keep ordinary `enemyDelayToApply` behavior unchanged.

- [ ] **Step 4: Add the ATB scheduling assertion**

Use the existing ATB test harness to assert the enemy's recorded next action tick is pushed by exactly `actionInterval(enemySpeed) × 0.30` or `× 0.40` when the freeze-triggering cast lands.

- [ ] **Step 5: Run PvE tests and confirm GREEN**

Run: `npx vitest run src/adventure/v2/combat/frostChillPve.test.ts src/adventure/v2/combat/atbSkillCast.test.ts src/adventure/v2/combat/combatPatternCast.test.ts`

Expected: PASS.

- [ ] **Step 6: Commit PvE integration**

```bash
git add src/adventure/v2/combat/frostChillPve.test.ts src/adventure/v2/combat/engine.ts src/adventure/v2/combat/engine.atb.ts src/adventure/v2/combat/atbSkillCast.test.ts
git commit -m "feat: resolve frost freeze in pve"
```

### Task 5: Mirror Frost Chill in PvP

**Files:**
- Create: `src/adventure/v2/combat/frostChillPvp.test.ts`
- Modify: `src/adventure/v2/combat/engine-pvp.ts`
- Modify: `src/adventure/v2/combat/engine.pvp-atb.ts`
- Modify: `src/adventure/v2/combat/atbSkillCastPvp.test.ts`

**Interfaces:**
- Produces: optional `PvPSideStacks.frostChillStacks` on the target side.
- Consumes: Task 2 helpers and Task 4's established PvE ordering/one-shot delay contract.

- [ ] **Step 1: Write failing PvP integration tests**

Assert the target side receives 2/4/0, freeze damage uses `damageMultiplier`, base/mastered delay returns 30/40, guaranteed evade and status-block/purification prevent gain, and a non-Cryomancer current job can run the same equipped skill set.

- [ ] **Step 2: Run PvP tests and confirm RED**

Run: `npx vitest run src/adventure/v2/combat/frostChillPvp.test.ts src/adventure/v2/combat/atbSkillCastPvp.test.ts`

Expected: FAIL on missing PvP state and transition.

- [ ] **Step 3: Implement the PvP mirror**

Apply the same pure transition after `blockHostileStatus`, store the next value on the opponent, run the triggered magic hit through existing PvP direct-damage scaling and shields, append matching logs, and expose the one-shot delay to `engine.pvp-atb.ts`.

- [ ] **Step 4: Run PvP tests and confirm GREEN**

Run: `npx vitest run src/adventure/v2/combat/frostChillPvp.test.ts src/adventure/v2/combat/atbSkillCastPvp.test.ts`

Expected: PASS with byte-identical no-chill results for unrelated skills.

- [ ] **Step 5: Commit PvP integration**

```bash
git add src/adventure/v2/combat/frostChillPvp.test.ts src/adventure/v2/combat/engine-pvp.ts src/adventure/v2/combat/engine.pvp-atb.ts src/adventure/v2/combat/atbSkillCastPvp.test.ts
git commit -m "feat: resolve frost freeze in pvp"
```

### Task 6: Add pattern, UI, resource snapshot, and replay support

**Files:**
- Modify: `src/adventure/v2/combat/combatPattern.ts`
- Modify: `src/adventure/v2/combat/combatPattern.test.ts`
- Modify: `src/adventure/v2/combat/combatShared.ts`
- Modify: `src/adventure/v2/V2CombatPatternView.tsx`
- Modify: `src/adventure/v2/V2CombatPatternView.test.tsx`
- Modify: `src/adventure/data/v2/arenaLoadout.ts`
- Modify: `src/adventure/battle/BattleLogList.tsx`
- Modify: `src/adventure/battle/BattleLogList.test.tsx`
- Modify: `src/adventure/data/v2/replayPayload.test.ts`
- Modify: `src/adventure/v2/combat/engine.ts`
- Modify: `src/adventure/v2/combat/engine.atb.ts`
- Modify: `src/adventure/v2/combat/engine-pvp.ts`
- Modify: `src/adventure/v2/combat/engine.pvp-atb.ts`

**Interfaces:**
- Produces: pattern enemy-status tag `frostChill`, displayed as `한기`.
- Produces: target resource snapshot field `frostChill: "한기 N/5"` only for values 1..4.
- Consumes: Task 2 snapshot merge helper and engine state fields.

- [ ] **Step 1: Read the relevant Next.js client/component guide**

Read `node_modules/next/dist/docs/01-app/01-getting-started/05-server-and-client-components.md` before editing the React pattern/log components.

- [ ] **Step 2: Write failing pattern and rendering tests**

Assert parsing/evaluation for:

```ts
{ kind: "enemy_status", tag: "frostChill", op: "atLeast", stacks: 2 }
```

Render the pattern control and assert `한기` is selectable with a maximum of 5. Render HP-bar resources and assert target `한기 3/5` appears, while 0/undefined does not.

- [ ] **Step 3: Implement pattern and UI labels**

Extend the exact enemy-status union/parser/context, add the arena and picker label, and use existing opaque surface components/classes without introducing a new panel style.

- [ ] **Step 4: Implement snapshots in all four HP-bar producers**

Merge Frost Chill after existing tier-6, triple-ward, and law-inscription snapshots. PvE places it in `enemySignatureResources`; PvP places each side's received chill in the opposite-view target resource map. Preserve undefined fields for old events.

- [ ] **Step 5: Run pattern/log/replay tests**

Run: `npx vitest run src/adventure/v2/combat/combatPattern.test.ts src/adventure/v2/V2CombatPatternView.test.tsx src/adventure/battle/BattleLogList.test.tsx src/adventure/data/v2/replayPayload.test.ts`

Expected: PASS.

- [ ] **Step 6: Commit presentation and compatibility**

```bash
git add src/adventure/v2/combat/combatPattern.ts src/adventure/v2/combat/combatPattern.test.ts src/adventure/v2/combat/combatShared.ts src/adventure/v2/V2CombatPatternView.tsx src/adventure/v2/V2CombatPatternView.test.tsx src/adventure/data/v2/arenaLoadout.ts src/adventure/battle/BattleLogList.tsx src/adventure/battle/BattleLogList.test.tsx src/adventure/data/v2/replayPayload.test.ts src/adventure/v2/combat/engine.ts src/adventure/v2/combat/engine.atb.ts src/adventure/v2/combat/engine-pvp.ts src/adventure/v2/combat/engine.pvp-atb.ts
git commit -m "feat: expose frost chill patterns and logs"
```

### Task 7: Verify the complete feature

**Files:**
- Verify only; modify failing code/tests only when the failure is attributable to this feature.

**Interfaces:**
- Consumes: all prior tasks.
- Produces: a verified, committed Cryomancer feature with no deployment.

- [ ] **Step 1: Run focused feature tests**

Run all Cryomancer/Frost Chill catalog, pure, cast, PvE, PvP, pattern, log, replay, Earth Mage, and Elemental Lord tests together.

Expected: all pass.

- [ ] **Step 2: Run static validation**

Run:

```bash
npx tsc --noEmit
git diff --check
npx eslint <all changed .ts/.tsx files>
```

Expected: zero TypeScript, whitespace, and ESLint errors.

- [ ] **Step 3: Run the full suite**

Run: `npm test`

Expected: all non-skipped tests pass.

- [ ] **Step 4: Run the production build**

Run: `npm run build`

Expected: image checks and Next.js production build pass.

- [ ] **Step 5: Review the final commit boundary**

Run `git show --stat --oneline HEAD`, `git status --short`, and search the committed diff for unrelated concurrent feature names. Confirm pre-existing working-tree changes remain uncommitted and no deployment occurred.
