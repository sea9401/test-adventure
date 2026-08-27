# Life Resource Growth Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace volatile INT-derived MP for new combat lives with persisted random HP/MP life growth whose floor and ceiling improve from permanent stat floors and cultivation caps, while grandfathering existing lives.

**Architecture:** Add a client/server-safe pure `lifeResourceGrowth` module for range calculation, parsing, initial rolls, and per-level accumulation. Persist an optional versioned record inside `proficiency.v2`; its absence selects the byte-compatible legacy derive path. Route handlers create or advance the record atomically with existing character/proficiency writes, and state/UI surfaces the active or next-life ranges.

**Tech Stack:** TypeScript, Next.js 16 Route Handlers, React 19, Vitest, Drizzle-backed `savesKv`

## Global Constraints

- Base floor/cap are 15/60 and each complete +10 permanent points adds one resource-growth step.
- STR controls HP minimum, VIT controls HP width, SPI controls MP minimum, INT controls MP width.
- Base ranges are Lv.1 HP `150..180`, Lv.1 MP `65..95`, per-level HP `8..12`, and per-level MP `3..5`.
- New-life results persist and never recalculate from loadout, equipment, job bonus, or stat-percent changes.
- STR/VIT direct HP, equipment HP/MP, `maxHpPct`, and `maxMpPct` keep their existing effects and ordering.
- Existing characters without a life record remain fully legacy until a completed Lv.100 combat rejob.
- Lv.1 lifestyle switching must not reroll resources.
- Do not deploy or run maintenance mode.
- Follow installed Next.js 16.2.11 Route Handler conventions; handlers continue to return Web `Response.json(...)` values and non-GET mutations remain uncached.

---

### Task 1: Pure life-resource model and persistence parsing

**Files:**
- Create: `src/adventure/data/v2/lifeResourceGrowth.ts`
- Create: `src/adventure/data/v2/lifeResourceGrowth.test.ts`
- Modify: `src/adventure/data/v2/proficiency.ts`
- Test: `src/adventure/data/v2/proficiency.test.ts`

**Interfaces:**
- Produces `V2LifeResourceGrowth`, `V2LifeResourceRanges`, `parseLifeResourceGrowth`, `lifeResourceRanges`, `rollInitialLifeResourceGrowth`, `rollLifeResourceLevels`, and `resetLifeResourceLevels`.
- Adds optional `lifeResourceGrowth?: V2LifeResourceGrowth` to `V2ProficiencyState` and preserves it through parse/round-trip helpers.

- [ ] **Step 1: Write failing range, RNG-boundary, accumulation, mismatch, and parse tests**

```ts
expect(lifeResourceRanges({ strFloor: 15, vitCap: 60, spiFloor: 15, intCap: 60 })).toEqual({
  baseHp: { min: 120, max: 150 },
  baseMp: { min: 65, max: 95 },
  hpPerLevel: { min: 8, max: 12 },
  mpPerLevel: { min: 3, max: 5 },
});
expect(rollInitialLifeResourceGrowth(baseRanges, () => 0)).toMatchObject({ baseHp: 120, baseMp: 65, rolledLevel: 1 });
expect(rollInitialLifeResourceGrowth(baseRanges, () => 0.999999)).toMatchObject({ baseHp: 150, baseMp: 95 });
expect(() => rollLifeResourceLevels(recordAtLevel1, 2, 1, baseRanges, () => 0)).toThrow("life_resource_level_mismatch");
expect(parseProficiency({ lifeResourceGrowth: validRecord }).lifeResourceGrowth).toEqual(validRecord);
```

- [ ] **Step 2: Run focused tests and confirm they fail because the module/field does not exist**

Run: `npm test -- src/adventure/data/v2/lifeResourceGrowth.test.ts src/adventure/data/v2/proficiency.test.ts`

- [ ] **Step 3: Implement the independent pure model and parser**

```ts
export type V2LifeResourceGrowth = {
  version: 1;
  rolledLevel: number;
  baseHp: number;
  baseMp: number;
  gainedHp: number;
  gainedMp: number;
};

export function lifeResourceRanges(input: PermanentResourceStats): V2LifeResourceRanges {
  const str = step(input.strFloor, 15);
  const spi = step(input.spiFloor, 15);
  const vit = step(input.vitCap, 60);
  const int = step(input.intCap, 60);
  const hpMin = 120 + 2 * str;
  const mpMin = 65 + spi;
  const hpLevelMin = 8 + str;
  const mpLevelMin = 3 + spi;
  return {
    baseHp: { min: hpMin, max: hpMin + 30 + 2 * vit },
    baseMp: { min: mpMin, max: mpMin + 30 + int },
    hpPerLevel: { min: hpLevelMin, max: hpLevelMin + 4 + vit },
    mpPerLevel: { min: mpLevelMin, max: mpLevelMin + 2 + int },
  };
}
```

