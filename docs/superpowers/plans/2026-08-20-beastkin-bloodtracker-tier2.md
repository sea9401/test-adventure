# Superseded — Beastkin Blood Tracker Tier 2 Implementation Plan

> **Status: superseded. Do not execute.** The approved design moved Blood Tracker to Tier 4 and expanded
> the lineage through Tier 6. The authoritative specification is
> `docs/superpowers/specs/2026-08-20-beastkin-tier2-tier6-design.md`. A replacement implementation plan
> must be written from that specification.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add the single-path Tier 2 mutation job `혈흔추적자`, whose portable skills keep bleed active and grant direct physical skills bonuses at 5 and 10 bleed stacks.

**Architecture:** Keep job and skill declarations in the existing catalogs, and put threshold constants plus the pure threshold calculation in a small data module shared by UI and combat. Wrap the existing DoT merge for the one active-skill refresh rule, then consume the same pre-cast threshold snapshot in both PvE and PvP engines for accuracy, one-action haste, and penetration. The roadmap remains catalog-driven; the battle scene derives its label from current bleed and equipped skills, so no DB or replay schema changes are needed.

**Tech Stack:** TypeScript, React 19 client components, Next.js App Router, Vitest, React DOM server rendering, ESLint.

## Global Constraints

- IDs: job `bloodtracker`; skills `v2c_bloodtracker_reopen` and `v2c_bloodtracker_relentless`.
- Single lineage only: `mutant → beastkin → bloodtracker`.
- Unlock with beastkin job proficiency `1,000` via `TIER2_UNLOCK_CUMLEVEL`; no item or quest condition.
- Cultivation `STR 2 / DEX 2`; innate bonus `STR +12 / DEX +6`.
- `상처 덧내기`: Tier 2 STR direct physical, runtime MP 59 from the current non-caster Tier 2 rubric, cooldown 0, proc 30%, coefficient 1.10, legacy flat 150, player bleed +1. Do not set `fixedMpCost`.
- Normal bleed remains 3 ticks. Only a successful `상처 덧내기` merge ending at 5+ stacks sets bleed to 4 ticks. A later ordinary bleed application resets it to 3 under the current replacement rule.
- `집요한 추적` reads pre-cast active bleed: 5+ grants physical-skill accuracy +12% and next-action haste 8%; 10 grants those plus penetration +15%p.
- Threshold effects apply only to pure direct physical skills, not basic attacks, magic, healing, buffs, DoT, reflect, fixed damage, or equipment extra hits.
- The cast changing 9 stacks to 10 does not receive 10-stack penetration; the following eligible cast does.
- Tracking haste participates in the existing one-action haste maximum and does not add to a stronger haste.
- Do not consume/detonate bleed, change the 10-stack cap, change player coefficient 0.45, or change monster coefficient 0.12.
- Skills remain portable and must not inspect `currentJobId`.
- No DB migration, saved combat resource, route, dependency, image, deployment, or maintenance operation.
- Keep the existing `JobRoadmapDialog` Client Component boundary; no new `"use client"` boundary is required.
- New status UI must remain readable in light/dark mode; do not add a translucent content panel.

---

### Task 1: Register the job and lineage

**Files:**
- Modify: `src/adventure/data/v2/v2JobCatalog.ts`
- Modify: `src/adventure/data/v2/proficiency.ts`
- Modify: `src/adventure/data/v2/v2JobCatalog.test.ts`
- Modify: `src/adventure/data/v2/proficiency.test.ts`
- Modify: `src/adventure/v2/jobExplorer.test.ts`
- Modify: `src/adventure/v2/jobRoadmapModel.test.ts`

**Interfaces:**
- Consumes: `TIER2_UNLOCK_CUMLEVEL`, `V2_SPECIALIZED_CULTIVATE_PROFILE`, catalog-driven `buildJobRoadmap()`.
- Produces: `V2_JOB_CATALOG.bloodtracker`, bridge `{ class: "mutant", spec: "bloodtracker" }`, effective cultivation `{ str: 2, dex: 2 }`, and prerequisite mastery resolution through `cumLevelForJob()`.

- [ ] **Step 1: Add failing catalog and unlock tests**

Extend the mutation case in `v2JobCatalog.test.ts`:

