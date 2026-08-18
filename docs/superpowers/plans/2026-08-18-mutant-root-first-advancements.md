# Mutant Root and First Advancements Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add the always-unlocked 변이자 root, its three mastery-1000 Tier 1 jobs, and collectible cross-job bleed, weight, and split skill kits in PvE/PvP.

**Architecture:** Extend the existing job/skill catalogs and legacy class bridge, then model `weight` and `split` as battle-only stack fields shared by PvE and PvP. Keep mutation calculations in a small pure module; the common skill resolver produces resource transitions and both battle engines apply the same transition contract. Existing job-independent learned/equipped loadouts remain the only skill-use gate.

**Tech Stack:** TypeScript 5, React 19, Next.js 16.2 App Router, Vitest 4, Tailwind CSS 4.

## Global Constraints

- Preserve all pre-existing worktree changes, especially the in-progress `grandwarder` and `lawguardian` catalog/test hunks.
- Do not require `currentJobId` to use any mutation skill or resource.
- `mutant` is always unlocked; `beastkin`, `golem`, and `slime` unlock together at mutant proficiency `1_000`.
- `weight` and `split` are integer battle-only resources clamped to `0..3`; never persist them in character saves.
- Weight gives direct physical skill damage `+5%` and effective SPD `-5%` per stack. Stoneskin adds DEF `+6%` per stack.
- Split barrage adds one non-recursive `25%` auxiliary hit per split. Fusion crash adds `25%` final damage per split.
- All new UI surfaces reuse existing opaque components/tokens; do not add translucent content panels.
- No item unlock tracker, second advancements, art, story, deployment, or maintenance-mode change.
- Read and follow `node_modules/next/dist/docs/01-app/01-getting-started/05-server-and-client-components.md`, `11-css.md`, and `03-architecture/accessibility.md` before TSX changes.

---

### Task 1: Job root, class bridge, proficiency, and lineage UI

**Files:**
- Modify: `src/adventure/data/v2/classes.ts`
- Modify: `src/adventure/data/v2/classes.test.ts`
- Modify: `src/adventure/data/v2/proficiency.ts`
- Modify: `src/adventure/data/v2/proficiency.test.ts`
- Modify: `src/adventure/data/v2/v2JobCatalog.ts`
- Modify: `src/adventure/data/v2/v2JobCatalog.test.ts`
- Modify: `src/adventure/v2/jobExplorer.ts`
- Modify: `src/adventure/v2/jobExplorer.test.ts`
- Modify: `src/adventure/v2/jobRoadmapModel.ts`
- Modify: `src/adventure/v2/jobRoadmapModel.test.ts`

**Interfaces:**
- Produces: `V2Class` member `mutant`, `MUTANT_TIER1_UNLOCK_CUMLEVEL = 1_000`, job IDs `mutant | beastkin | golem | slime`, and legacy pairs using class `mutant`.
- Consumes: existing `isJobUnlocked`, `cumLevelForJob`, `jobIdFromLegacy`, `effectiveCultivateProfile`, and roadmap root discovery.

- [ ] **Step 1: Write failing class and catalog tests**

```ts
expect(parseV2Class("mutant")).toBe("mutant");
expect(V2_CLASS_DEFS.mutant.name).toBe("변이자");
expect(V2_JOB_CATALOG.mutant).toMatchObject({ tier: 0, unlock: { prereqs: {} } });
for (const id of ["beastkin", "golem", "slime"] as const) {
  expect(isJobUnlocked(V2_JOB_CATALOG[id], profAt(999))).toBe(false);
  expect(isJobUnlocked(V2_JOB_CATALOG[id], profAt(1_000))).toBe(true);
  expect(LEGACY_CLASS_SPEC_BY_JOB[id].class).toBe("mutant");
}
```

- [ ] **Step 2: Run focused tests and confirm the missing-root failures**

Run: `npm test -- src/adventure/data/v2/classes.test.ts src/adventure/data/v2/v2JobCatalog.test.ts src/adventure/data/v2/proficiency.test.ts`

Expected: FAIL because `mutant`, the three jobs, and the proficiency profile do not exist.