- [ ] **Step 4: Add the optional proficiency field, strict parsing, and non-destructive preservation**

`emptyProficiency()` must omit the field so existing saves remain legacy. `parseProficiency()` copies a valid version-1 record and omits invalid records. Existing spread-based helpers preserve it. `resetCultivation()` calls `resetLifeResourceLevels(record)` so a level reset keeps the original Lv.1 roll, clears gained totals, and sets `rolledLevel: 1` without granting a reroll.

- [ ] **Step 5: Run focused tests and confirm they pass**

Run: `npm test -- src/adventure/data/v2/lifeResourceGrowth.test.ts src/adventure/data/v2/proficiency.test.ts`

- [ ] **Step 6: Commit the pure model**

```bash
git add src/adventure/data/v2/lifeResourceGrowth.ts src/adventure/data/v2/lifeResourceGrowth.test.ts src/adventure/data/v2/proficiency.ts src/adventure/data/v2/proficiency.test.ts
git commit -m "feat: add persisted life resource rolls"
```

### Task 2: Permanent-range adapter and dual legacy/new combat derive

**Files:**
- Modify: `src/adventure/data/v2/statGrowth.ts`
- Test: `src/adventure/data/v2/statGrowth.test.ts`
- Modify: `src/lib/server/derivePlayerCombatV2.ts`
- Test: `src/lib/server/derivePlayerCombatV2.test.ts`

**Interfaces:**
- Produces `lifeResourceRangesForProficiency(prof): V2LifeResourceRanges` from `computeStatFloors`, `capGain`, and `effectiveStatCap`.
- `derivePlayerCombatV2Pure` consumes optional `lifeResourceGrowth`; `derivePlayerCombatV2FromSaves` passes the parsed proficiency record.

- [ ] **Step 1: Write failing permanent-step and derive compatibility tests**

```ts
const base = lifeResourceRangesForProficiency(emptyProficiency());
const progressed = lifeResourceRangesForProficiency({
  ...emptyProficiency(),
  statFloorLevels: { warrior: 10_000, mage: 10_000 },
  caps: { vit: 10, int: 10 },
});
expect(progressed.hpPerLevel.min).toBeGreaterThan(base.hpPerLevel.min);
expect(progressed.hpPerLevel.max).toBeGreaterThan(base.hpPerLevel.max);
expect(progressed.mpPerLevel.min).toBeGreaterThan(base.mpPerLevel.min);
expect(progressed.mpPerLevel.max).toBeGreaterThan(base.mpPerLevel.max);
expect(derivePlayerCombatV2Pure({ level: 100, lifeResourceGrowth: life, statPct: { int: 100 }, v2Equipped: {} }).player.maxMp)
  .toBe(derivePlayerCombatV2Pure({ level: 100, lifeResourceGrowth: life, v2Equipped: {} }).player.maxMp);
expect(derivePlayerCombatV2Pure({ level: 100, v2Equipped: {} }).player.maxMp).toBe(V2_BASE_MP + 99 * V2_MP_PER_LEVEL + 15 * MP_PER_INT);
```

- [ ] **Step 2: Run focused tests and verify the new-record expectations fail while legacy goldens still pass**

Run: `npm test -- src/adventure/data/v2/statGrowth.test.ts src/lib/server/derivePlayerCombatV2.test.ts`

- [ ] **Step 3: Implement the adapter and branch only the intrinsic resource formulas**

For a valid life record use `baseHp + gainedHp` instead of `V2_BASE_HP + level growth`, then add existing STR/VIT direct HP. For MP use `baseMp + gainedMp + equipAcc.mp`, remove level/INT terms, and keep `maxMpPct`. When the field is absent, execute the current formulas without reordering operations.

- [ ] **Step 4: Add explicit tests for equipment MP, maxMpPct, STR/VIT statPct HP, food flat resources, current-resource clamping, and FromSaves propagation**

- [ ] **Step 5: Run focused tests and confirm they pass**