```ts
expect(V2_JOB_CATALOG.bloodtracker).toMatchObject({
  id: "bloodtracker",
  name: "혈흔추적자",
  tier: 2,
  cultivateProfile: { str: 2, dex: 2 },
  jobBonus: { str: 12, dex: 6 },
  unlock: { prereqs: { beastkin: TIER2_UNLOCK_CUMLEVEL } },
});
expect(isJobUnlocked(
  V2_JOB_CATALOG.bloodtracker,
  profJobs({ beastkin: TIER2_UNLOCK_CUMLEVEL - 1 }),
)).toBe(false);
expect(isJobUnlocked(
  V2_JOB_CATALOG.bloodtracker,
  profJobs({ beastkin: TIER2_UNLOCK_CUMLEVEL }),
)).toBe(true);
expect(isJobUnlocked(
  V2_JOB_CATALOG.bloodtracker,
  profWith({ mutant: 99_999 }),
)).toBe(false);
expect(LEGACY_CLASS_SPEC_BY_JOB.bloodtracker).toEqual({
  class: "mutant",
  spec: "bloodtracker",
});
expect(jobIdFromLegacy("mutant", "bloodtracker")).toBe("bloodtracker");
```

In `proficiency.test.ts` add:

```ts
expect(effectiveCultivateProfile("mutant", "bloodtracker")).toEqual({
  str: 2,
  dex: 2,
});
```

In `jobRoadmapModel.test.ts` add:

```ts
const beastkin = mutant?.children.find((node) => node.id === "beastkin");
expect(beastkin?.children.map((node) => node.id)).toEqual(["bloodtracker"]);
expect(beastkin?.children[0]?.prereqText).toBe("수인 숙련도 1000");
```

In the mutation portion of `jobExplorer.test.ts`'s line-order case, include `bloodtracker` in the input and assert the depth-first order ends with:

```ts
"mutant",
"beastkin",
"bloodtracker",
"golem",
```

- [ ] **Step 2: Run tests and verify RED**

```bash
npm test -- src/adventure/data/v2/v2JobCatalog.test.ts src/adventure/data/v2/proficiency.test.ts src/adventure/v2/jobExplorer.test.ts src/adventure/v2/jobRoadmapModel.test.ts
```

Expected: failures because the catalog entry, profile override, bridge, and roadmap edge do not exist.

- [ ] **Step 3: Add the catalog entry and bridge**

```ts
bloodtracker: {
  id: "bloodtracker",
  name: "혈흔추적자",
  tier: 2,
  cultivateProfile: { str: 2, dex: 2 },
  jobBonus: { str: 12, dex: 6 },
  unlock: { prereqs: { beastkin: TIER2_UNLOCK_CUMLEVEL } },
},
```

Add beside the mutation bridges:

```ts
bloodtracker: { class: "mutant", spec: "bloodtracker" },
```

- [ ] **Step 4: Preserve the specialized cultivation profile**

Add to `V2_SPECIALIZED_CULTIVATE_PROFILE`:

```ts
bloodtracker: { str: 2, dex: 2 },
```

- [ ] **Step 5: Use concrete-job mastery for every prerequisite**

Inside `isJobUnlockedInternal()`, replace the tier-only branch with the same helper already used by mastery display:

```ts
const prerequisite = V2_JOB_CATALOG[prereqJobId];
const actual = prerequisite
  ? cumLevelForJob(proficiency, prerequisite)
  : (proficiency.groups[prereqJobId]?.cumLevel ?? 0);
```

This keeps normal Tier 1 roots such as `warrior` on `groups.warrior`, keeps Tier 2+ parents on `jobCumLevel`, and correctly sends Tier 1 mutation specializations `beastkin` and `golem` to their concrete `jobCumLevel` entries.

- [ ] **Step 6: Run tests and verify GREEN**

Run the Step 2 command. Expected: all three files pass and the roadmap is generated from the prerequisite.

- [ ] **Step 7: Commit**

```bash
git add src/adventure/data/v2/v2JobCatalog.ts src/adventure/data/v2/proficiency.ts src/adventure/data/v2/v2JobCatalog.test.ts src/adventure/data/v2/proficiency.test.ts src/adventure/v2/jobExplorer.test.ts src/adventure/v2/jobRoadmapModel.test.ts
git commit -m "feat: add blood tracker job lineage"
```

---

### Task 2: Declare skills and shared threshold rules

**Files:**
- Create: `src/adventure/data/v2/bloodTracker.ts`
- Create: `src/adventure/data/v2/bloodTracker.test.ts`
- Modify: `src/adventure/data/v2/v2Skills.ts`
- Modify: `src/adventure/data/v2/v2SkillsCommonCatalog.ts`
- Modify: `src/adventure/data/v2/v2SkillsByJob.ts`
- Modify: `src/adventure/data/v2/v2SkillsByJob.test.ts`
- Modify: `src/adventure/data/v2/v2Skills.test.ts`

**Interfaces:**
- Produces: `BLOOD_TRACKER_RULES`, `bloodTrackingBonuses()`, `bloodTrackingStage()`, `V2PassiveSkillEffect.bloodTracking`, and `V2SkillDefinition.dotRefreshAtStacks`.
- Consumers: Tasks 3–5 import these rules; the data catalog does not import a combat engine module.

- [ ] **Step 1: Write failing pure-rule tests**