- [ ] **Step 3: Add the class, job definitions, bridge, and normalized proficiency profile**

```ts
export const MUTANT_TIER1_UNLOCK_CUMLEVEL = 1_000;

mutant: {
  id: "mutant",
  name: "변이자",
  tier: 0,
  cultivateProfile: { vit: 2, str: 1, int: 1 },
  jobBonus: {},
  unlock: { prereqs: {} },
},
beastkin: {
  id: "beastkin",
  name: "수인",
  tier: 1,
  cultivateProfile: { str: 2, dex: 1, vit: 1 },
  jobBonus: { str: 5 },
  unlock: { prereqs: { mutant: MUTANT_TIER1_UNLOCK_CUMLEVEL } },
},
```

Add equivalent `golem` and `slime` definitions from the approved spec, include `mutant` in `V2_CLASSES`, `V2_CLASS_DEFS`, and `V2_CULTIVATE_PROFILE`, and change `isRootJobSelectable`/roadmap start handling so `mutant` is a selectable root.

- [ ] **Step 4: Add failing lineage ordering tests**

```ts
const roadmap = buildJobRoadmap();
const mutant = roadmap.children.find((node) => node.id === "mutant");
expect(mutant?.children.map((node) => node.id)).toEqual([
  "beastkin",
  "golem",
  "slime",
]);
expect(compareJobExplorerLineOrder(job("mutant"), job("beastkin"))).toBeLessThan(0);
```

- [ ] **Step 5: Add `mutant` to explorer root order and roadmap root detection**

Place `mutant` after `survivor` in the explicit root order and treat `none | survivor | mutant` as roadmap children of `start`.

- [ ] **Step 6: Run job/lineage tests**

Run: `npm test -- src/adventure/data/v2/classes.test.ts src/adventure/data/v2/v2JobCatalog.test.ts src/adventure/data/v2/proficiency.test.ts src/adventure/v2/jobExplorer.test.ts src/adventure/v2/jobRoadmapModel.test.ts`

Expected: PASS.

- [ ] **Step 7: Commit only mutation job/root hunks**

```bash
git add -p src/adventure/data/v2/classes.ts src/adventure/data/v2/classes.test.ts src/adventure/data/v2/proficiency.ts src/adventure/data/v2/proficiency.test.ts src/adventure/data/v2/v2JobCatalog.ts src/adventure/data/v2/v2JobCatalog.test.ts src/adventure/v2/jobExplorer.ts src/adventure/v2/jobExplorer.test.ts src/adventure/v2/jobRoadmapModel.ts src/adventure/v2/jobRoadmapModel.test.ts
git commit -m "feat: add mutant job root and first branches"
```

### Task 2: Collectible mutation skill catalog and passive derivation

**Files:**
- Modify: `src/adventure/data/v2/v2Skills.ts`
- Modify: `src/adventure/data/v2/v2SkillsCommonCatalog.ts`
- Modify: `src/adventure/data/v2/v2SkillsByJob.ts`
- Modify: `src/adventure/data/v2/v2SkillsByJob.test.ts`
- Modify: `src/adventure/data/v2/v2Skills.test.ts`
- Modify: `src/lib/server/derivePlayerCombatV2.ts`
- Modify: `src/lib/server/derivePlayerCombatV2.test.ts`

**Interfaces:**
- Produces passive fields `statusDamageReductionPct`, `bleedPhysicalSkillDamagePctPerStack`, and `stoneskinDefPctPerWeight`; skill flags `mutationWeightGain`, `mutationWeightConsumePctPerStack`, `splitGain`, `splitAuxHitPctPerStack`, and `splitConsumePctPerStack`.
- Produces all 11 skill IDs and `V2_SKILLS_BY_JOB` entries.
- Consumes Task 1 job IDs only for catalog mapping; skill operation remains independent of current job.

- [ ] **Step 1: Write failing kit and aggregation tests**