Run: `npm test -- src/adventure/data/v2/statGrowth.test.ts src/lib/server/derivePlayerCombatV2.test.ts`

- [ ] **Step 6: Commit the derive integration**

```bash
git add src/adventure/data/v2/statGrowth.ts src/adventure/data/v2/statGrowth.test.ts src/lib/server/derivePlayerCombatV2.ts src/lib/server/derivePlayerCombatV2.test.ts
git commit -m "feat: derive resources from life growth"
```

### Task 3: New-character and combat-rejob lifecycle boundaries

**Files:**
- Modify: `src/lib/server/v2Character.ts`
- Create: `src/lib/server/v2Character.test.ts`
- Modify: `src/app/api/v2/me/advance-class/route.ts`
- Test: `src/lib/server/advanceClassRoute.test.ts`
- Modify: `src/app/api/v2/me/class-element/route.ts`
- Test: `src/lib/server/classElementRoute.test.ts`
- Test: `src/app/api/v2/me/cultivate/reset/route.test.ts`
- Test: `src/app/api/v2/me/use-cash-item/route.test.ts`

**Interfaces:**
- New-character seeding and completed combat rejob call `rollInitialLifeResourceGrowth(lifeResourceRangesForProficiency(prof), rng)`.
- Successful rejob responses add `lifeResources: { maxHp, maxMp, hpPerLevel, mpPerLevel }` only when a new life was rolled.

- [ ] **Step 1: Write failing lifecycle tests**

Cover: brand-new missing `character.v2` creates a life record; existing character/proficiency without a record stays legacy; Lv.100 combat rejob creates/replaces a record; Lv.1 lifestyle switch preserves a record or preserves legacy absence; cultivation resets keep `baseHp/baseMp` but clear gains without reroll.

- [ ] **Step 2: Run lifecycle tests and confirm the assertions fail**

Run: `npm test -- src/lib/server/v2Character.test.ts src/lib/server/advanceClassRoute.test.ts src/lib/server/classElementRoute.test.ts src/app/api/v2/me/cultivate/reset/route.test.ts src/app/api/v2/me/use-cash-item/route.test.ts`

- [ ] **Step 3: Seed only truly new characters**

Extend `ensureV2Character(executor, userId, rng = Math.random)` so the existing-row early return remains unchanged. On a missing character row, create `character.v2`, lock/read `proficiency.v2`, add an initial life record, and upsert it in the same transaction.

- [ ] **Step 4: Roll only at completed combat-life transitions**

In core-loop `advance-class`, use the existing `completedCombatCycle` predicate. Lifestyle/revisit paths preserve the record exactly. In legacy/class-element rejob paths, roll only when the source character actually completed the applicable combat cap. Return the newly derived max resources and growth ranges for the success message.

- [ ] **Step 5: Preserve initial rolls across cultivation resets**

Both paid and cash-item reset routes rely on `resetCultivation()` returning a record with `rolledLevel: 1`, zero gains, and unchanged bases. Legacy absence remains absent.

- [ ] **Step 6: Run lifecycle tests and confirm they pass**

Run: `npm test -- src/lib/server/v2Character.test.ts src/lib/server/advanceClassRoute.test.ts src/lib/server/classElementRoute.test.ts src/app/api/v2/me/cultivate/reset/route.test.ts src/app/api/v2/me/use-cash-item/route.test.ts`

- [ ] **Step 7: Commit lifecycle transitions**

```bash
git add src/lib/server/v2Character.ts src/lib/server/v2Character.test.ts src/app/api/v2/me/advance-class/route.ts src/lib/server/advanceClassRoute.test.ts src/app/api/v2/me/class-element/route.ts src/lib/server/classElementRoute.test.ts src/app/api/v2/me/cultivate/reset/route.test.ts src/app/api/v2/me/use-cash-item/route.test.ts
git commit -m "feat: start resource rolls on combat lives"
```

### Task 4: Every server level-up path advances the same life record

**Files:**
- Modify: `src/app/api/v2/dungeon/hunt/huntProficiency.ts`
- Test: `src/app/api/v2/dungeon/hunt/huntProficiency.test.ts`
- Modify: `src/app/api/v2/dungeon/hunt/route.ts`
- Modify: `src/lib/server/expTomeGrant.ts`
- Test: `src/lib/server/expTomeGrant.test.ts`
- Modify: `src/lib/server/levelTargetGrant.ts`
- Test: `src/lib/server/levelTargetGrant.test.ts`
- Modify: `src/app/api/v2/dev/grant/route.ts`

