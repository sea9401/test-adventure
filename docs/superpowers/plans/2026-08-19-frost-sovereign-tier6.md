# Frost Sovereign Tier 6 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add the dedicated tier-6 `빙천제` job, its `영겁빙옥` and `영구동토` skills, and a shared PvE/PvP rule that retains one frost chill stack after freeze.

**Architecture:** Extend the catalog-driven job and skill system, carry `freezeRetainStacks` through passive aggregation and player derivation, then have both engines pass it to the pure frost transition.

**Tech Stack:** TypeScript, Vitest, shared PvE/PvP combat engines

## Global Constraints

- Do not deploy.
- Preserve `냉기 마법사 → 원소군주 → 태초술사`.
- Preserve existing frost behavior without `영구동토`.
- Do not gate effects by current job ID.
- Use red-green TDD for behavior changes.
- Add no DB migration, image, persistent state, or hard crowd control.

---

### Task 1: Tier-6 Job and Skill Catalog

**Files:**
- Create: `src/adventure/data/v2/frostSovereignCatalog.test.ts`
- Modify: `src/adventure/data/v2/v2JobCatalog.ts`
- Modify: `src/adventure/data/v2/v2SkillsByJob.ts`
- Modify: `src/adventure/data/v2/v2SkillsCommonCatalog.ts`
- Modify: `src/adventure/data/v2/v2Skills.ts`

**Interfaces:**
- Consumes: `TIER6_UNLOCK_CUMLEVEL`, `jobById`, `V2_SKILLS`, `skillsForJob`, `describeV2Skill`, `spCostOf`.
- Produces: `frostsovereign`, both new skill IDs, and `V2PassiveSkillEffect.freezeRetainStacks?: number`.

- [ ] **Step 1: Write the failing catalog test**

```ts
expect(jobById("frostsovereign")).toMatchObject({
  id: "frostsovereign",
  name: "빙천제",
  tier: 6,
  unlock: { prereqs: { cryomancer: TIER6_UNLOCK_CUMLEVEL } },
  jobBonus: { int: 28, spi: 12 },
});
expect(effectiveCultivateProfile("mage", "frostsovereign")).toEqual({ int: 3, spi: 3 });
expect(LEGACY_CLASS_SPEC_BY_JOB.frostsovereign).toEqual({
  class: "mage",
  spec: "frostsovereign",
});
expect(skillsForJob("frostsovereign")).toEqual([
  "v2c_frostsovereign_eternalprison",
  "v2c_frostsovereign_permafrost",
]);
expect(V2_SKILLS.v2c_frostsovereign_eternalprison).toMatchObject({
  name: "영겁빙옥",
  fixedMpCost: 195,
  procChance: 45,
  learnCost: 12000,
  spCost: 10,
  frostChillGain: 4,
  effects: [{ kind: "damage", statCoef: 2.85, baseFlat: 722, scaling: "magic" }],
});
expect(V2_SKILLS.v2c_frostsovereign_permafrost).toMatchObject({
  name: "영구동토",
  learnCost: 12000,
  spCost: 11,
  passive: {
    maxMpPct: 16,
    freezeDamagePct: 35,
    freezeDelayPct: 50,
    freezeRetainStacks: 1,
  },
});
expect(spCostOf(V2_SKILLS.v2c_frostsovereign_eternalprison)).toBe(10);
expect(spCostOf(V2_SKILLS.v2c_frostsovereign_permafrost)).toBe(11);
expect(describeV2Skill(V2_SKILLS.v2c_frostsovereign_eternalprison))
  .toContain("적중 시 한기 +4");
expect(describeV2Skill(V2_SKILLS.v2c_frostsovereign_permafrost))
  .toContain("빙결 후 한기 1 잔류");
```

This catches missing catalog entries, wrong lineage, wrong normalized damage/cost, and missing effect copy.

- [ ] **Step 2: Verify RED**

Run: `npm test -- src/adventure/data/v2/frostSovereignCatalog.test.ts`

Expected: FAIL because the job and skills do not exist.

- [ ] **Step 3: Add the minimal catalog implementation**

Add the job:

```ts
frostsovereign: {
  id: "frostsovereign",
  name: "빙천제",
  tier: 6,
  cultivateProfile: { int: 3, spi: 3 },
  jobBonus: { int: 28, spi: 12 },
  unlock: { prereqs: { cryomancer: TIER6_UNLOCK_CUMLEVEL } },
},
```

Add the job-to-skills list, the two IDs to `V2SkillId`, `frostsovereign` to `MP_CASTER_JOBS`, and:

```ts
v2c_frostsovereign_eternalprison: {
  id: "v2c_frostsovereign_eternalprison", name: "영겁빙옥",
  stat: "int", category: "attack", tier: 3,
  description: "영겁의 얼음 감옥을 닫아 큰 마법 피해를 주고 적에게 한기를 4중첩 쌓는다.",
  mpCost: 84, fixedMpCost: 195, cooldown: 0, procChance: 32,
  learnCost: 12000, spCost: 10,
  effects: [dmg(3, 760, "magic")],
  frostChillGain: 4,
},
v2c_frostsovereign_permafrost: {
  id: "v2c_frostsovereign_permafrost", name: "영구동토",
  stat: "int", category: "passive", tier: 3,
  description: "빙결 뒤에도 녹지 않는 한기를 남겨 다음 빙결을 앞당기고 그 위력과 지연을 강화한다.",
  mpCost: 0, cooldown: 0, learnCost: 12000, spCost: 11, effects: [],
  passive: {
    maxMpPct: 16,
    freezeDamagePct: 35,
    freezeDelayPct: 50,
    freezeRetainStacks: 1,
  },
},
```