Create `bloodTracker.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  BLOOD_TRACKER_RULES,
  bloodTrackingBonuses,
  bloodTrackingStage,
} from "./bloodTracker";

describe("blood tracker thresholds", () => {
  it.each([
    [false, 10, { accuracyPct: 0, hastePct: 0, penetrationPct: 0 }],
    [true, 4, { accuracyPct: 0, hastePct: 0, penetrationPct: 0 }],
    [true, 5, { accuracyPct: 12, hastePct: 8, penetrationPct: 0 }],
    [true, 9, { accuracyPct: 12, hastePct: 8, penetrationPct: 0 }],
    [true, 10, { accuracyPct: 12, hastePct: 8, penetrationPct: 15 }],
  ] as const)("enabled=%s stacks=%s", (enabled, stacks, expected) => {
    expect(bloodTrackingBonuses(enabled, stacks)).toEqual(expected);
  });

  it("returns UI stages at the exact boundaries", () => {
    expect(bloodTrackingStage(4)).toBe(null);
    expect(bloodTrackingStage(5)).toBe("tracking");
    expect(bloodTrackingStage(10)).toBe("apex");
    expect(BLOOD_TRACKER_RULES.refreshTurns).toBe(4);
  });
});
```

- [ ] **Step 2: Add failing catalog, mapping, aggregation, and chip tests**

Add to `v2SkillsByJob.test.ts`:

```ts
expect(skillsForJob("bloodtracker")).toEqual([
  "v2c_bloodtracker_reopen",
  "v2c_bloodtracker_relentless",
]);
expect(V2_SKILLS.v2c_bloodtracker_reopen).toMatchObject({
  name: "상처 덧내기",
  stat: "str",
  category: "attack",
  tier: 2,
  mpCost: 34,
  cooldown: 0,
  procChance: 30,
  dotRefreshAtStacks: { tag: "bleed", minStacks: 5, turns: 4 },
});
expect(aggregateEquippedPassives([
  "v2c_bloodtracker_relentless",
]).bloodTracking).toBe(true);
expect(v2SkillMpCostValue(V2_SKILLS.v2c_bloodtracker_reopen)).toBe(59);
expect(V2_SKILLS.v2c_bloodtracker_reopen.fixedMpCost).toBeUndefined();
```

Add to `v2Skills.test.ts`:

```ts
expect(describeV2Skill(V2_SKILLS.v2c_bloodtracker_reopen)).toEqual(
  expect.arrayContaining(["출혈 5중첩 이상: 지속 4회로 갱신"]),
);
expect(describeV2Skill(V2_SKILLS.v2c_bloodtracker_relentless)).toEqual(
  expect.arrayContaining([
    "출혈 5+: 물리 스킬 적중 +12% · 다음 행동 8% 가속",
    "출혈 10: 물리 스킬 방어 관통 +15%p",
  ]),
);
```

- [ ] **Step 3: Run tests and verify RED**

```bash
npm test -- src/adventure/data/v2/bloodTracker.test.ts src/adventure/data/v2/v2SkillsByJob.test.ts src/adventure/data/v2/v2Skills.test.ts
```

Expected: missing module, IDs, metadata, mapping, and chips.

- [ ] **Step 4: Implement the pure rule module**

```ts
export const BLOOD_TRACKER_RULES = {
  trackingStacks: 5,
  apexStacks: 10,
  accuracyPct: 12,
  hastePct: 8,
  penetrationPct: 15,
  refreshTurns: 4,
} as const;

export function bloodTrackingBonuses(enabled: boolean, rawStacks: number) {
  const stacks = Math.max(0, Math.floor(rawStacks));
  if (!enabled || stacks < BLOOD_TRACKER_RULES.trackingStacks) {
    return { accuracyPct: 0, hastePct: 0, penetrationPct: 0 };
  }
  return {
    accuracyPct: BLOOD_TRACKER_RULES.accuracyPct,
    hastePct: BLOOD_TRACKER_RULES.hastePct,
    penetrationPct: stacks >= BLOOD_TRACKER_RULES.apexStacks
      ? BLOOD_TRACKER_RULES.penetrationPct
      : 0,
  };
}

export function bloodTrackingStage(rawStacks: number): "tracking" | "apex" | null {
  const stacks = Math.max(0, Math.floor(rawStacks));
  if (stacks >= BLOOD_TRACKER_RULES.apexStacks) return "apex";
  if (stacks >= BLOOD_TRACKER_RULES.trackingStacks) return "tracking";
  return null;
}
```

- [ ] **Step 5: Add metadata types and aggregation**

Add to `V2PassiveSkillEffect`:

```ts
bloodTracking?: boolean;
```

Add to `V2SkillDefinition`:

```ts
dotRefreshAtStacks?: {
  tag: "bleed" | "poison" | "burn";
  minStacks: number;
  turns: number;
};
```