**Interfaces:**
- Level helpers return actual `hpGain` and `mpGain` alongside the next proficiency.
- `rollLifeResourceLevels(record, startLevel, levelsGained, ranges, rng)` returns `{ record, hpGain, mpGain }`; legacy callers use `v2LevelGrowthHpMp` exactly as before.

- [ ] **Step 1: Write failing tests for new and legacy level gains**

```ts
expect(newLifeResult).toMatchObject({ hpGain: 16, mpGain: 6 }); // two levels with min RNG
expect(newLifeResult.proficiency.lifeResourceGrowth).toMatchObject({ rolledLevel: 3, gainedHp: 16, gainedMp: 6 });
expect(legacyResult.proficiency.lifeResourceGrowth).toBeUndefined();
expect(legacyDisplayedGain).toEqual(v2LevelGrowthHpMp({ levelsGained, strGained, vitGained, intGained }));
```

- [ ] **Step 2: Run focused tests and confirm they fail on missing resource totals**

Run: `npm test -- src/app/api/v2/dungeon/hunt/huntProficiency.test.ts src/lib/server/expTomeGrant.test.ts src/lib/server/levelTargetGrant.test.ts`

- [ ] **Step 3: Integrate the shared roll after permanent progression is updated**

For new lives, calculate ranges from the updated proficiency and roll once per gained level. For legacy lives, do not add a record and keep current display math. Use the same injected RNG as stat growth but independent calls per HP and MP roll.

- [ ] **Step 4: Wire actual gains into hunt single/batch responses and grant responses**

Remove the unconditional post-hoc `v2LevelGrowthHpMp` call in hunt; consume `hpGain/mpGain` returned by `applyHuntProficiency`. Include totals in EXP-tome and level-target responses. Route transactions continue to save character and proficiency atomically.

- [ ] **Step 5: Bring the development grant onto the same level-target/EXP growth helper**

Any positive level delta in `v2/dev/grant` must lock proficiency even when no proficiency/mastery currency is granted, advance stat and life growth, and save the returned state. Level decreases remain a development-only direct assignment and must not roll negative growth.

- [ ] **Step 6: Run focused tests and confirm they pass**

Run: `npm test -- src/app/api/v2/dungeon/hunt/huntProficiency.test.ts src/lib/server/expTomeGrant.test.ts src/lib/server/levelTargetGrant.test.ts`

- [ ] **Step 7: Commit all level paths**

```bash
git add src/app/api/v2/dungeon/hunt/huntProficiency.ts src/app/api/v2/dungeon/hunt/huntProficiency.test.ts src/app/api/v2/dungeon/hunt/route.ts src/lib/server/expTomeGrant.ts src/lib/server/expTomeGrant.test.ts src/lib/server/levelTargetGrant.ts src/lib/server/levelTargetGrant.test.ts src/app/api/v2/dev/grant/route.ts
git commit -m "feat: roll resources on every level up"
```

### Task 5: State API, stat copy, character view, and rejob feedback

**Files:**
- Modify: `src/app/api/v2/me/state/stateSections.ts`
- Test: `src/app/api/v2/me/state/stateSections.test.ts`
- Modify: `src/adventure/data/v2/v2StatKeys.ts`
- Create: `src/adventure/data/v2/v2StatKeys.test.ts`
- Modify: `src/adventure/v2/V2CharacterScreen.tsx`
- Modify: `src/adventure/v2/V2JobLadder.tsx`
- Test: `src/adventure/v2/V2JobLadder.test.tsx`
- Modify: `src/adventure/v2/V2ClassGrid.tsx`

**Interfaces:**
- `proficiencySection` adds `lifeResourceGrowth: { mode: "legacy" | "rolled"; currentRanges: V2LifeResourceRanges; appliesAfterRejob: boolean }`.
- Rejob response readers consume optional `lifeResources` and include rolled totals/ranges in the success message.

- [ ] **Step 1: Write failing state-section, copy, and rejob-message tests**

Assert new records return `mode: "rolled"`; absent records return `mode: "legacy"` plus a next-life preview; descriptions contain `HP 성장 최솟값`, `HP 성장 최댓값`, `MP 성장 최솟값`, and `MP 성장 최댓값`; a successful combat rejob message includes the new HP/MP and growth ranges.

- [ ] **Step 2: Run focused UI/state tests and confirm they fail**