Extend the passive type and chips:

```ts
freezeRetainStacks?: number;
if (p.freezeRetainStacks) chips.push(`빙결 후 한기 ${p.freezeRetainStacks} 잔류`);
```

- [ ] **Step 4: Verify GREEN**

Run: `npm test -- src/adventure/data/v2/frostSovereignCatalog.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/adventure/data/v2/frostSovereignCatalog.test.ts src/adventure/data/v2/v2JobCatalog.ts src/adventure/data/v2/v2SkillsByJob.ts src/adventure/data/v2/v2SkillsCommonCatalog.ts src/adventure/data/v2/v2Skills.ts
git commit -m "feat: add frost sovereign tier 6 catalog"
```

### Task 2: Retained Frost Chill Transition

**Files:**
- Modify: `src/adventure/v2/combat/frostChill.test.ts`
- Modify: `src/adventure/v2/combat/frostChill.ts`

**Interfaces:**
- Consumes: `resolveFrostChillGain(current, gain, mastery)`.
- Produces: `mastery.retainStacks?: number`; triggered transitions return normalized retention in `next`.

- [ ] **Step 1: Write failing tests**

```ts
it("영구동토는 빙결 뒤 한기 1을 남기고 초과 생성량은 버린다", () => {
  expect(resolveFrostChillGain(4, 99, { retainStacks: 1 })).toMatchObject({
    previous: 4,
    requestedGain: 99,
    next: 1,
    triggered: true,
    consumed: 5,
  });
});
it("손상된 잔류 한기를 0~4 정수로 정규화한다", () => {
  expect(resolveFrostChillGain(4, 1, { retainStacks: -1 }).next).toBe(0);
  expect(resolveFrostChillGain(4, 1, { retainStacks: 2.9 }).next).toBe(2);
  expect(resolveFrostChillGain(4, 1, { retainStacks: Number.NaN }).next).toBe(0);
  expect(resolveFrostChillGain(4, 1, { retainStacks: 99 }).next).toBe(4);
});
```

This catches unconditional reset, overflow carry, and unsafe retention.

- [ ] **Step 2: Verify RED**

Run: `npm test -- src/adventure/v2/combat/frostChill.test.ts`

Expected: FAIL because freeze always returns zero.

- [ ] **Step 3: Implement minimal transition**

```ts
mastery: { damagePct?: number; delayPct?: number; retainStacks?: number } = {},
// triggered return only:
next: normalizeFrostChill(mastery.retainStacks),
```

Do not use retention below the threshold and do not carry generated overflow.

- [ ] **Step 4: Verify GREEN**

Run: `npm test -- src/adventure/v2/combat/frostChill.test.ts`

Expected: PASS, including old reset cases.

- [ ] **Step 5: Commit**

```bash
git add src/adventure/v2/combat/frostChill.test.ts src/adventure/v2/combat/frostChill.ts
git commit -m "feat: retain frost chill after freeze"
```

### Task 3: Passive Aggregation and Player Derivation

**Files:**
- Modify: `src/adventure/data/v2/frostSovereignCatalog.test.ts`
- Modify: `src/adventure/data/v2/v2Skills.ts`
- Modify: `src/lib/server/derivePlayerCombatV2.test.ts`
- Modify: `src/lib/server/derivePlayerCombatV2.ts`
- Modify: `src/adventure/v2/combat/engineState.ts`

**Interfaces:**
- Produces: aggregate `freezeRetainStacks`, pure input `passiveFreezeRetainStacks`, and player field `freezeRetainStacks`.

- [ ] **Step 1: Write failing aggregate and derive tests**

```ts
expect(aggregateEquippedPassives([
  "v2c_cryomancer_freezingpoint",
  "v2c_frostsovereign_permafrost",
])).toMatchObject({
  maxMpPct: 28,
  freezeDamagePct: 85,
  freezeDelayPct: 50,
  freezeRetainStacks: 1,
});
expect(aggregateEquippedPassives([]).freezeRetainStacks).toBe(0);
```

Extend the pure and save-backed derive cases:

```ts
const mastered = derivePlayerCombatV2Pure({
  level: 50,
  v2Equipped: {},
  passiveFreezeDamagePct: 85,
  passiveFreezeDelayPct: 50,
  passiveFreezeRetainStacks: 1,
}).player;
expect(mastered).toMatchObject({
  freezeDamagePct: 85,
  freezeDelayPct: 50,
  freezeRetainStacks: 1,
});
expect(plain.freezeRetainStacks).toBeUndefined();
```