Thread `bloodTracking: boolean` through `aggregateEquippedPassives()`: initialize `false`, set true if any equipped passive declares it, and return it.

- [ ] **Step 6: Add skill IDs, definitions, and job mapping**

Add both IDs to `V2CommonSkillId`. Import `BLOOD_TRACKER_RULES` and declare:

```ts
v2c_bloodtracker_reopen: {
  id: "v2c_bloodtracker_reopen", name: "상처 덧내기", stat: "str",
  category: "attack", tier: 2,
  description: "상처를 다시 벌려 출혈의 흔적이 끊기지 않게 한다.",
  mpCost: 34, cooldown: 0, procChance: 30,
  effects: [dmg(1.1, 150), { kind: "dot", ...V2_DOT_PRESETS.출혈, stacks: 1 }],
  dotRefreshAtStacks: {
    tag: "bleed",
    minStacks: BLOOD_TRACKER_RULES.trackingStacks,
    turns: BLOOD_TRACKER_RULES.refreshTurns,
  },
},
v2c_bloodtracker_relentless: {
  id: "v2c_bloodtracker_relentless", name: "집요한 추적", stat: "dex",
  category: "passive", tier: 2,
  description: "짙어진 피 냄새를 놓치지 않고 끝까지 사냥감을 몰아붙인다.",
  mpCost: 0, cooldown: 0, effects: [], passive: { bloodTracking: true },
},
```

Add `bloodtracker: ["v2c_bloodtracker_reopen", "v2c_bloodtracker_relentless"]` to `V2_SKILLS_BY_JOB`.

- [ ] **Step 7: Add exact detail chips**

In `describePassive()`, emit the two approved threshold strings when `p.bloodTracking` is true. In `describeV2Skill()`, emit `출혈 ${minStacks}중첩 이상: 지속 ${turns}회로 갱신` from `skill.dotRefreshAtStacks`. Keep both branches conditional so existing skill descriptions do not change.

- [ ] **Step 8: Run tests and verify GREEN**

Run the Step 3 command. Expected: all threshold, catalog, aggregation, mapping, and chip tests pass.

- [ ] **Step 9: Commit**

```bash
git add src/adventure/data/v2/bloodTracker.ts src/adventure/data/v2/bloodTracker.test.ts src/adventure/data/v2/v2Skills.ts src/adventure/data/v2/v2SkillsCommonCatalog.ts src/adventure/data/v2/v2SkillsByJob.ts src/adventure/data/v2/v2SkillsByJob.test.ts src/adventure/data/v2/v2Skills.test.ts
git commit -m "feat: define blood tracker skills"
```

---

### Task 3: Apply the active skill's conditional bleed refresh

**Files:**
- Create: `src/adventure/v2/combat/bloodTrackerCombat.ts`
- Create: `src/adventure/v2/combat/bloodTrackerCombat.test.ts`
- Modify: `src/adventure/v2/combat/engine.ts`
- Modify: `src/adventure/v2/combat/engine-pvp.ts`
- Modify: `src/adventure/v2/combat/mutationCombatEngine.test.ts`

**Interfaces:**
- Consumes: `V2SkillDefinition.dotRefreshAtStacks`, `applyV2DotsToTarget()`, and the post-miss/post-status-block `dotsToApplyToTarget` list.
- Produces: `applyV2SkillDotsToTarget(current, toApply, refreshRule)` returning the merged list with one optional duration replacement.

- [ ] **Step 1: Write failing pure refresh tests**

Create `bloodTrackerCombat.test.ts` and use `makeBleedDot()` fixtures:

```ts
const refresh = { tag: "bleed" as const, minStacks: 5, turns: 4 };

expect(applyV2SkillDotsToTarget(
  [],
  [makeBleedDot({ stacks: 1, flatPerStack: 10, sourceAtk: 100 })],
  refresh,
).find((dot) => dot.tag === "bleed")).toMatchObject({ stacks: 1, turns: 3 });

expect(applyV2SkillDotsToTarget(
  [makeBleedDot({ stacks: 3, turns: 2, flatPerStack: 10, sourceAtk: 100 })],
  [makeBleedDot({ stacks: 1, flatPerStack: 10, sourceAtk: 100 })],
  refresh,
).find((dot) => dot.tag === "bleed")).toMatchObject({ stacks: 4, turns: 3 });

expect(applyV2SkillDotsToTarget(
  [makeBleedDot({ stacks: 4, turns: 1, flatPerStack: 10, sourceAtk: 100 })],
  [makeBleedDot({ stacks: 1, flatPerStack: 10, sourceAtk: 100 })],
  refresh,
).find((dot) => dot.tag === "bleed")).toMatchObject({ stacks: 5, turns: 4 });

expect(applyV2SkillDotsToTarget(
  [makeBleedDot({ stacks: 10, turns: 1, flatPerStack: 10, sourceAtk: 100 })],
  [makeBleedDot({ stacks: 1, flatPerStack: 10, sourceAtk: 100 })],
  refresh,
).find((dot) => dot.tag === "bleed")).toMatchObject({ stacks: 10, turns: 4 });

expect(applyV2SkillDotsToTarget(
  [makeBleedDot({ stacks: 5, turns: 2, flatPerStack: 10, sourceAtk: 100 })],
  [],
  refresh,
).find((dot) => dot.tag === "bleed")).toMatchObject({ stacks: 5, turns: 2 });
```

