# Primordial Mage Equipment Crit Conversion Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add the 6th-tier Primordial Mage passive `원초 증폭`, which converts equipped-item critical-damage bonuses through a diminishing curve into extra critical damage for direct magic skill damage only.

**Architecture:** A client-safe pure module owns the `0.75 × (1 − exp(−E/2))` curve. Equipped-passive aggregation enables the conversion, server combat derivation feeds only `equipAcc.critMult` into the curve, and a shared PvE/PvP damage helper adds the resulting multiplier only to the tracked magic portion of a critical skill. Character stats render the normal skill-critical multiplier and the conditional magic multiplier separately.

**Tech Stack:** TypeScript, React, Next.js App Router, Vitest, existing V2 combat and equipment derivation modules.

## Global Constraints

- Read and follow `node_modules/next/dist/docs/01-app/02-guides/testing/vitest.md` and `node_modules/next/dist/docs/01-app/01-getting-started/05-server-and-client-components.md` before code changes.
- Add `원초 증폭` to 6th-tier `태초술사` as a third learnable/equippable passive with learn cost 12,000 and explicit equip cost 12 SP.
- Use only equipped-item `critMult`, including active ordinary-set and tag-set bonuses; do not convert STR, LUK, passive critical damage, overflow, or existing `skillCritDmgPct`.
- Apply the bonus only to direct `magic`/`spi` skill damage; do not affect physical damage, DoT, healing, shields, or magic basic attacks.
- Preserve existing behavior and RNG consumption when the passive is absent or equipment critical damage is zero.
- Keep PvE and PvP formulas identical through shared pure helpers.
- Do not change existing equipment values, the 75% critical-chance cap, or `SKILL_CRIT_MULT = 1.7`.
- Do not deploy.
- Preserve unrelated untracked paths `NUL` and `_workspace/`.

---

### Task 1: Add the curve and Primordial Mage passive contract

**Files:**
- Create: `src/adventure/data/v2/skillCritical.ts`
- Create: `src/adventure/data/v2/skillCritical.test.ts`
- Modify: `src/adventure/data/v2/v2Skills.ts`
- Modify: `src/adventure/data/v2/v2SkillsCommonCatalog.ts`
- Modify: `src/adventure/data/v2/v2SkillsByJob.ts`
- Modify: `src/adventure/data/v2/v2Skills.test.ts`
- Modify: `src/adventure/data/v2/v2SkillsByJob.test.ts`
- Modify: `src/adventure/data/v2/buildTags.ts`
- Modify: `src/adventure/data/v2/buildTags.test.ts`

**Interfaces:**
- Produces: `equipmentMagicSkillCritBonus(equipmentCritMult: number): number`, accepting multiplier units (`1 = +1.00×`) and returning multiplier units in `[0, 0.75)`.
- Produces: `V2PassiveSkillEffect.equipmentMagicSkillCritConversion?: boolean`.
- Produces: `aggregateEquippedPassives(...).equipmentMagicSkillCritConversion: boolean`.
- Produces: skill ID `v2c_primordialmage_amplification` with name `원초 증폭`, learn cost `12000`, and SP cost `12`.

- [ ] **Step 1: Write failing curve and catalog tests**

```ts
expect(equipmentMagicSkillCritBonus(-1)).toBe(0);
expect(equipmentMagicSkillCritBonus(0)).toBe(0);
expect(equipmentMagicSkillCritBonus(1)).toBeCloseTo(0.75 * (1 - Math.exp(-0.5)), 10);
expect(equipmentMagicSkillCritBonus(5)).toBeCloseTo(0.75 * (1 - Math.exp(-2.5)), 10);
expect(equipmentMagicSkillCritBonus(1_000)).toBeLessThanOrEqual(0.75);

const skill = V2_SKILLS.v2c_primordialmage_amplification;
expect(skill).toMatchObject({
  name: "원초 증폭",
  category: "passive",
  learnCost: 12_000,
  spCost: 12,
  passive: { equipmentMagicSkillCritConversion: true },
});
expect(spCostOf(skill)).toBe(12);
expect(skillsForJob("primordialmage")).toContain(skill.id);
expect(aggregateEquippedPassives([skill.id]).equipmentMagicSkillCritConversion).toBe(true);
expect(describeV2Skill(skill)).toContain("장비 치명타 피해");
expect(describeV2Skill(skill)).toContain("최대 +75%");
expect(buildTagsForSkill(skill)).toEqual(expect.arrayContaining(["magic", "crit"]));
```

- [ ] **Step 2: Run the focused tests and verify RED**

