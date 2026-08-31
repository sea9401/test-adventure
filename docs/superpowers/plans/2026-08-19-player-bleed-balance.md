# Player Bleed Balance Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Raise all player-origin bleed to a 0.45 ATK coefficient, preserve monster bleed at 0.12, and slow beastkin bleed stacking to 1/2 stacks.

**Architecture:** Replace the single bleed coefficient with explicit player and monster constants. Player presets and player-side bleed constructors use the player constant, while every `monsterOnly` bleed skill declares the monster constant in catalog data; existing `V2Dot` state, merge, tick, replay, and mitigation paths remain unchanged.

**Tech Stack:** TypeScript, Vitest, existing PvE/PvP combat engines

## Global Constraints

- Player bleed uses `flatPerStack: 10`, `atkCoefPerStack: 0.45`, `maxStacks: 10`, and `turns: 3` in PvE and PvP.
- Monster bleed keeps `flatPerStack: 10`, `atkCoefPerStack: 0.12`, `maxStacks: 10`, and `turns: 3`.
- `v2c_beastkin_rend` applies 1 bleed stack; `v2c_beastkin_clawflurry` applies 2.
- Blood Scent remains +2% direct physical skill damage per bleed stack, capped at +20%.
- Do not change poison, burn, status mitigation, the guaranteed-pattern 35% DoT multiplier, replay data, or saved combat state.
- Do not add upper-tier beastkin jobs, bleed consumption, bleed detonation, or a new combat resource.

---

### Task 1: Separate Player and Monster Bleed Coefficients

**Files:**
- Modify: `src/adventure/data/v2/v2CombatConstants.ts`
- Modify: `src/adventure/data/v2/statusEffects.ts`
- Modify: `src/adventure/data/v2/v2SkillCatalog.ts`
- Modify: `src/adventure/v2/combat/combatShared.ts`
- Modify: `src/adventure/v2/combat/engine.ts`
- Modify: `src/adventure/v2/combat/engine-pvp.ts`
- Modify: `src/lib/server/derivePlayerCombatV2.ts`
- Test: `src/adventure/data/v2/statusEffects.test.ts`
- Test: `src/adventure/data/v2/v2Skills.test.ts`
- Test: `src/adventure/battle/combatShared.test.ts`
- Test: `src/adventure/v2/combat/dotUnify.test.ts`

**Interfaces:**
- Consumes: existing `V2Dot`, `V2_DOT_PRESETS`, `makeBleedDot`, `V2_SKILLS`, and `monsterOnly` skill metadata.
- Produces: `PLAYER_BLEED_ATK_COEF_PER_STACK = 0.45`, `MONSTER_BLEED_ATK_COEF_PER_STACK = 0.12`, and `makeBleedDot({ ..., atkCoefPerStack? })` defaulting to the player coefficient.

- [x] **Step 1: Write failing constant, preset, constructor, and monster-catalog tests**

Add exact assertions:

```ts
expect(PLAYER_BLEED_ATK_COEF_PER_STACK).toBe(0.45);
expect(MONSTER_BLEED_ATK_COEF_PER_STACK).toBe(0.12);
expect(V2_DOT_PRESETS.출혈.atkCoefPerStack).toBe(
  PLAYER_BLEED_ATK_COEF_PER_STACK,
);

const playerBleed = makeBleedDot({ flatPerStack: 10, sourceAtk: 100 });
expect(playerBleed.atkCoefPerStack).toBe(PLAYER_BLEED_ATK_COEF_PER_STACK);
expect(v2DotPerStackDamage(playerBleed, 10_000)).toBe(55);

const monsterBleedEffects = Object.values(V2_SKILLS)
  .filter((skill) => skill.monsterOnly)
  .flatMap((skill) => skill.effects)
  .filter((effect) => effect.kind === "dot" && effect.tag === "bleed");
expect(monsterBleedEffects).not.toHaveLength(0);
expect(monsterBleedEffects.every(
  (effect) => effect.atkCoefPerStack === MONSTER_BLEED_ATK_COEF_PER_STACK,
)).toBe(true);
```