Also assert that applying an ordinary 3-turn bleed without a refresh rule resets an existing 4-turn bleed to 3.

- [ ] **Step 2: Run the helper test and verify RED**

```bash
npm test -- src/adventure/v2/combat/bloodTrackerCombat.test.ts
```

Expected: missing-module/import failure.

- [ ] **Step 3: Implement the merge wrapper**

Create `bloodTrackerCombat.ts`:

```ts
import {
  applyV2DotsToTarget,
  type V2Dot,
  type V2DotList,
  type V2DotTag,
} from "./combatShared";

export type V2DotRefreshAtStacks = {
  tag: V2DotTag;
  minStacks: number;
  turns: number;
};

export function applyV2SkillDotsToTarget(
  current: V2DotList,
  toApply: readonly V2Dot[],
  refreshRule?: V2DotRefreshAtStacks,
): V2Dot[] {
  const merged = applyV2DotsToTarget(current, toApply);
  if (!refreshRule || !toApply.some((dot) => dot.tag === refreshRule.tag)) {
    return merged;
  }
  return merged.map((dot) =>
    dot.tag === refreshRule.tag && dot.stacks >= refreshRule.minStacks
      ? { ...dot, turns: refreshRule.turns }
      : dot,
  );
}
```

- [ ] **Step 4: Run the helper test and verify GREEN**

Run the Step 2 command. Expected: all 1/4/5/10-stack, empty-application, and ordinary-refresh cases pass.

- [ ] **Step 5: Write failing PvE/PvP integration tests**

In `mutationCombatEngine.test.ts`, equip only `v2c_bloodtracker_reopen`, seed the target at 4 bleed stacks, mock `Math.random()` to 0, and assert:

```ts
expect(pve.enemyV2Dots.find((dot) => dot.tag === "bleed")).toMatchObject({
  stacks: 5,
  turns: 4,
});
expect(pvp.p2.v2Dots.find((dot) => dot.tag === "bleed")).toMatchObject({
  stacks: 5,
  turns: 4,
});
```

Add a 10-stack cap case, a guaranteed-evade case, and a PvP status-block case. The latter two must preserve the original stacks/turns. Assert the successful log contains `+1스택 (4회)`.

- [ ] **Step 6: Run integration tests and verify RED**

```bash
npm test -- src/adventure/v2/combat/mutationCombatEngine.test.ts
```

Expected: successful casts still merge to 3 turns and log `3회`.

- [ ] **Step 7: Wire the wrapper into both skill-cast engines**

Replace only the inner application of `result.dotsToApplyToTarget`. In PvE use:

```ts
const skillMergedEnemyDots = applyV2SkillDotsToTarget(
  state.enemyV2Dots,
  dotsToApplyToTarget,
  castDefinition?.dotRefreshAtStacks,
);
const nextEnemyDots = applyV2DotsToTarget(
  skillMergedEnemyDots,
  sigSkillTargetDots,
);
```

In PvP keep the status-block branch and use:

```ts
const nextOppDots = blockHostileStatus
  ? opp.v2Dots
  : applyV2DotsToTarget(
      applyV2SkillDotsToTarget(
        opp.v2Dots,
        dotsToApplyToTarget,
        castDefinition?.dotRefreshAtStacks,
      ),
      sigSkillTargetDots,
    );
```

Keep the PvP `blockHostileStatus ? oldDots : ...` branch outside the wrapper. For this skill only, derive the logged duration from the final matching target DoT; leave all existing log strings byte-identical for skills without `dotRefreshAtStacks`.

- [ ] **Step 8: Run helper and integration tests and verify GREEN**

```bash
npm test -- src/adventure/v2/combat/bloodTrackerCombat.test.ts src/adventure/v2/combat/mutationCombatEngine.test.ts
```

- [ ] **Step 9: Commit**

```bash
git add src/adventure/v2/combat/bloodTrackerCombat.ts src/adventure/v2/combat/bloodTrackerCombat.test.ts src/adventure/v2/combat/engine.ts src/adventure/v2/combat/engine-pvp.ts src/adventure/v2/combat/mutationCombatEngine.test.ts
git commit -m "feat: refresh blood tracker bleed duration"
```

---

