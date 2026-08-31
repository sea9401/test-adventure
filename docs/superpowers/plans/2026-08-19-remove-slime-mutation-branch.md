# Remove Slime Mutation Branch Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove the undeployed slime mutation job, its three skills, and the split-body combat resource while preserving beastkin, golem, and non-job slime monster/material data.

**Architecture:** Delete the catalog leaf first, then remove the now-unused split-specific fields from the shared mutation transition contract and both battle engines. Finish by removing split from pattern/UI surfaces and proving only weight remains as the mutation battle resource.

**Tech Stack:** TypeScript 5, React 19, Next.js 16.2 App Router, Vitest 4, Tailwind CSS 4.

## Global Constraints

- `mutant` remains always unlocked; `beastkin` and `golem` unlock at mutant proficiency `1_000`.
- Preserve all monster tags, images, recipes, `slime_chunk`, and `slime_core` data.
- Preserve cross-job use of learned beastkin and golem skills.
- Do not add a replacement third branch.
- Do not deploy or change maintenance mode.
- Work in the current branch and do not spawn subagents.

---

### Task 1: Remove the slime job and skill catalog leaf

**Files:**
- Modify: `src/adventure/data/v2/v2JobCatalog.ts`
- Modify: `src/adventure/data/v2/v2JobCatalog.test.ts`
- Modify: `src/adventure/data/v2/proficiency.ts`
- Modify: `src/adventure/data/v2/proficiency.test.ts`
- Modify: `src/adventure/data/v2/v2SkillsCommonCatalog.ts`
- Modify: `src/adventure/data/v2/v2SkillsByJob.ts`
- Modify: `src/adventure/data/v2/v2SkillsByJob.test.ts`
- Modify: `src/adventure/v2/jobExplorer.test.ts`
- Modify: `src/adventure/v2/jobRoadmapModel.test.ts`

**Interfaces:**
- Produces: a mutation lineage containing exactly `mutant -> beastkin | golem`.
- Removes: job ID `slime` and skill IDs `v2c_slime_split | v2c_slime_barrage | v2c_slime_fusioncrash`.

- [x] **Step 1: Change catalog tests to require the slime leaf to be absent**

```ts
expect("slime" in V2_JOB_CATALOG).toBe(false);
expect(buildJobRoadmap().children.find((node) => node.id === "mutant")?.children.map((node) => node.id))
  .toEqual(["beastkin", "golem"]);
expect("v2c_slime_split" in V2_SKILLS).toBe(false);
```

- [x] **Step 2: Run the focused tests and verify the new absence assertions fail**

Run: `npm test -- src/adventure/data/v2/v2JobCatalog.test.ts src/adventure/data/v2/v2SkillsByJob.test.ts src/adventure/v2/jobExplorer.test.ts src/adventure/v2/jobRoadmapModel.test.ts`

Expected: FAIL because the slime job and skills still exist.

- [x] **Step 3: Delete the slime catalog, legacy mapping, profile, skill union entries, definitions, and job mapping**

Remove only job-level `slime` identifiers. Do not remove monster/material strings containing `slime`.

- [x] **Step 4: Update exact job counts and mutation lineage ordering expectations**

The combined catalog count decreases by one, Tier 1 decreases by one, and root/job SP baselines are recalculated from the actual catalog result.

- [x] **Step 5: Run the focused catalog tests**

Run: `npm test -- src/adventure/data/v2/v2JobCatalog.test.ts src/adventure/data/v2/proficiency.test.ts src/adventure/data/v2/v2SkillsByJob.test.ts src/adventure/v2/jobExplorer.test.ts src/adventure/v2/jobRoadmapModel.test.ts`

Expected: PASS.

### Task 2: Remove split-body state and combat behavior

**Files:**
- Modify: `src/adventure/data/v2/v2Skills.ts`
- Modify: `src/adventure/v2/combat/mutationCombat.ts`
- Modify: `src/adventure/v2/combat/mutationCombat.test.ts`
- Modify: `src/adventure/v2/combat/combatShared.ts`
- Modify: `src/adventure/v2/combat/combatPatternCast.test.ts`
- Modify: `src/adventure/v2/combat/engineState.ts`
- Modify: `src/adventure/v2/combat/engine.ts`
- Modify: `src/adventure/v2/combat/engine-pvp.ts`
- Modify: `src/adventure/v2/combat/mutationCombatEngine.test.ts`

**Interfaces:**
- Keeps: `MutationCastTransition` weight fields and golem transition helpers.
- Removes: every `split*` field and `splitBodies` from skill definitions, cast inputs, transitions, and PvE/PvP stacks.