Run: `npm test -- src/adventure/data/v2/skillCritical.test.ts src/adventure/data/v2/v2Skills.test.ts src/adventure/data/v2/v2SkillsByJob.test.ts src/adventure/data/v2/buildTags.test.ts`

Expected: FAIL because the curve export, passive field, skill ID, and Primordial Mage mapping do not exist.

- [ ] **Step 3: Implement the pure curve**

```ts
export const EQUIPMENT_MAGIC_SKILL_CRIT_CAP = 0.75;
export const EQUIPMENT_MAGIC_SKILL_CRIT_SCALE = 2;

export function equipmentMagicSkillCritBonus(equipmentCritMult: number): number {
  const normalized = Number.isFinite(equipmentCritMult)
    ? Math.max(0, equipmentCritMult)
    : 0;
  return Math.min(
    EQUIPMENT_MAGIC_SKILL_CRIT_CAP,
    EQUIPMENT_MAGIC_SKILL_CRIT_CAP *
      (1 - Math.exp(-normalized / EQUIPMENT_MAGIC_SKILL_CRIT_SCALE)),
  );
}
```

- [ ] **Step 4: Implement the passive definition and aggregation**

Add `equipmentMagicSkillCritConversion?: boolean` to `V2PassiveSkillEffect`, boolean-OR it in `aggregateEquippedPassives`, describe it with the maximum `+75%` chip, and give it a conditional power-score contribution so the generic rubric understands the effect while the explicit `spCost: 12` remains authoritative.

```ts
v2c_primordialmage_amplification: {
  id: "v2c_primordialmage_amplification",
  name: "원초 증폭",
  stat: "int",
  category: "passive",
  tier: 3,
  description:
    "장비에 깃든 치명의 힘을 원초 마력으로 증폭한다. 장비 치명타 피해가 직접 마법 스킬의 치명타 피해로 점감 전환되며 최대 +75%까지 증가한다.",
  mpCost: 0,
  cooldown: 0,
  learnCost: 12_000,
  spCost: 12,
  effects: [],
  passive: { equipmentMagicSkillCritConversion: true },
},
```

Append the new ID to the compile-time union and to the Primordial Mage list:

```ts
primordialmage: [
  "v2c_primordialmage_return",
  "v2c_primordialmage_resonance",
  "v2c_primordialmage_amplification",
],
```

Add `crit` and `magic` build tags when the marker is present.

- [ ] **Step 5: Run the focused tests and verify GREEN**

Run: `npm test -- src/adventure/data/v2/skillCritical.test.ts src/adventure/data/v2/v2Skills.test.ts src/adventure/data/v2/v2SkillsByJob.test.ts src/adventure/data/v2/buildTags.test.ts`

Expected: PASS.

### Task 2: Derive the equipment-only magic critical bonus

**Files:**
- Modify: `src/lib/server/derivePlayerCombatV2.ts`
- Modify: `src/lib/server/derivePlayerCombatV2.test.ts`
- Modify: `src/adventure/v2/combat/engineState.ts`
- Modify: `src/adventure/v2/V2CharacterScreen.tsx`

**Interfaces:**
- Consumes: `equipmentMagicSkillCritBonus(equipmentCritMult: number): number` and the aggregate marker from Task 1.
- Produces: `DerivePlayerCombatV2PureInput.passiveEquipmentMagicSkillCritConversion?: boolean`.
- Produces: `PlayerCombat.equipmentMagicSkillCritDmgPct?: number`, expressed as percentage points (`75 = +0.75×`). Presence, including value `0`, indicates that the passive is equipped.

- [ ] **Step 1: Write failing derivation tests**

Use a rolled `v2_silver_ring` to control the equipment input independently of STR/LUK/passives:

```ts
const derived = derivePlayerCombatV2Pure({
  level: 50,
  allocatedStats: { str: 500, luk: 500 },
  v2Equipped: { ring: "v2_silver_ring" },
  v2StatRolls: {
    v2_silver_ring: {
      power: V2_EQUIPMENT.v2_silver_ring.power,
      weight: 0,
      options: { critMult: 100 },
    },
  },
  passiveCritDmgPct: 500,
  passiveEquipmentMagicSkillCritConversion: true,
}).player;

expect(derived.equipmentMagicSkillCritDmgPct).toBeCloseTo(
  equipmentMagicSkillCritBonus(1) * 100,
  10,
);
expect(
  derivePlayerCombatV2Pure({
    level: 50,
    v2Equipped: {},
    passiveEquipmentMagicSkillCritConversion: true,
  }).player.equipmentMagicSkillCritDmgPct,
).toBe(0);
expect(
  derivePlayerCombatV2Pure({ level: 50, v2Equipped: {} }).player,
).not.toHaveProperty("equipmentMagicSkillCritDmgPct");

const fullSet = {
  armor: "v2_canyon_set_armor" as const,
  gloves: "v2_canyon_set_gloves" as const,
  boots: "v2_canyon_set_boots" as const,
};
const fullSetCritMult = aggregateV2Equipment(fullSet).critMult;
expect(
  derivePlayerCombatV2Pure({
    level: 50,
    v2Equipped: fullSet,
    passiveEquipmentMagicSkillCritConversion: true,
  }).player.equipmentMagicSkillCritDmgPct,
).toBeCloseTo(
  equipmentMagicSkillCritBonus(fullSetCritMult / 100) * 100,
  10,
);

const furyTagSet = {
  gloves: "v2_crafted_spark_gloves" as const,
  boots: "v2_crafted_fury_boots" as const,
};
const furyCritMult = aggregateV2Equipment(furyTagSet).critMult;
expect(
  derivePlayerCombatV2Pure({
    level: 50,
    v2Equipped: furyTagSet,
    passiveEquipmentMagicSkillCritConversion: true,
  }).player.equipmentMagicSkillCritDmgPct,
).toBeCloseTo(
  equipmentMagicSkillCritBonus(furyCritMult / 100) * 100,
  10,
);
```

The existing aggregate suite separately proves the exact `+30` ordinary-set and `+35` two-piece fury-tag deltas, so these derivation assertions cover consumption of both aggregate sources. Also assert that `derivePlayerCombatV2FromSaves` passes `passiveAgg.equipmentMagicSkillCritConversion` into the pure derivation input.

- [ ] **Step 2: Run the focused test and verify RED**

Run: `npm test -- src/lib/server/derivePlayerCombatV2.test.ts`

Expected: FAIL because the marker input and derived combat field do not exist.

- [ ] **Step 3: Implement the derivation path**

Import the curve into the pure derive module, add the marker input, and emit the optional combat field only when the passive is active:

```ts
...(input.passiveEquipmentMagicSkillCritConversion
  ? {
      equipmentMagicSkillCritDmgPct:
        equipmentMagicSkillCritBonus(equipAcc.critMult / 100) * 100,
    }
  : {}),
```

Pass `passiveAgg.equipmentMagicSkillCritConversion` from the saves wrapper. Add the optional number to `PlayerCombat` and the `V2CharacterScreen` combat prop type without importing server-only modules into the client graph.

- [ ] **Step 4: Run the focused test and verify GREEN**

Run: `npm test -- src/lib/server/derivePlayerCombatV2.test.ts src/adventure/v2/combatGolden.test.ts`

Expected: PASS; existing golden combat objects remain unchanged when the passive is absent.

### Task 3: Apply the bonus to only the direct magic share in PvE and PvP

**Files:**
- Modify: `src/adventure/v2/combat/engine.damageHelpers.ts`
- Modify: `src/adventure/v2/combat/engine.damageHelpers.test.ts`
- Modify: `src/adventure/v2/combat/engine.ts`
- Modify: `src/adventure/v2/combat/engine-pvp.ts`
- Modify: `src/adventure/battle/engine.skillCrit.test.ts`
- Modify: `src/adventure/battle/engine-pvp.test.ts`

**Interfaces:**
- Consumes: `PlayerCombat.equipmentMagicSkillCritDmgPct?: number` from Task 2.
- Produces: `computeDirectSkillDamage(args): number`, a shared helper that preserves the existing base floor order and adds the equipment bonus only to `magicDamage` on a critical cast.

- [ ] **Step 1: Write failing pure helper tests**

```ts
expect(computeDirectSkillDamage({
  totalDamage: 1_000,
  magicDamage: 1_000,
  preCriticalMultiplier: 1.2,
  criticalMultiplier: 1.7,
  equipmentMagicCritBonus: 0.3,
  critical: true,
})).toBe(Math.floor(1_000 * 1.2 * 1.7) + Math.floor(1_000 * 1.2 * 0.3));

expect(computeDirectSkillDamage({
  totalDamage: 1_000,
  magicDamage: 400,
  preCriticalMultiplier: 1,
  criticalMultiplier: 1.7,
  equipmentMagicCritBonus: 0.3,
  critical: true,
})).toBe(1_700 + 120);

expect(computeDirectSkillDamage({
  totalDamage: 1_000,
  magicDamage: 0,
  preCriticalMultiplier: 1,
  criticalMultiplier: 1.7,
  equipmentMagicCritBonus: 0.75,
  critical: true,
})).toBe(1_700);
```