### Task 4: Apply the 5- and 10-stack passive bonuses

**Files:**
- Modify: `src/adventure/v2/combat/bloodTrackerCombat.ts`
- Modify: `src/adventure/v2/combat/bloodTrackerCombat.test.ts`
- Modify: `src/adventure/v2/combat/engine.ts`
- Modify: `src/adventure/v2/combat/engine-pvp.ts`
- Modify: `src/adventure/v2/combat/mutationCombatEngine.test.ts`

**Interfaces:**
- Consumes: `aggregateEquippedPassives(...).bloodTracking`, `bloodTrackingBonuses()`, target bleed before the cast, `directDamagePiercePctAdd`, skill accuracy sums, and returned `selfHastePct`.
- Produces: `isPureDirectPhysicalCast(result)` and one pre-cast `{ accuracyPct, hastePct, penetrationPct }` snapshot per action.

- [ ] **Step 1: Add a failing physical-cast classifier test**

```ts
expect(isPureDirectPhysicalCast({ enemyDamage: 100, magicEnemyDamage: 0 })).toBe(true);
expect(isPureDirectPhysicalCast({ enemyDamage: 100, magicEnemyDamage: 100 })).toBe(false);
expect(isPureDirectPhysicalCast({ enemyDamage: 120, magicEnemyDamage: 20 })).toBe(false);
expect(isPureDirectPhysicalCast({ enemyDamage: 0, magicEnemyDamage: 0 })).toBe(false);
```

Implement exactly:

```ts
export function isPureDirectPhysicalCast(result: {
  enemyDamage: number;
  magicEnemyDamage: number;
}): boolean {
  return result.enemyDamage > 0 && result.magicEnemyDamage === 0;
}
```

- [ ] **Step 2: Add failing engine threshold tests**

Use an equipped passive plus a forced physical attack and seed 4, 5, 9, and 10 active bleed stacks. Test both PvE and PvP:

Build the PvE fixture explicitly:

```ts
const castTrackedPhysicalPve = (
  stacks: number,
  options: { passive: boolean; enemyDef: number; enemyEvasion: number },
) => {
  const attack = "v2c_squire_cleave" as const;
  const passive = "v2c_bloodtracker_relentless" as const;
  const equipped = options.passive ? [attack, passive] : [attack];
  const enemy = { ...ENEMY, def: options.enemyDef, evasionPct: options.enemyEvasion };
  const initial = initialBattleState(
    PLAYER,
    enemy,
    "추적자",
    { learned: equipped, equipped },
  );
  return applyPlayerV2SkillCast(
    {
      ...initial,
      enemyV2Dots: [makeBleedDot({
        stacks,
        turns: 3,
        flatPerStack: 10,
        sourceAtk: 100,
      })],
    },
    PLAYER,
    { selfBuffs: {}, selfDebuffs: {}, enemyDebuffs: {} },
  );
};
```

Use the existing `initialBattleStatePvP()` pattern to create `castTrackedPhysicalPvp()` with the same equipped list and seed `p2.v2Dots` with the same `makeBleedDot()` fixture. Then make the comparisons concrete:

```ts
vi.spyOn(Math, "random").mockReturnValue(0);
const at4 = castTrackedPhysicalPve(4, {
  passive: true, enemyDef: 200, enemyEvasion: 0,
});
expect(at4.selfHastePct).toBe(0);

const noAccuracy = castTrackedPhysicalPve(5, {
  passive: false, enemyDef: 0, enemyEvasion: 100,
});
const withAccuracy = castTrackedPhysicalPve(5, {
  passive: true, enemyDef: 0, enemyEvasion: 100,
});
expect(withAccuracy.state.enemyHp).toBeLessThan(noAccuracy.state.enemyHp);
expect(withAccuracy.selfHastePct).toBe(8);

const at9 = castTrackedPhysicalPve(9, {
  passive: true, enemyDef: 200, enemyEvasion: 0,
});
const at10 = castTrackedPhysicalPve(10, {
  passive: true, enemyDef: 200, enemyEvasion: 0,
});
expect(at10.state.enemyHp).toBeLessThan(at9.state.enemyHp);
expect(at10.selfHastePct).toBe(8);
```

- 4 stacks: no accuracy, haste, or penetration delta.
- 5 and 9: accuracy improves the existing evasion-reduction result, `selfHastePct === 8`, and damage against DEF 200 has no tracking penetration delta.
- 10: the same accuracy/haste plus higher physical damage from 15% penetration.
- 9 then `상처 덧내기`: the current cast has no penetration; the following physical cast does.
- A magic cast and a basic-attack fallback receive no threshold bonus.
- `v2c_absolute_unity`'s existing 25% self-haste returns 25, not 33.
- Removing the passive makes all tracking bonuses zero at 10 stacks.