- [x] **Step 1: Add an absence regression test for split skill metadata**

```ts
expect(Object.values(V2_SKILLS).some((skill) =>
  "splitGain" in skill || "splitAuxHitPctPerStack" in skill || "splitConsumePctPerStack" in skill,
)).toBe(false);
```

- [x] **Step 2: Run the skill test and verify it fails on the existing slime metadata**

Run: `npm test -- src/adventure/data/v2/v2Skills.test.ts`

Expected: FAIL because split metadata remains.

- [x] **Step 3: Reduce the mutation transition to weight-only state**

```ts
export type MutationCastTransition = {
  weightAfter: number;
  weightGained: number;
  weightConsumed: number;
};
```

Update `mutationCastTransition`, its log formatter, and all callers to pass only current weight and weight actions.

- [x] **Step 4: Remove split skill calculations and state propagation from the common resolver and both engines**

Delete split candidate gates, auxiliary hits, fusion multipliers, stack initialization, cast input fields, state updates, and PvE/PvP logs. Keep weight physical damage, speed, stoneskin DEF, and collapse consumption unchanged.

- [x] **Step 5: Replace split scenarios in engine/cast tests with weight-only assertions**

Assert PvE/PvP start at weight 0, rock smash gains weight, collapse consumes it, and no test fixture requires `splitBodies`.

- [x] **Step 6: Run mutation combat tests**

Run: `npm test -- src/adventure/data/v2/v2Skills.test.ts src/adventure/v2/combat/mutationCombat.test.ts src/adventure/v2/combat/combatPatternCast.test.ts src/adventure/v2/combat/mutationCombatEngine.test.ts`

Expected: PASS.

### Task 3: Remove split from patterns and battle UI, then verify

**Files:**
- Modify: `src/adventure/v2/combat/combatPattern.ts`
- Modify: `src/adventure/v2/combat/combatPattern.test.ts`
- Modify: `src/adventure/v2/V2CombatPatternView.tsx`
- Modify: `src/adventure/v2/V2CombatPatternView.test.tsx`
- Modify: `src/adventure/data/v2/arenaLoadout.ts`
- Modify: `src/adventure/battle/BattleScene.tsx`
- Modify: `src/adventure/battle/BattleScene.test.tsx`
- Modify: `docs/superpowers/plans/2026-08-19-remove-slime-mutation-branch.md`

**Interfaces:**
- `V2PatternSelfResource` retains `weight` and rejects stored `split` conditions.
- Battle UI exposes only the generator-gated weight counter.

- [x] **Step 1: Add failing parser/UI absence tests**

```ts
expect(parseCombatPattern(patternWithResource("split"))).toEqual([]);
expect(renderPatternEditor()).not.toContain("분열체");
expect(renderBattle()).not.toContain("분열체");
```

- [x] **Step 2: Run the pattern/UI tests and verify the absence assertions fail**

Run: `npm test -- src/adventure/v2/combat/combatPattern.test.ts src/adventure/v2/V2CombatPatternView.test.tsx src/adventure/battle/BattleScene.test.tsx`

Expected: FAIL because split remains an accepted/displayed resource.

- [x] **Step 3: Remove split from the parser union, labels, choice list, arena formatting, and battle readout**

Keep `weight` labels and the opaque `SURFACE_INSET` weight counter unchanged.

- [x] **Step 4: Search production code for orphaned job-level slime and split identifiers**

Run: `rg -n "v2c_slime_|splitBodies|splitGain|splitAuxHit|splitConsume|분열체" src scripts`

Expected: no matches. Generic monster/material `slime` matches are allowed and must remain.

- [x] **Step 5: Run complete verification**

Run:

```bash
npm test
npx tsc --noEmit
npm run lint
npm run build
git diff --check
```

Expected: every command exits 0.

- [x] **Step 6: Check off this plan and commit the removal**

```bash
git add docs/superpowers/plans/2026-08-19-remove-slime-mutation-branch.md src/adventure
git commit -m "refactor: remove slime mutation branch"
```

## Execution Record

- Catalog RED: 3 expected failures proved that the slime job, skills, and roadmap leaf still existed.
- Split metadata RED: the legacy split chip remained visible until the formatter and skill contract were removed.
- Pattern/UI RED: the parser kept a stored split condition and the battle scene rendered a split counter until both paths were removed.
- Removing one unlockable job changed the fully unlocked job SP budget from 127 to 126; server and preset expectations now preserve the actual priority-selected loadout.
- Final verification passed with `npm test`, `npx tsc --noEmit`, `npm run lint`, `npm run build`, and `git diff --check`.