Equip both frost passives in the save-backed case and expect the same three values. This catches sum-vs-max errors and omitted forwarding.

- [ ] **Step 2: Verify RED**

Run: `npm test -- src/adventure/data/v2/frostSovereignCatalog.test.ts src/lib/server/derivePlayerCombatV2.test.ts`

Expected: FAIL because retention is not aggregated or derived.

- [ ] **Step 3: Implement aggregation and derivation**

```ts
let freezeRetainStacks = 0;
freezeRetainStacks = Math.max(freezeRetainStacks, p.freezeRetainStacks ?? 0);
```

Return it from the aggregate. Add `passiveFreezeRetainStacks?: number` to pure input and `freezeRetainStacks?: number` to `PlayerCombat`. Forward positive values:

```ts
...((input.passiveFreezeRetainStacks ?? 0) > 0
  ? { freezeRetainStacks: input.passiveFreezeRetainStacks }
  : {}),
```

Pass `passiveAgg.freezeRetainStacks` from the save-backed wrapper.

- [ ] **Step 4: Verify GREEN**

Run: `npm test -- src/adventure/data/v2/frostSovereignCatalog.test.ts src/lib/server/derivePlayerCombatV2.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/adventure/data/v2/frostSovereignCatalog.test.ts src/adventure/data/v2/v2Skills.ts src/lib/server/derivePlayerCombatV2.test.ts src/lib/server/derivePlayerCombatV2.ts src/adventure/v2/combat/engineState.ts
git commit -m "feat: derive permafrost chill retention"
```

### Task 4: PvE and PvP Combat Wiring

**Files:**
- Modify: `src/adventure/v2/combat/frostChillPve.test.ts`
- Modify: `src/adventure/v2/combat/frostChillPvp.test.ts`
- Modify: `src/adventure/v2/combat/engine.ts`
- Modify: `src/adventure/v2/combat/engine-pvp.ts`

**Interfaces:**
- Consumes: `PlayerCombat.freezeRetainStacks`.
- Produces: identical retention and resource snapshots in PvE/PvP.

- [ ] **Step 1: Write failing integration tests**

In PvE, start at two stacks and cast `절대영도` with combined mastery:

```ts
expect(result.state.stacks.enemyFrostChillStacks).toBe(1);
expect(result.enemyDelayPct).toBe(50);
expect(result.state.log.some((entry) =>
  entry.resources?.frostChill === "한기 1/5"
)).toBe(true);
```

Add the PvP equivalent:

```ts
expect(result.state.p2.stacks.frostChillStacks).toBe(1);
expect(result.enemyDelayPct).toBe(50);
expect(result.state.log.some((entry) =>
  entry.targetResources?.frostChill === "한기 1/5"
)).toBe(true);
```

Use real casts and a deterministic successful hit. These catch either engine omitting the shared field.

- [ ] **Step 2: Verify RED**

Run: `npm test -- src/adventure/v2/combat/frostChillPve.test.ts src/adventure/v2/combat/frostChillPvp.test.ts`

Expected: FAIL because both engines reset to zero.

- [ ] **Step 3: Wire both engines**

Pass `retainStacks: player.freezeRetainStacks` in PvE and `retainStacks: side.player.freezeRetainStacks` in PvP. Do not change hit, evasion, purification, or status-block gates.

- [ ] **Step 4: Verify GREEN**

Run: `npm test -- src/adventure/v2/combat/frostChillPve.test.ts src/adventure/v2/combat/frostChillPvp.test.ts`

Expected: PASS, including old reset-to-zero cases.

- [ ] **Step 5: Commit**

```bash
git add src/adventure/v2/combat/frostChillPve.test.ts src/adventure/v2/combat/frostChillPvp.test.ts src/adventure/v2/combat/engine.ts src/adventure/v2/combat/engine-pvp.ts
git commit -m "feat: apply permafrost in pve and pvp"
```

### Task 5: Full Regression Verification

**Files:**
- Verify: all changed files

- [ ] **Step 1: Run focused regressions**

```bash
npm test -- src/adventure/data/v2/cryomancerCatalog.test.ts src/adventure/data/v2/frostSovereignCatalog.test.ts src/adventure/data/v2/v2JobCatalog.test.ts src/adventure/data/v2/v2Skills.test.ts src/adventure/data/v2/v2SkillsByJob.test.ts src/adventure/v2/combat/frostChill.test.ts src/adventure/v2/combat/frostChillCast.test.ts src/adventure/v2/combat/frostChillPve.test.ts src/adventure/v2/combat/frostChillPvp.test.ts src/adventure/v2/combat/atbSkillCastPvp.test.ts src/lib/server/derivePlayerCombatV2.test.ts
```

Expected: zero failures.

- [ ] **Step 2: Run type checking**

Run: `npx tsc --noEmit`

Expected: exit 0.

- [ ] **Step 3: Run the full suite**

Run: `npm test`

Expected: exit 0 and zero failures.

- [ ] **Step 4: Inspect the branch**

```bash
git diff --check HEAD~4..HEAD
git status --short
git log -5 --oneline
```

Expected: no whitespace errors, no uncommitted implementation files, and the design plus four implementation commits at the tip.