Assert direct return values and HP deltas from `applyPlayerV2SkillCast()` and `castV2SkillOnAttackerTurnPvP()`; do not use random full-battle outcomes.

- [ ] **Step 3: Run combat tests and verify RED**

```bash
npm test -- src/adventure/v2/combat/bloodTrackerCombat.test.ts src/adventure/v2/combat/mutationCombatEngine.test.ts
```

Expected: classifier import and threshold assertions fail.

- [ ] **Step 4: Capture the pre-cast threshold snapshot**

In PvE, before applying result DoTs, derive:

```ts
const preCastBleedStacks = state.enemyV2Dots
  .filter((dot) => dot.tag === "bleed" && dot.turns > 0 && dot.stacks > 0)
  .reduce((sum, dot) => sum + dot.stacks, 0);
const tracking = bloodTrackingBonuses(
  aggregateEquippedPassives(state.v2Skills.equipped).bloodTracking,
  preCastBleedStacks,
);
```

Use the same calculation in PvP with `opp.v2Dots` and `side.v2Skills.equipped`.

Immediately after the initial cast result, before penetration reruns:

```ts
const bloodTrackingPhysical = isPureDirectPhysicalCast(result);
const trackingAccuracyPct = bloodTrackingPhysical ? tracking.accuracyPct : 0;
const trackingPenetrationPct = bloodTrackingPhysical
  ? tracking.penetrationPct
  : 0;
```

Do not recompute `tracking` after the cast adds bleed.

- [ ] **Step 5: Add accuracy and penetration at existing calculation points**

Add `trackingAccuracyPct` to the existing skill accuracy sum in both engines. Add `trackingPenetrationPct` to the existing crossover/formula `directDamagePiercePctAdd` rerun sum. Do not introduce a separate damage formula or bypass the current penetration path.

For PvP guaranteed evasion, keep full target-effect removal. Preserve the pre-evade physical classification only so a normally cast physical skill can still qualify for next-action haste.

- [ ] **Step 6: Add tracking to the one-action haste maximum**

Extend both existing maximums:

```ts
selfHastePct: Math.max(
  result.selfHasteToApply?.pct ?? 0,
  crossover?.hastePct ?? 0,
  formulaPreview?.completes ? 20 : 0,
  result.castSkillId && bloodTrackingPhysical ? tracking.hastePct : 0,
),
```

Use `formulaPreview?.completes ? 12 : 0` in the corresponding PvP maximum. Do not change either existing formula haste value.

- [ ] **Step 7: Run tests and verify GREEN**

Run the Step 3 command. Expected: 4/5/9/10, pre-cast snapshot, nonphysical exclusion, passive-off, PvE/PvP parity, and haste-maximum cases pass.

- [ ] **Step 8: Commit**

```bash
git add src/adventure/v2/combat/bloodTrackerCombat.ts src/adventure/v2/combat/bloodTrackerCombat.test.ts src/adventure/v2/combat/engine.ts src/adventure/v2/combat/engine-pvp.ts src/adventure/v2/combat/mutationCombatEngine.test.ts
git commit -m "feat: add blood tracking thresholds"
```

---

### Task 5: Show tracking stages and complete verification

**Files:**
- Modify: `src/adventure/battle/BattleScene.tsx`
- Modify: `src/adventure/battle/BattleScene.test.tsx`

**Interfaces:**
- Consumes: `bloodTrackingStage()`, `state.enemyV2Dots`, and `state.v2Skills.equipped`.
- Produces: an enemy bleed chip with stack/turn information and conditional `추적` or `사냥의 절정`; no new component state or client boundary.

- [ ] **Step 1: Write failing static-render tests**

Add this fixture helper around `initialBattleState()`:

```tsx
const renderBattleSceneWithBleed = (
  stacks: number,
  options: { trackingEquipped: boolean; turns: number },
): string => {
  const enemy: Monster = {
    name: "훈련용 적",
    tags: [],
    hp: 100,
    atk: 10,
    def: 5,
    spd: 5,
    exp: 0,
  };
  const skillId = "v2c_bloodtracker_relentless" as const;
  const equipped = options.trackingEquipped ? [skillId] : [];
  const initial = initialBattleState(
    { hp: 100, maxHp: 100, atk: 10, def: 5, spd: 10,
      evasionPct: 0, attackCount: 1 },
    enemy,
    "수인",
    { learned: equipped, equipped },
  );
  const state = {
    ...initial,
    enemyV2Dots: [makeBleedDot({
      stacks,
      turns: options.turns,
      flatPerStack: 10,
      sourceAtk: 100,
    })],
  };
  return renderToStaticMarkup(
    <BattleScene
      state={state}
      playerName="수인"
      playerStatus={{ gender: "male1", exp: 0, maxExp: 100, hpPotionCount: 0 }}
      layout="split"
    />,
  );
};
```