Add no-critical and zero-bonus cases that equal the old single `Math.floor(total × preCriticalMultiplier × critMultiplier)` expression exactly.

- [ ] **Step 2: Write failing PvE/PvP integration tests**

Extend the existing deterministic skill-critical tests with `Math.random() = 0`:

```ts
const magicCrit = battle(100, 10_000, {
  equipmentMagicSkillCritDmgPct: 30,
});
expect(magicCrit.firstCastDamage).toBe(
  Math.floor(noCrit.firstCastDamage * 2),
);
```

Add a mixed `마검 일섬` assertion whose expected value is `existing 1.7× on total + 0.3× on magic share`, and a physical strike assertion proving the extra field adds zero. Mirror a pure magic case in `engine-pvp.test.ts` and compare its hand-calculated damage with the PvE helper contract.

- [ ] **Step 3: Run focused tests and verify RED**

Run: `npm test -- src/adventure/v2/combat/engine.damageHelpers.test.ts src/adventure/battle/engine.skillCrit.test.ts src/adventure/battle/engine-pvp.test.ts`

Expected: FAIL because `computeDirectSkillDamage` and engine consumption do not exist.

- [ ] **Step 4: Implement the shared damage helper**

```ts
export function computeDirectSkillDamage(args: {
  totalDamage: number;
  magicDamage: number;
  preCriticalMultiplier: number;
  criticalMultiplier: number;
  equipmentMagicCritBonus: number;
  critical: boolean;
}): number {
  const criticalMultiplier = args.critical ? args.criticalMultiplier : 1;
  const base = Math.floor(
    args.totalDamage * args.preCriticalMultiplier * criticalMultiplier,
  );
  if (!args.critical || !(args.equipmentMagicCritBonus > 0)) return base;
  const magicDamage = Math.min(
    Math.max(0, args.totalDamage),
    Math.max(0, args.magicDamage),
  );
  return base + Math.floor(
    magicDamage * args.preCriticalMultiplier * args.equipmentMagicCritBonus,
  );
}
```

- [ ] **Step 5: Wire PvE and PvP through the helper**

For each engine, build `preCriticalMultiplier` from the same multipliers currently inside the inline expression. Include `damageDown` in the PvP value. Pass:

```ts
totalDamage: skillDamageBase,
magicDamage: result.magicEnemyDamage + magicSkillDamageBonus,
criticalMultiplier:
  SKILL_CRIT_MULT +
  Math.max(0, player.skillCritDmgPct ?? 0) / 100 +
  berserkerBonus +
  overflowBonus,
equipmentMagicCritBonus:
  Math.max(0, player.equipmentMagicSkillCritDmgPct ?? 0) / 100,
critical: skillCritFired,
```

Do not add an RNG roll or modify the critical gate.

- [ ] **Step 6: Run focused tests and verify GREEN**

Run: `npm test -- src/adventure/v2/combat/engine.damageHelpers.test.ts src/adventure/battle/engine.skillCrit.test.ts src/adventure/battle/engine-pvp.test.ts`

Expected: PASS.

### Task 4: Show the conditional magic skill critical multiplier

**Files:**
- Modify: `src/adventure/character/StatsPanel.tsx`
- Modify: `src/adventure/character/StatsPanel.test.ts`

**Interfaces:**
- Consumes: `equipmentMagicSkillCritDmgPct?: number` from Task 2.
- Extends: `activeSkillCritStats(...)` to return `{ chancePct, multiplier, magicMultiplier? }`.

- [ ] **Step 1: Write failing view-model and rendered-output tests**

```ts
expect(activeSkillCritStats({
  critChancePct: 83,
  skillCritDmgPct: 30,
  equipmentMagicSkillCritDmgPct: 40,
})).toEqual({
  chancePct: 75,
  multiplier: 2,
  magicMultiplier: 2.4,
});
```

Render `StatsPanel` with the field present and assert `마법 스킬 치명타 배율` plus `×2.40`. Render without the field and assert that the conditional row is absent.

- [ ] **Step 2: Run the focused test and verify RED**

Run: `npm test -- src/adventure/character/StatsPanel.test.ts`

Expected: FAIL because the field and conditional row are not consumed.

- [ ] **Step 3: Implement the conditional stat row**

Add the optional combat type, calculate the generic multiplier once, and append the equipment conversion only when its field is defined:

```ts
const multiplier =
  SKILL_CRIT_MULT +
  Math.max(0, combat.skillCritDmgPct ?? 0) / 100 +
  overflow;

return {
  chancePct,
  multiplier,
  ...(combat.equipmentMagicSkillCritDmgPct !== undefined
    ? {
        magicMultiplier:
          multiplier +
          Math.max(0, combat.equipmentMagicSkillCritDmgPct) / 100,
      }
    : {}),
};
```

Add a tooltip description explaining that only direct magic skill damage receives the equipment-derived portion. Keep the existing generic skill critical row unchanged.

- [ ] **Step 4: Run the focused test and verify GREEN**

Run: `npm test -- src/adventure/character/StatsPanel.test.ts`

Expected: PASS.

### Task 5: Verify the integrated feature and commit

**Files:**
- Verify all files changed in Tasks 1–4.
- Update: `docs/superpowers/plans/2026-08-16-primordial-mage-equipment-crit-conversion.md` checkboxes only if execution tracking is kept in the plan.

**Interfaces:**
- Consumes all prior task outputs.
- Produces a tested local commit; does not deploy.

- [ ] **Step 1: Run all focused regression tests together**

Run:

```bash
npm test -- \
  src/adventure/data/v2/skillCritical.test.ts \
  src/adventure/data/v2/v2Skills.test.ts \
  src/adventure/data/v2/v2SkillsByJob.test.ts \
  src/adventure/data/v2/buildTags.test.ts \
  src/lib/server/derivePlayerCombatV2.test.ts \
  src/adventure/v2/combat/engine.damageHelpers.test.ts \
  src/adventure/battle/engine.skillCrit.test.ts \
  src/adventure/battle/engine-pvp.test.ts \
  src/adventure/character/StatsPanel.test.ts \
  src/adventure/v2/combatGolden.test.ts
```

Expected: PASS.

- [ ] **Step 2: Run static verification**

Run: `npx tsc --noEmit`

Expected: exit 0.

Run: `npx eslint src/adventure/data/v2/skillCritical.ts src/adventure/data/v2/skillCritical.test.ts src/adventure/data/v2/v2Skills.ts src/adventure/data/v2/v2SkillsCommonCatalog.ts src/adventure/data/v2/v2SkillsByJob.ts src/adventure/data/v2/buildTags.ts src/adventure/data/v2/buildTags.test.ts src/lib/server/derivePlayerCombatV2.ts src/adventure/v2/combat/engineState.ts src/adventure/v2/combat/engine.damageHelpers.ts src/adventure/v2/combat/engine.ts src/adventure/v2/combat/engine-pvp.ts src/adventure/character/StatsPanel.tsx src/adventure/v2/V2CharacterScreen.tsx`

Expected: exit 0.

- [ ] **Step 3: Inspect the final diff and workspace scope**

Run: `git diff --check && git status --short && git diff --stat`

Expected: no whitespace errors; only planned feature files and the plan are changed; `NUL` and `_workspace/` remain untracked and untouched.

- [ ] **Step 4: Commit the implementation**

```bash
git add \
  docs/superpowers/plans/2026-08-16-primordial-mage-equipment-crit-conversion.md \
  src/adventure/data/v2/skillCritical.ts \
  src/adventure/data/v2/skillCritical.test.ts \
  src/adventure/data/v2/v2Skills.ts \
  src/adventure/data/v2/v2SkillsCommonCatalog.ts \
  src/adventure/data/v2/v2SkillsByJob.ts \
  src/adventure/data/v2/v2Skills.test.ts \
  src/adventure/data/v2/v2SkillsByJob.test.ts \
  src/adventure/data/v2/buildTags.ts \
  src/adventure/data/v2/buildTags.test.ts \
  src/lib/server/derivePlayerCombatV2.ts \
  src/lib/server/derivePlayerCombatV2.test.ts \
  src/adventure/v2/combat/engineState.ts \
  src/adventure/v2/V2CharacterScreen.tsx \
  src/adventure/v2/combat/engine.damageHelpers.ts \
  src/adventure/v2/combat/engine.damageHelpers.test.ts \
  src/adventure/v2/combat/engine.ts \
  src/adventure/v2/combat/engine-pvp.ts \
  src/adventure/battle/engine.skillCrit.test.ts \
  src/adventure/battle/engine-pvp.test.ts \
  src/adventure/character/StatsPanel.tsx \
  src/adventure/character/StatsPanel.test.ts
git commit -m "feat: convert equipment crit for primordial magic"
```

- [ ] **Step 5: Confirm the commit without deploying**

Run: `git show --stat --oneline HEAD && git status --short`

Expected: the feature commit contains only planned files; no deployment or maintenance command has run.