```ts
expect(skillsForJob("mutant")).toEqual([
  "v2c_mutant_morphstrike",
  "v2c_mutant_adaptation",
]);
expect(skillsForJob("beastkin")).toHaveLength(3);
expect(skillsForJob("golem")).toHaveLength(3);
expect(skillsForJob("slime")).toHaveLength(3);
expect(aggregateEquippedPassives(["v2c_mutant_adaptation"])).toMatchObject({
  statusDamageReductionPct: 8,
});
expect(aggregateEquippedPassives(["v2c_beastkin_bloodscent"])).toMatchObject({
  bleedPhysicalSkillDamagePctPerStack: 2,
});
expect(aggregateEquippedPassives(["v2c_golem_stoneskin"])).toMatchObject({
  stoneskinDefPctPerWeight: 6,
});
```

- [ ] **Step 2: Run skill catalog tests and confirm missing-ID failures**

Run: `npm test -- src/adventure/data/v2/v2SkillsByJob.test.ts src/adventure/data/v2/v2Skills.test.ts`

Expected: FAIL with unknown mutation skill IDs and missing passive properties.

- [ ] **Step 3: Add passive/active type fields and aggregate them**

```ts
export type V2PassiveSkillEffect = {
  statusDamageReductionPct?: number;
  bleedPhysicalSkillDamagePctPerStack?: number;
  stoneskinDefPctPerWeight?: number;
  // existing properties continue below
};

export type V2SkillDefinition = {
  mutationWeightGain?: number;
  mutationWeightConsumePctPerStack?: number;
  splitGain?: number;
  splitAuxHitPctPerStack?: number;
  splitConsumePctPerStack?: number;
  // existing properties continue below
};
```

Aggregate numeric passives additively, clamp status-damage reduction through the existing final 0..100 path, and expose the two mutation combat passives on `PlayerCombat` through `derivePlayerCombatV2Pure`.

- [ ] **Step 4: Add the 11 catalog definitions and job mappings**

Use Tier 1 baseline coefficients and costs, with these fixed behaviors:

```ts
v2c_beastkin_rend.effects = [physicalDamage, bleed(2)];
v2c_beastkin_clawflurry.effects = [threePhysicalHits, bleed(3)];
v2c_golem_rocksmash.mutationWeightGain = 1;
v2c_golem_tectoniccollapse.mutationWeightConsumePctPerStack = 20;
v2c_slime_split.splitGain = 1;
v2c_slime_barrage.splitAuxHitPctPerStack = 25;
v2c_slime_fusioncrash.splitConsumePctPerStack = 25;
```

Set collapse default pattern to `weight atLeast 3`, split to `split atMost 1`, and fusion crash to `split atLeast 3`.

- [ ] **Step 5: Prove cross-job derivation does not inspect current job**

Add a pure derive test using `playerClass: "mage"` with equipped mutation passives and assert the passive values appear on `PlayerCombat` unchanged.

- [ ] **Step 6: Run skill and derive tests**

Run: `npm test -- src/adventure/data/v2/v2SkillsByJob.test.ts src/adventure/data/v2/v2Skills.test.ts src/lib/server/derivePlayerCombatV2.test.ts`

Expected: PASS.

- [ ] **Step 7: Commit only mutation skill/derive hunks**

```bash
git add -p src/adventure/data/v2/v2Skills.ts src/adventure/data/v2/v2SkillsCommonCatalog.ts src/adventure/data/v2/v2SkillsByJob.ts src/adventure/data/v2/v2SkillsByJob.test.ts src/adventure/data/v2/v2Skills.test.ts src/lib/server/derivePlayerCombatV2.ts src/lib/server/derivePlayerCombatV2.test.ts
git commit -m "feat: add collectible mutation skill kits"
```

### Task 3: Pure mutation resource rules and common skill resolution

**Files:**
- Create: `src/adventure/v2/combat/mutationCombat.ts`
- Create: `src/adventure/v2/combat/mutationCombat.test.ts`
- Modify: `src/adventure/v2/combat/combatShared.ts`
- Modify: `src/adventure/v2/combat/combatPatternCast.test.ts`

**Interfaces:**
- Produces:

```ts
export const MUTATION_RESOURCE_MAX = 3;
export function clampMutationResource(value: number): number;
export function weightPhysicalSkillMultiplier(weight: number): number;
export function weightSpeedMultiplier(weight: number): number;
export function stoneskinDefMultiplier(weight: number, pctPerStack: number): number;
export type MutationCastTransition = {
  weightAfter: number;
  splitAfter: number;
  weightGained: number;
  weightConsumed: number;
  splitGained: number;
  splitConsumed: number;
};
```

- Common resolver input consumes `attacker.mutationWeight` and `attacker.splitBodies`.
- Common resolver result produces `mutationTransition` and auxiliary hit damage already included in `enemyDamage`/`hitDamages`.

- [ ] **Step 1: Write failing pure resource tests**

```ts
expect(clampMutationResource(-1)).toBe(0);
expect(clampMutationResource(9)).toBe(3);
expect(weightPhysicalSkillMultiplier(3)).toBe(1.15);
expect(weightSpeedMultiplier(3)).toBe(0.85);
expect(stoneskinDefMultiplier(3, 6)).toBe(1.18);
```

- [ ] **Step 2: Run the new test and confirm module-not-found failure**

Run: `npm test -- src/adventure/v2/combat/mutationCombat.test.ts`

Expected: FAIL because `mutationCombat.ts` does not exist.

- [ ] **Step 3: Implement clamped pure helpers and transition calculation**

Implement all exported functions without importing either battle engine. Transition order is snapshot current resources, compute bonuses, consume finisher resources, then apply non-finisher generation; rock smash therefore gains weight after its own damage.

- [ ] **Step 4: Add failing common resolver tests**

Cover:

```ts
expect(cast("rocksmash", { weight: 2 }).mutationTransition.weightAfter).toBe(3);
expect(cast("collapse", { weight: 3 }).mutationTransition.weightConsumed).toBe(3);
expect(cast("fusion", { split: 3 }).mutationTransition.splitConsumed).toBe(3);
expect(cast("barrage", { split: 3 }).hitDamages).toHaveLength(4);
expect(cast("barrage", { split: 0 }).hitDamages).toHaveLength(1);
```

Also verify blood scent reads target bleed from any source and boosts only physical direct skill damage, not magic or DoT.

- [ ] **Step 5: Extend `resolveV2SkillCast` with the shared mutation contract**

The resolver must:

1. Snapshot clamped weight/split.
2. Apply weight and blood-scent multipliers only to direct physical skill damage.
3. Append non-recursive barrage auxiliary hit damages.
4. Apply collapse/fusion payoff multipliers.
5. Return the transition even when target damage is evaded later; engines apply it when the cast itself succeeds.

- [ ] **Step 6: Run pure and common cast tests**

Run: `npm test -- src/adventure/v2/combat/mutationCombat.test.ts src/adventure/v2/combat/combatPatternCast.test.ts`

Expected: PASS.

- [ ] **Step 7: Commit mutation resource core**

```bash
git add src/adventure/v2/combat/mutationCombat.ts src/adventure/v2/combat/mutationCombat.test.ts src/adventure/v2/combat/combatShared.ts src/adventure/v2/combat/combatPatternCast.test.ts
git commit -m "feat: resolve mutation battle resources"
```

### Task 4: PvE/PvP engine state, effective stats, and logs

**Files:**
- Modify: `src/adventure/v2/combat/engineState.ts`
- Modify: `src/adventure/v2/combat/engine.ts`
- Modify: `src/adventure/v2/combat/engine-pvp.ts`
- Modify: `src/adventure/v2/combat/engine.atb.ts`
- Modify: `src/adventure/v2/combat/engine.pvp-atb.ts`
- Create: `src/adventure/v2/combat/mutationCombatEngine.test.ts`
- Create: `src/adventure/v2/combat/mutationCombatPvp.test.ts`

**Interfaces:**
- Extends `BattleStacks` with `mutationWeight: number` and `splitBodies: number` initialized to zero in PvE/PvP.
- Consumes Task 3 `MutationCastTransition` and effective-stat helpers.
- Produces `[중량]`, `[지각 붕괴]`, `[분열]`, and `[융합 충돌]` log entries.

- [ ] **Step 1: Write failing PvE/PvP transition tests**

Assert both engines:

```ts
expect(afterRock.stacks.mutationWeight).toBe(1);
expect(afterCollapse.stacks.mutationWeight).toBe(0);
expect(afterSplit.stacks.splitBodies).toBe(1);
expect(afterFusion.stacks.splitBodies).toBe(0);
```

Use a non-mutation current class/player fixture to prove only equipped skills matter.

- [ ] **Step 2: Run engine tests and confirm missing-stack failures**

Run: `npm test -- src/adventure/v2/combat/mutationCombatEngine.test.ts src/adventure/v2/combat/mutationCombatPvp.test.ts`

Expected: FAIL because battle stacks and engine transitions are absent.

- [ ] **Step 3: Initialize and apply resource transitions in both engines**

Update stack construction and successful cast application. Log exact values:

```text
[중량] +1 (2/3)
[지각 붕괴] 중량 3 소모
[분열] 분열체 +1 (2/3)
[융합 충돌] 분열체 3 융합
```

- [ ] **Step 4: Apply dynamic DEF and SPD without mutating base combat data**

Use `stoneskinDefMultiplier` at defense and DEF-scaled skill boundaries. Use `weightSpeedMultiplier` in PvE/PvP ATB interval calculations and PvP speed comparisons. Resource consumption restores the original effective speed on the next calculation.

- [ ] **Step 5: Run engine tests and adjacent combat regressions**

Run: `npm test -- src/adventure/v2/combat/mutationCombatEngine.test.ts src/adventure/v2/combat/mutationCombatPvp.test.ts src/adventure/v2/combat/engine.magicAttack.test.ts src/adventure/v2/combat/combatAtb.test.ts src/adventure/v2/combat/combatPvpAtb.test.ts src/adventure/v2/combat/fortressKnight.test.ts`

Expected: PASS, including unchanged fortress impact behavior.

- [ ] **Step 6: Commit engine integration**

```bash
git add src/adventure/v2/combat/engineState.ts src/adventure/v2/combat/engine.ts src/adventure/v2/combat/engine-pvp.ts src/adventure/v2/combat/engine.atb.ts src/adventure/v2/combat/engine.pvp-atb.ts src/adventure/v2/combat/mutationCombatEngine.test.ts src/adventure/v2/combat/mutationCombatPvp.test.ts
git commit -m "feat: run mutation resources in pve and pvp"
```

### Task 5: Pattern editor, battle readout, and final verification

**Files:**
- Modify: `src/adventure/v2/combat/combatPattern.ts`
- Modify: `src/adventure/v2/combat/combatPattern.test.ts`
- Modify: `src/adventure/v2/V2CombatPatternView.tsx`
- Modify: `src/adventure/v2/V2CombatPatternView.test.tsx`
- Modify: `src/adventure/battle/BattleScene.tsx`
- Modify: `src/adventure/battle/BattleScene.test.tsx`
- Modify: `src/adventure/data/v2/v2Skills.ts`
- Modify: `src/adventure/data/v2/v2Skills.test.ts`

**Interfaces:**
- Extends `V2PatternSelfResource` with `weight | split`.
- Pattern contexts source both values from battle stack/cast input.
- Battle scene reads `state.stacks.mutationWeight` and `state.stacks.splitBodies`; visibility is based on equipped resource-producing/consuming mutation skills.

- [ ] **Step 1: Write failing parser, UI, and readout tests**

```ts
expect(parseCombatPattern(patternFor("weight", 3))).toEqual(expectedWeightPattern);
expect(parseCombatPattern(patternFor("split", 3))).toEqual(expectedSplitPattern);
expect(renderPatternEditor()).toContain("중량");
expect(renderPatternEditor()).toContain("분열체");
expect(renderBattle({ weight: 2, split: 3 })).toContain("중량 2/3");
expect(renderBattle({ weight: 2, split: 3 })).toContain("분열체 3/3");
```

- [ ] **Step 2: Run UI/pattern tests and confirm missing-option failures**

Run: `npm test -- src/adventure/v2/combat/combatPattern.test.ts src/adventure/v2/V2CombatPatternView.test.tsx src/adventure/battle/BattleScene.test.tsx`

Expected: FAIL because the resource union, options, parser whitelist, and readout are missing.