Import `makeBleedDot` from the shared combat module, then add the table test:

```ts
it.each([
  [4, "출혈 4/10 · 3회", null],
  [5, "출혈 5/10 · 4회", "추적"],
  [10, "출혈 10/10 · 4회", "사냥의 절정"],
] as const)("출혈 %s중첩 표시", (stacks, baseLabel, stageLabel) => {
  const html = renderBattleSceneWithBleed(stacks, {
    trackingEquipped: true,
    turns: stacks >= 5 ? 4 : 3,
  });
  expect(html).toContain(baseLabel);
  if (stageLabel) expect(html).toContain(stageLabel);
});
```

Add a passive-off 10-stack case that still displays `출혈 10/10 · 4회` but does not display `사냥의 절정`.

- [ ] **Step 2: Run the component test and verify RED**

```bash
npm test -- src/adventure/battle/BattleScene.test.tsx
```

Expected: the battle scene renders no bleed/tracking chip.

- [ ] **Step 3: Derive and render the enemy bleed chip**

At the top of `BattleScene`:

```ts
const enemyBleed = state.enemyV2Dots.find(
  (dot) => dot.tag === "bleed" && dot.stacks > 0 && dot.turns > 0,
);
const bloodTrackingEquipped = equippedSkillIds.includes(
  "v2c_bloodtracker_relentless",
);
const trackingStage = bloodTrackingEquipped && enemyBleed
  ? bloodTrackingStage(enemyBleed.stacks)
  : null;
```

Add a synchronous `EnemyBleedChip` and render it below the enemy HP bar in both `split` and `stacked` layouts. Build its accessible label exactly:

```ts
const stageLabel =
  stage === "apex" ? "사냥의 절정" : stage === "tracking" ? "추적" : null;
const label = [
  `출혈 ${bleed.stacks}/${bleed.maxStacks} · ${bleed.turns}회`,
  stageLabel,
].filter(Boolean).join(" · ");
```

Use an opaque rose status-chip background in both themes. Do not add another `"use client"` directive or a translucent panel.

- [ ] **Step 4: Run the component test and verify GREEN**

Run the Step 2 command. Expected: 4/5/10 and passive-off cases pass.

- [ ] **Step 5: Run focused regression tests**

```bash
npm test -- src/adventure/data/v2/bloodTracker.test.ts src/adventure/data/v2/v2JobCatalog.test.ts src/adventure/data/v2/proficiency.test.ts src/adventure/data/v2/v2Skills.test.ts src/adventure/data/v2/v2SkillsByJob.test.ts src/adventure/v2/jobExplorer.test.ts src/adventure/v2/jobRoadmapModel.test.ts src/adventure/v2/combat/bloodTrackerCombat.test.ts src/adventure/v2/combat/mutationCombatEngine.test.ts src/adventure/v2/combat/combatPatternCast.test.ts src/adventure/v2/combat/dotUnify.test.ts src/adventure/battle/BattleScene.test.tsx
```

Expected: all focused suites pass with zero failures.

- [ ] **Step 6: Run static validation and the full test suite**

```bash
npx eslint src/adventure/data/v2/bloodTracker.ts src/adventure/data/v2/bloodTracker.test.ts src/adventure/data/v2/v2JobCatalog.ts src/adventure/data/v2/v2JobCatalog.test.ts src/adventure/data/v2/proficiency.ts src/adventure/data/v2/proficiency.test.ts src/adventure/data/v2/v2Skills.ts src/adventure/data/v2/v2Skills.test.ts src/adventure/data/v2/v2SkillsCommonCatalog.ts src/adventure/data/v2/v2SkillsByJob.ts src/adventure/data/v2/v2SkillsByJob.test.ts src/adventure/v2/jobExplorer.test.ts src/adventure/v2/jobRoadmapModel.test.ts src/adventure/v2/combat/bloodTrackerCombat.ts src/adventure/v2/combat/bloodTrackerCombat.test.ts src/adventure/v2/combat/engine.ts src/adventure/v2/combat/engine-pvp.ts src/adventure/v2/combat/mutationCombatEngine.test.ts src/adventure/battle/BattleScene.tsx src/adventure/battle/BattleScene.test.tsx
npx tsc --noEmit
npm test
```

Expected: ESLint exit 0, TypeScript exit 0, and Vitest reports zero failed tests.

- [ ] **Step 7: Review the final diff against exclusions**

```bash
git diff --check
git status --short
git diff --stat
```

Confirm the diff has no migration, deployment, maintenance script, route, image, dependency, bleed detonation, maximum-stack change, or monster-bleed change.

- [ ] **Step 8: Commit the UI slice**

```bash
git add src/adventure/battle/BattleScene.tsx src/adventure/battle/BattleScene.test.tsx
git commit -m "feat: show blood tracking combat stages"
```