Update the `mob_rending_claw` cast expectation to require the monster coefficient instead of spreading the player preset unchanged.

- [x] **Step 2: Run the focused tests and verify RED**

Run:

```bash
npm test -- src/adventure/data/v2/statusEffects.test.ts src/adventure/data/v2/v2Skills.test.ts src/adventure/battle/combatShared.test.ts src/adventure/v2/combat/dotUnify.test.ts
```

Expected: FAIL because the new constants do not exist, player bleed is still 0.12, and the monster skill still inherits the shared preset.

- [x] **Step 3: Implement explicit coefficient ownership**

Replace the old single constant with:

```ts
export const PLAYER_BLEED_ATK_COEF_PER_STACK = 0.45;
export const MONSTER_BLEED_ATK_COEF_PER_STACK = 0.12;
```

Use the player constant in `V2_DOT_PRESETS.출혈`, `makeBleedDot` defaults, and derived player equipment. Allow explicit constructor data without adding state fields:

```ts
export function makeBleedDot(args: {
  stacks?: number;
  turns?: number;
  flatPerStack: number;
  atkCoefPerStack?: number;
  sourceAtk: number;
}): V2Dot {
  return {
    // existing fields unchanged
    atkCoefPerStack:
      args.atkCoefPerStack ?? PLAYER_BLEED_ATK_COEF_PER_STACK,
  };
}
```

Make `mob_rending_claw` explicit:

```ts
effects: [{
  kind: "dot",
  ...V2_DOT_PRESETS.출혈,
  atkCoefPerStack: MONSTER_BLEED_ATK_COEF_PER_STACK,
}],
```

Pass an equipped player's explicit coefficient into the generic constructor in both engines:

```ts
makeBleedDot({
  stacks: bleedStacks,
  flatPerStack: player.bleedOnHit?.flatPerStack ?? 0,
  atkCoefPerStack: player.bleedOnHit?.atkCoefPerStack,
  sourceAtk: player.atk,
});
```

Use the equivalent `attacker.player` fields in PvP. Player tier-6 effects that do not pass an override continue to use the player default.

Update old constant imports and formula comments without changing poison or burn.

- [x] **Step 4: Run the focused tests and verify GREEN**

Run the Step 2 command.

Expected: all four files pass; player bleed resolves to 55 per stack at ATK 100 and all monster-only bleed effects stay at 0.12.

- [x] **Step 5: Commit the coefficient split**

```bash
git add src/adventure/data/v2/v2CombatConstants.ts src/adventure/data/v2/statusEffects.ts src/adventure/data/v2/v2SkillCatalog.ts src/adventure/v2/combat/combatShared.ts src/adventure/v2/combat/engine.ts src/adventure/v2/combat/engine-pvp.ts src/lib/server/derivePlayerCombatV2.ts src/adventure/data/v2/statusEffects.test.ts src/adventure/data/v2/v2Skills.test.ts src/adventure/battle/combatShared.test.ts src/adventure/v2/combat/dotUnify.test.ts
git commit -m "balance: separate player and monster bleed damage"
```

### Task 2: Slow Beastkin Bleed Stacking

**Files:**
- Modify: `src/adventure/data/v2/v2SkillsCommonCatalog.ts`
- Test: `src/adventure/data/v2/v2SkillsByJob.test.ts`
- Test: `src/adventure/v2/combat/combatPatternCast.test.ts`

**Interfaces:**
- Consumes: the player bleed preset from Task 1 and existing beastkin skill IDs.
- Produces: `v2c_beastkin_rend` with 1 stack and `v2c_beastkin_clawflurry` with 2 stacks; direct damage and Blood Scent remain unchanged.

- [x] **Step 1: Change the beastkin catalog assertions to the approved stack counts**