- [ ] **Step 3: Extend parser/context/editor with the two resources**

Add `weight` and `split` to the union and parser whitelist, provide Korean labels, and keep the numeric editor range `0..3`. Unknown stored keys continue to be dropped by `parseCombatPattern`.

- [ ] **Step 4: Add a compact opaque resource readout**

Render the two counters in the existing player status area only when a related equipped skill exists. Use the existing card/inset surface and accessible text labels; do not create a new client boundary.

- [ ] **Step 5: Add skill detail chips**

Extend the existing skill chip formatter to show weight/split gain, cap, per-stack effect, and consume behavior for the five resource skills.

- [ ] **Step 6: Run focused and full static verification**

Run:

```bash
npm test -- src/adventure/data/v2/classes.test.ts src/adventure/data/v2/v2JobCatalog.test.ts src/adventure/data/v2/proficiency.test.ts src/adventure/data/v2/v2SkillsByJob.test.ts src/adventure/data/v2/v2Skills.test.ts src/adventure/v2/jobExplorer.test.ts src/adventure/v2/jobRoadmapModel.test.ts src/adventure/v2/combat/mutationCombat.test.ts src/adventure/v2/combat/combatPatternCast.test.ts src/adventure/v2/combat/mutationCombatEngine.test.ts src/adventure/v2/combat/mutationCombatPvp.test.ts src/adventure/v2/combat/combatPattern.test.ts src/adventure/v2/V2CombatPatternView.test.tsx src/adventure/battle/BattleScene.test.tsx
npx tsc --noEmit
npx eslint src/adventure/data/v2/classes.ts src/adventure/data/v2/proficiency.ts src/adventure/data/v2/v2JobCatalog.ts src/adventure/data/v2/v2Skills.ts src/adventure/data/v2/v2SkillsCommonCatalog.ts src/adventure/data/v2/v2SkillsByJob.ts src/adventure/v2/jobExplorer.ts src/adventure/v2/jobRoadmapModel.ts src/adventure/v2/combat/mutationCombat.ts src/adventure/v2/combat/combatShared.ts src/adventure/v2/combat/engineState.ts src/adventure/v2/combat/engine.ts src/adventure/v2/combat/engine-pvp.ts src/adventure/v2/combat/engine.atb.ts src/adventure/v2/combat/engine.pvp-atb.ts src/adventure/v2/combat/combatPattern.ts src/adventure/v2/V2CombatPatternView.tsx src/adventure/battle/BattleScene.tsx src/lib/server/derivePlayerCombatV2.ts
```

Expected: all commands exit 0.

- [ ] **Step 7: Inspect the final diff and commit only mutation work**

```bash
git diff --check
git status --short
git add -p src/adventure/v2/combat/combatPattern.ts src/adventure/v2/combat/combatPattern.test.ts src/adventure/v2/V2CombatPatternView.tsx src/adventure/v2/V2CombatPatternView.test.tsx src/adventure/battle/BattleScene.tsx src/adventure/battle/BattleScene.test.tsx src/adventure/data/v2/v2Skills.ts src/adventure/data/v2/v2Skills.test.ts
git commit -m "feat: expose mutation resources in combat ui"
```

### Task 6: Plan/spec traceability and clean handoff

**Files:**
- Modify: `docs/superpowers/plans/2026-08-18-mutant-root-first-advancements.md`

**Interfaces:**
- Consumes all prior task test evidence.
- Produces a checked-off execution record without changing the approved design.

- [ ] **Step 1: Check every completed plan checkbox and record command deviations inline**

Use `[x]` for completed steps. If an exact test filename differs because the existing repository groups tests elsewhere, replace the command with the actual passing command rather than adding a placeholder.

- [ ] **Step 2: Verify no unrelated work was staged**

Run: `git diff --cached --name-only`

Expected: empty after task commits. Uncommitted `grandwarder`/`lawguardian` changes may remain and must not be reverted.

- [ ] **Step 3: Commit the completed implementation plan record**

```bash
git add docs/superpowers/plans/2026-08-18-mutant-root-first-advancements.md
git commit -m "docs: record mutant root implementation plan"
```