Run: `npm test -- src/app/api/v2/me/state/stateSections.test.ts src/adventure/data/v2/v2StatKeys.test.ts src/adventure/v2/V2JobLadder.test.tsx`

- [ ] **Step 3: Expose resource mode and ranges from the state API**

Build ranges with the same shared adapter. Never label the preview as active for legacy characters. Keep response fields additive so existing clients remain compatible.

- [ ] **Step 4: Update stat explanations and render an opaque character-detail inset**

Add a compact block under `StatsPanel` using `SURFACE_INSET`: rolled lives show current `HP +min~max / MP +min~max` per level; legacy lives say the current life uses the old formula and show the range that begins after the next completed combat rejob. Do not place translucent content over the region background.

- [ ] **Step 5: Include rolled resource details in both core and legacy rejob success feedback**

Parse additive response fields defensively. If absent, preserve the old message exactly.

- [ ] **Step 6: Run focused UI/state tests and confirm they pass**

Run: `npm test -- src/app/api/v2/me/state/stateSections.test.ts src/adventure/data/v2/v2StatKeys.test.ts src/adventure/v2/V2JobLadder.test.tsx`

- [ ] **Step 7: Commit user-visible resource growth**

```bash
git add src/app/api/v2/me/state/stateSections.ts src/app/api/v2/me/state/stateSections.test.ts src/adventure/data/v2/v2StatKeys.ts src/adventure/data/v2/v2StatKeys.test.ts src/adventure/v2/V2CharacterScreen.tsx src/adventure/v2/V2JobLadder.tsx src/adventure/v2/V2JobLadder.test.tsx src/adventure/v2/V2ClassGrid.tsx
git commit -m "feat: explain life resource growth"
```

### Task 6: Full regression and balance verification

**Files:**
- Modify only files required to fix failures caused by Tasks 1–5.

**Interfaces:**
- No new interface; this task verifies the completed slice.

- [ ] **Step 1: Run all focused suites together**

Run: `npm test -- src/adventure/data/v2/lifeResourceGrowth.test.ts src/adventure/data/v2/proficiency.test.ts src/adventure/data/v2/statGrowth.test.ts src/lib/server/derivePlayerCombatV2.test.ts src/lib/server/v2Character.test.ts src/lib/server/advanceClassRoute.test.ts src/lib/server/classElementRoute.test.ts src/app/api/v2/me/cultivate/reset/route.test.ts src/app/api/v2/me/use-cash-item/route.test.ts src/app/api/v2/dungeon/hunt/huntProficiency.test.ts src/lib/server/expTomeGrant.test.ts src/lib/server/levelTargetGrant.test.ts src/app/api/v2/me/state/stateSections.test.ts src/adventure/data/v2/v2StatKeys.test.ts src/adventure/v2/V2JobLadder.test.tsx`

- [ ] **Step 2: Verify type safety and lint for touched files**

Run: `npx tsc --noEmit`

Run: `npx eslint src/adventure/data/v2/lifeResourceGrowth.ts src/adventure/data/v2/lifeResourceGrowth.test.ts src/adventure/data/v2/proficiency.ts src/adventure/data/v2/statGrowth.ts src/lib/server/derivePlayerCombatV2.ts src/lib/server/v2Character.ts src/app/api/v2/me/advance-class/route.ts src/app/api/v2/me/class-element/route.ts src/app/api/v2/dungeon/hunt/huntProficiency.ts src/app/api/v2/dungeon/hunt/route.ts src/lib/server/expTomeGrant.ts src/lib/server/levelTargetGrant.ts src/app/api/v2/dev/grant/route.ts src/app/api/v2/me/state/stateSections.ts src/adventure/data/v2/v2StatKeys.ts src/adventure/v2/V2CharacterScreen.tsx src/adventure/v2/V2JobLadder.tsx src/adventure/v2/V2ClassGrid.tsx`

- [ ] **Step 3: Run the full unit suite**

Run: `npm test`

- [ ] **Step 4: Check image references and production build because UI and Route Handlers changed**

Run: `npm run check-images`

Run: `npm run build`

- [ ] **Step 5: Verify the acceptance arithmetic with a deterministic script/test**

Confirm baseline expected Lv.100 MP is 476, baseline expected intrinsic HP is 1,125 before direct STR/VIT, all permanent step increases are monotonic, and baseline HP/MP expectations stay within 5% of legacy representatives.

- [ ] **Step 6: Review the final diff for whitespace errors and unintended files**

```bash
git diff --check
git status --short
```