```ts
expect(V2_SKILLS.v2c_beastkin_rend.effects).toEqual(
  expect.arrayContaining([
    expect.objectContaining({ kind: "dot", tag: "bleed", stacks: 1 }),
  ]),
);
expect(V2_SKILLS.v2c_beastkin_clawflurry.effects).toEqual(
  expect.arrayContaining([
    expect.objectContaining({ kind: "dot", tag: "bleed", stacks: 2 }),
  ]),
);
expect(V2_SKILLS.v2c_beastkin_bloodscent.passive).toMatchObject({
  bleedPhysicalSkillDamagePctPerStack: 2,
});
```

In the combat cast test, assert that each skill's `dotsToApplyToTarget` entry carries the same 1/2 stack contract and the player coefficient.

- [x] **Step 2: Run the beastkin tests and verify RED**

Run:

```bash
npm test -- src/adventure/data/v2/v2SkillsByJob.test.ts src/adventure/v2/combat/combatPatternCast.test.ts
```

Expected: FAIL because the catalog still emits 2/3 stacks.

- [x] **Step 3: Apply the approved 1/2 stack values**

```ts
{ kind: "dot", ...V2_DOT_PRESETS.출혈, stacks: 1 }
{ kind: "dot", ...V2_DOT_PRESETS.출혈, stacks: 2 }
```

Do not alter direct damage effects, MP costs, proc chances, or Blood Scent.

- [x] **Step 4: Run the beastkin tests and verify GREEN**

Run the Step 2 command.

Expected: both files pass and cast output uses 1/2 stacks with the player coefficient.

- [x] **Step 5: Commit the stack adjustment**

```bash
git add src/adventure/data/v2/v2SkillsCommonCatalog.ts src/adventure/data/v2/v2SkillsByJob.test.ts src/adventure/v2/combat/combatPatternCast.test.ts
git commit -m "balance: slow beastkin bleed stacking"
```

### Task 3: Verify PvE, PvP, and Regression Safety

**Files:**
- Modify: `src/adventure/v2/combat/engine.dotClock.test.ts`
- Modify: `src/adventure/v2/combat/dotUnify.test.ts`

**Interfaces:**
- Consumes: the explicit player/monster constants and 1/2 beastkin stack contract.
- Produces: evidence that real player equipment, PvP players, monsters, DoT clocks, status mitigation, and unrelated status effects remain correct.

- [x] **Step 1: Update only stale constant names and arithmetic expectations**

Use `PLAYER_BLEED_ATK_COEF_PER_STACK` for player-generated fixtures and
`MONSTER_BLEED_ATK_COEF_PER_STACK` for monster-generated fixtures. Preserve tests that intentionally pass a custom `atkCoefPerStack` to exercise generic engine behavior.

- [x] **Step 2: Run all bleed and status-focused tests**

Run:

```bash
npm test -- src/adventure/data/v2/statusEffects.test.ts src/adventure/data/v2/v2Skills.test.ts src/adventure/data/v2/v2SkillsByJob.test.ts src/adventure/battle/combatShared.test.ts src/adventure/battle/engine-pvp.test.ts src/adventure/v2/combat/dotUnify.test.ts src/adventure/v2/combat/engine.dotClock.test.ts src/adventure/v2/combat/combatPatternCast.test.ts src/adventure/v2/combat/statusDamageReduction.test.ts
```

Expected: all focused files pass.

- [x] **Step 3: Run repository-wide verification**

Run:

```bash
npm test
npx tsc --noEmit
npm run lint
npm run build
git diff --check
```

Expected: all commands exit 0; image checks report no missing references; production build completes.

- [x] **Step 4: Confirm scope and commit any test-only compatibility updates**

Run:

```bash
rg -n "BLEED_ATK_COEF_PER_STACK|PLAYER_BLEED_ATK_COEF_PER_STACK|MONSTER_BLEED_ATK_COEF_PER_STACK" src
git diff --stat
git diff --check
```

Expected: the old undifferentiated constant has no production references, player and monster constants appear in the intended paths, and no poison/burn implementation changed.

Commit the test constant renames and arithmetic updates:

```bash
git add src/adventure
git commit -m "test: cover player and monster bleed balance"
```
