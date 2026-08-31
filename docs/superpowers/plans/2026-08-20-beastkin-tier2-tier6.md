# Beastkin Tier 2–6 Lineage Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:executing-plans` to implement this plan task-by-task with review checkpoints. Do not spawn subagents unless the user explicitly authorizes them.

**Goal:** Add the approved single-path Beastkin lineage from `야수전사` through `원시 포식자`, with ten portable skills that reward maintaining player bleed at 5 and 10 stacks while staying balanced against same-tier jobs.

**Architecture:** Keep jobs and skills in the existing catalogs, and add one data-only `bleedHunt` module as the shared declaration for runtime, tooltips, and power scoring. Resolve a pre-cast bleed snapshot in `combatShared`, return generic conditional accuracy, haste, delay, actual-damage healing, and bleed-change intents, then let both combat engines apply those intents after hit and actual-damage resolution. Derive the battle label from current dots and equipped metadata; do not persist a new resource or add a Client Component boundary.

**Tech Stack:** TypeScript 5, React 19, Next.js 16 App Router, Vitest 4, ESLint 9, existing deterministic battle engines and simulation scripts.

## Global Constraints

- Authoritative design: `docs/superpowers/specs/2026-08-20-beastkin-tier2-tier6-design.md`.
- Lineage: `mutant → beastkin → beastwarrior → tracker → bloodtracker → predator → primalpredator`.
- Add exactly five jobs and ten skills; skills remain portable and must never inspect the current job ID.
- All 5/10-stack rules use the active player-bleed snapshot taken before the selected skill changes dots.
- Only attack skills whose resolved direct-damage effects are all physical qualify. Basic attacks, magic/SPI, healing, buffs, DoT, fixed damage, reflect, counters, and equipment hits do not qualify.
- Keep player bleed at maximum 10 stacks, three default ticks, and ATK coefficient `0.45`; do not change monster bleed.
- `추격 본능` 6% and `원시 포식` 15% haste add to 21% before existing action-interval floors. Conditional penetration also adds before existing caps.
- Use an independent `bleedHuntRoll` supplied once by the engine for the 30% duration-extension roll. Reusing a cast input must not roll twice or correlate with `procRoll`.
- Generalize actual-damage healing so existing `v2c_blooddemon_reign` behavior is preserved; do not add new skill-ID conditionals.
- No schema migration, saved combat state, dependency, image, route, deployment, maintenance-mode change, or production write.
- Before implementation, reread `node_modules/next/dist/docs/01-app/01-getting-started/05-server-and-client-components.md` and `node_modules/next/dist/docs/01-app/02-guides/testing/vitest.md`. Keep `BattleScene` and `SkillEffectChips` inside their existing client graph.
- Use existing opaque surfaces. Do not add a translucent content card or whole-card opacity.
- Preserve unrelated working-tree changes. Each task commit includes only that task's files.

---

### Task 1: Register the five-job lineage and correct prerequisite mastery

**Files:**

- Modify: `src/adventure/data/v2/v2JobCatalog.ts`
- Modify: `src/adventure/data/v2/proficiency.ts`
- Modify: `src/adventure/data/v2/v2JobCatalog.test.ts`
- Modify: `src/adventure/data/v2/proficiency.test.ts`
- Modify: `src/adventure/v2/jobRoadmapModel.test.ts`
- Modify: `src/adventure/v2/jobExplorer.test.ts`
- Modify: `src/adventure/v2/V2JobLadder.test.tsx`

**Interfaces:**

- Consumes: `TIER2_UNLOCK_CUMLEVEL`, `TIER3_UNLOCK_CUMLEVEL`, `TIER4_UNLOCK_CUMLEVEL`, `TIER5_UNLOCK_CUMLEVEL`, `TIER6_UNLOCK_CUMLEVEL`.
- Produces: five `V2JobDefinition` entries, five legacy class/spec bridges, specialized cultivation lookup, and prerequisite checks through `cumLevelForJob()`.

- [ ] **Step 1: Write failing catalog, unlock-boundary, and lineage tests**

Add a table in `v2JobCatalog.test.ts`:

```ts
const BEASTKIN_LINE = [
  ["beastwarrior", "야수전사", 2, "beastkin", 1_000, { str: 2, dex: 2 }, { str: 12, dex: 6 }],
  ["tracker", "추적자", 3, "beastwarrior", 2_500, { str: 2, dex: 2 }, { str: 13, dex: 7 }],
  ["bloodtracker", "혈흔추적자", 4, "tracker", 4_500, { str: 2, dex: 2 }, { str: 14, dex: 8 }],
  ["predator", "포식자", 5, "bloodtracker", 18_000, { str: 3, dex: 2 }, { str: 17, dex: 9 }],
  ["primalpredator", "원시 포식자", 6, "predator", 35_000, { str: 3, dex: 2, vit: 1 }, { str: 26, dex: 10, vit: 4 }],
] as const;

it.each(BEASTKIN_LINE)("%s has the approved job data", (id, name, tier, parent, required, cultivateProfile, jobBonus) => {
  expect(V2_JOB_CATALOG[id]).toMatchObject({
    id,
    name,
    tier,
    cultivateProfile,
    jobBonus,
    unlock: { prereqs: { [parent]: required } },
  });
});
```

For every row, build proficiency with only the parent's `jobCumLevel` and assert `required - 1` is locked and `required` is unlocked. Add the mutation regression explicitly:

```ts
const wrongSource = emptyProficiency();
wrongSource.groups.mutant = { cultivations: 0, tier: 1, cumLevel: 999_999 };
wrongSource.jobCumLevel = { golem: 999_999 };
expect(isJobUnlocked(V2_JOB_CATALOG.beastwarrior, wrongSource)).toBe(false);

const rightSource = { ...wrongSource, jobCumLevel: { beastkin: 1_000 } };
expect(isJobUnlocked(V2_JOB_CATALOG.beastwarrior, rightSource)).toBe(true);
```

Assert the five bridges all use `{ class: "mutant", spec: id }`, `jobIdFromLegacy("mutant", id)` round-trips, and `cumLevelForJob()` reads `jobCumLevel.beastkin` for the Tier 1 specialization.

In `proficiency.test.ts`, table-test `effectiveCultivateProfile("mutant", id)` for all five jobs. In `jobRoadmapModel.test.ts`, assert the exact child chain. In `jobExplorer.test.ts`, assert depth-first order keeps the five nodes between `beastkin` and `golem`. In `V2JobLadder.test.tsx`, render the mutation lineage and assert all five display names and the locked parent's mastery text appear.

- [ ] **Step 2: Run the focused tests and verify RED**

```bash
npm test -- src/adventure/data/v2/v2JobCatalog.test.ts src/adventure/data/v2/proficiency.test.ts src/adventure/v2/jobRoadmapModel.test.ts src/adventure/v2/jobExplorer.test.ts src/adventure/v2/V2JobLadder.test.tsx
```

Expected: missing catalog entries/bridges/profile entries, plus the Beastkin prerequisite incorrectly accepting `groups` because it is Tier 1.

- [ ] **Step 3: Add catalog entries and compatibility bridges**

Add the five definitions with the table values above and sequential `unlock.prereqs`. Add to `LEGACY_CLASS_SPEC_BY_JOB`:

```ts
beastwarrior: { class: "mutant", spec: "beastwarrior" },
tracker: { class: "mutant", spec: "tracker" },
bloodtracker: { class: "mutant", spec: "bloodtracker" },
predator: { class: "mutant", spec: "predator" },
primalpredator: { class: "mutant", spec: "primalpredator" },
```

- [ ] **Step 4: Route prerequisite checks through concrete-job mastery**

Replace the tier-only branch inside `isJobUnlockedInternal()`:

```ts
const prerequisite = V2_JOB_CATALOG[prereqJobId];
const actual = prerequisite
  ? cumLevelForJob(proficiency, prerequisite)
  : (proficiency.groups[prereqJobId]?.cumLevel ?? 0);
```

This preserves group mastery for root jobs whose legacy spec is `null`, while Tier 1 mutation specializations correctly use `jobCumLevel`.

- [ ] **Step 5: Register all five cultivation overrides**

Add the Tier 2–4 jobs to `V2_SPECIALIZED_CULTIVATE_PROFILE`. Tier 5–6 already read their catalog profiles through `effectiveCultivateProfile`, but register them too so the complete lineage has one explicit source and synchronization tests cover future changes:

```ts
beastwarrior: { str: 2, dex: 2 },
tracker: { str: 2, dex: 2 },
bloodtracker: { str: 2, dex: 2 },
predator: { str: 3, dex: 2 },
primalpredator: { str: 3, dex: 2, vit: 1 },
```

- [ ] **Step 6: Run the focused tests and verify GREEN**

Run the Step 2 command. Expected: all listed suites pass.

- [ ] **Step 7: Commit**

```bash
git add src/adventure/data/v2/v2JobCatalog.ts src/adventure/data/v2/proficiency.ts src/adventure/data/v2/v2JobCatalog.test.ts src/adventure/data/v2/proficiency.test.ts src/adventure/v2/jobRoadmapModel.test.ts src/adventure/v2/jobExplorer.test.ts src/adventure/v2/V2JobLadder.test.tsx
git commit -m "feat: add beastkin job lineage"
```

---

### Task 2: Add declarative bleed-hunt metadata, scoring, and ten skills

**Files:**

- Create: `src/adventure/data/v2/bleedHunt.ts`
- Create: `src/adventure/data/v2/bleedHunt.test.ts`
- Create: `src/adventure/data/v2/beastkinJobLine.test.ts`
- Modify: `src/adventure/data/v2/v2Skills.ts`
- Modify: `src/adventure/data/v2/v2SkillsCommonCatalog.ts`
- Modify: `src/adventure/data/v2/v2SkillsByJob.ts`
- Modify: `src/adventure/data/v2/v2SkillsByJob.test.ts`
- Modify: `src/adventure/data/v2/v2Skills.test.ts`

**Interfaces:**

- Produces: `BleedHuntMechanic`, `bleedHuntStage()`, `bleedHuntPowerValue()`, optional `V2SkillDefinition.bleedHunt`, ten skill IDs, and five two-skill job kits.
- Consumers: `skillPowerScore`, `describeV2Skill`, combat tasks, and battle UI.

- [ ] **Step 1: Write failing pure metadata and scoring tests**

Define the public shape in the test before implementation:

```ts
export type BleedHuntMechanic = {
  minStacks: 5 | 10;
  hitBleedStacks?: number;
  hitBleedSetTurns?: number;
  skillAccuracyPct?: number;
  hitEnemyDelayPct?: number;
  skillPenetrationPct?: number;
  skillActualDamageHealPct?: number;
  castHastePct?: number;
  directPhysicalAccuracyPct?: number;
  directPhysicalHastePct?: number;
  directPhysicalPenetrationPct?: number;
  directPhysicalDamagePct?: number;
  bleedTickHealMaxHpPct?: number;
  directPhysicalHitBleedExtend?: {
    chancePct: number;
    turns: number;
    maxTurns: number;
  };
};
```

Test UI stages at 0/4/5/9/10, constants `BLEED_HUNT_UPTIME_5 = 0.55` and `BLEED_HUNT_UPTIME_10 = 0.30`, and monotonic scoring:

```ts
expect(bleedHuntPowerValue({ minStacks: 10, directPhysicalDamagePct: 12 }))
  .toBeGreaterThan(bleedHuntPowerValue({ minStacks: 10, directPhysicalDamagePct: 6 }));
expect(bleedHuntPowerValue({ minStacks: 5, directPhysicalAccuracyPct: 8 }))
  .toBeGreaterThan(bleedHuntPowerValue({ minStacks: 10, directPhysicalAccuracyPct: 8 }));
```

The scoring helper must use named weights for accuracy, haste, delay, penetration, damage, actual-damage heal, max-HP tick heal, stack add, refresh, and probabilistic extension. Multiply conditional values by the matching uptime; multiply extension by `chancePct / 100`; price refresh with a named marginal-realization factor rather than a full extra tick.

- [ ] **Step 2: Write failing skill catalog and package-budget tests**

In `beastkinJobLine.test.ts`, assert exact IDs, names, passive stat packages, `minStacks`, effect numbers, two skills per job, and no `fixedMpCost`. Assert all five jobs are included in steady job tempo normalization.

Use ranges that enforce the approved post-normalization budgets without coupling to insignificant floating-point drift:

```ts
const EXPECTED = {
  beastwarrior: { power: [2.31, 2.51], sp: 8 },
  tracker: { power: [2.87, 3.07], sp: 9 },
  bloodtracker: { power: [3.65, 3.85], sp: 12 },
  predator: { power: [5.00, 5.20], sp: 15 },
  primalpredator: { power: [9.20, 9.40], sp: 26 },
} as const;
```

Sum `skillPowerScore()` and `spCostOf()` across `V2_SKILLS_BY_JOB[jobId]`. Assert `spCostDiscount` is absent on all ten skills, and mutation of a cloned mechanic toward a stronger value increases both score and derived SP at the relevant threshold.

Add `describeV2Skill()` expectations for every metadata family, such as `출혈 10중첩`, `직접 물리 스킬 피해 +12%`, `실제 피해의 18% HP 회복`, and `30% 확률로 출혈 지속 +1 (최대 4회)`.

- [ ] **Step 3: Run the focused tests and verify RED**

```bash
npm test -- src/adventure/data/v2/bleedHunt.test.ts src/adventure/data/v2/beastkinJobLine.test.ts src/adventure/data/v2/v2SkillsByJob.test.ts src/adventure/data/v2/v2Skills.test.ts
```

Expected: missing module, metadata, skill IDs, catalog entries, mappings, descriptions, and scoring.

- [ ] **Step 4: Implement the data-only metadata module**

Keep `bleedHunt.ts` independent of `v2Skills.ts` to avoid cycles. Export the type, uptime/refresh-realization constants, `bleedHuntStage(stacks)` returning `null | "tracking" | "apex"`, `bleedHuntStageLabel()`, and `bleedHuntPowerValue()`.

Add to `V2SkillDefinition`:

```ts
/** 출혈 유지형 수인 계보. 전투·표기·성능 점수가 같은 선언을 읽는다. */
bleedHunt?: BleedHuntMechanic;
```

Add `bleedHuntPowerValue(def.bleedHunt)` exactly once inside `skillPowerScore()` before proc/MP normalization. Do not use `spCost` overrides to make unsupported effects expensive.

- [ ] **Step 5: Register all ten skills and five kits**

Use the approved declarations:

```ts
v2c_beastwarrior_reopen: {
  bleedHunt: { minStacks: 5, hitBleedStacks: 1, hitBleedSetTurns: 4 },
},
v2c_beastwarrior_keenscent: {
  passive: {},
  bleedHunt: { minStacks: 5, directPhysicalAccuracyPct: 8 },
},
v2c_tracker_pounce: {
  bleedHunt: { minStacks: 5, skillAccuracyPct: 15, hitEnemyDelayPct: 20 },
},
v2c_tracker_instinct: {
  passive: { statPct: { dex: 12 } },
  bleedHunt: { minStacks: 5, directPhysicalHastePct: 6 },
},
v2c_bloodtracker_trailslash: {
  bleedHunt: { minStacks: 10, hitBleedSetTurns: 4 },
},
v2c_bloodtracker_reading: {
  passive: { statPct: { str: 18 } },
  bleedHunt: { minStacks: 10, directPhysicalPenetrationPct: 8 },
},
v2c_predator_devour: {
  bleedHunt: { minStacks: 10, skillActualDamageHealPct: 14 },
},
v2c_predator_bloodnourishment: {
  passive: { statPct: { str: 12 }, maxHpPct: 12 },
  bleedHunt: { minStacks: 10, bleedTickHealMaxHpPct: 1 },
},
v2c_primalpredator_primalfeast: {
  bleedHunt: { minStacks: 10, skillPenetrationPct: 12, skillActualDamageHealPct: 18, castHastePct: 15 },
},
v2c_primalpredator_apex: {
  passive: { statPct: { str: 24, dex: 18 }, maxHpPct: 16 },
  bleedHunt: {
    minStacks: 10,
    directPhysicalDamagePct: 12,
    directPhysicalHitBleedExtend: { chancePct: 30, turns: 1, maxTurns: 4 },
  },
},
```

Give each active one standard physical `damage` effect using the existing job-tier normalization inferred from `V2_SKILLS_BY_JOB`; keep the definition's catalog tier consistent with neighboring high-job skills. Use no fixed MP or cooldown exception and apply the approved `control`/`payoff`/`balanced` tempo. Add all five job IDs to `ACTIVE_JOB_TEMPO` as `steady`. Tune normal attack coefficients or supported metadata weights until the normalized tests meet the approved ±0.10 ranges; do not change effect semantics.

- [ ] **Step 6: Extend shared descriptions**

Have `describeV2Skill()` iterate `bleedHunt` fields in stable order after normal effects/passives and before MP/SP chips. `SkillEffectChips` then inherits the output with no separate effect map.

- [ ] **Step 7: Run focused tests and verify GREEN**

Run the Step 3 command. Expected: all suites pass and package budgets match the approved targets.

- [ ] **Step 8: Commit**

```bash
git add src/adventure/data/v2/bleedHunt.ts src/adventure/data/v2/bleedHunt.test.ts src/adventure/data/v2/beastkinJobLine.test.ts src/adventure/data/v2/v2Skills.ts src/adventure/data/v2/v2SkillsCommonCatalog.ts src/adventure/data/v2/v2SkillsByJob.ts src/adventure/data/v2/v2SkillsByJob.test.ts src/adventure/data/v2/v2Skills.test.ts
git commit -m "feat: declare beastkin bleed hunt skills"
```

---

### Task 3: Resolve the pre-cast snapshot and generic combat intents

**Files:**

- Create: `src/adventure/v2/combat/bleedHuntCast.test.ts`
- Modify: `src/adventure/v2/combat/combatShared.ts`
- Modify: `src/adventure/v2/combat/combatPatternCast.test.ts`
- Modify: `src/adventure/v2/combat/dotUnify.test.ts`
- Modify: `src/adventure/data/v2/v2Skills.ts`
- Modify: `src/adventure/data/v2/v2SkillsCommonCatalog.ts`
- Modify: `src/adventure/data/v2/v2SkillsByJob.test.ts`

**Interfaces:**

- Extends `V2SkillCastInput.target` with `bleedTurns?: number` and input with `bleedHuntRoll?: number`.
- Extends `V2SkillCastResult` with `skillAccuracyBonusPct`, `healFromActualDamagePct`, and an optional `bleedChangeToApply` intent.
- Produces pure classification and snapshot behavior shared by PvE/PvP.

- [ ] **Step 1: Write failing cast matrix tests**

Build a helper that calls `resolveV2SkillCast()` with a chosen skill, equipped passives, bleed stacks/turns, and deterministic roll. Cover:

- 0, 4, 5, 9, and 10 stacks for every active threshold.
- 4→5 and 9→10 stay on the old snapshot for accuracy, haste, penetration, and damage.
- `상처 덧내기`: at pre-5 returns a zero/one-stack bleed application with 4 turns; pre-4 returns none; pre-10 still refreshes.
- `추격 도약`: +15 accuracy before hit; target delay intent exists but `removeMissedV2SkillTargetEffects()` clears it.
- `추격 본능`: +6 haste on an eligible cast and remains after miss.
- `혈흔 가르기`: zero added stacks and 4 turns only at pre-10.
- `혈흔 감식` + `원시 포식`: 20 penetration points total.
- `포식`/`원시 포식`: generic actual-damage heal percentages 14/18 and cleared on miss.
- `원시 포식` + `추격 본능`: 21 haste before the engine floor and retained on miss.
- `야수의 정점`: +12% direct skill damage; roll `29.999` extends from 2→3 and 3→4, never 4→5; roll `30` does not.

- [ ] **Step 2: Test pure-direct-physical classification**

Export a pure helper operating on resolved cast effects and assert:

```ts
expect(isPureDirectPhysicalSkill(attackWithPhysicalDamage)).toBe(true);
expect(isPureDirectPhysicalSkill(attackWithTwoPhysicalHits)).toBe(true);
expect(isPureDirectPhysicalSkill(attackWithMagicDamage)).toBe(false);
expect(isPureDirectPhysicalSkill(attackWithPhysicalAndMagic)).toBe(false);
expect(isPureDirectPhysicalSkill(healOrBuffOrDotOnly)).toBe(false);
```

Also assert physical specializations (`def`, `vit`, `dex`, `luk`, `all`, `maxHp`) qualify, while `magic` and `spi` do not. A fixed-damage-only effect never qualifies.

- [ ] **Step 3: Run tests and verify RED**

```bash
npm test -- src/adventure/v2/combat/bleedHuntCast.test.ts src/adventure/v2/combat/combatPatternCast.test.ts src/adventure/v2/combat/dotUnify.test.ts
```

Expected: missing input/result fields and no metadata resolution.

- [ ] **Step 4: Take one pre-cast snapshot after variant/synergy resolution**

After `castEffects` is final, compute:

```ts
const pureDirectPhysical = isPureDirectPhysicalSkill(def.category, castEffects);
const bleedSnapshot = {
  stacks: Math.max(0, input.target.bleedStacks ?? 0),
  turns: Math.max(0, input.target.bleedTurns ?? 0),
};
```

Collect the current active skill's `bleedHunt` plus metadata from equipped passive definitions. Apply only declarations whose `minStacks <= bleedSnapshot.stacks`; apply direct-physical fields only when the classifier is true.

- [ ] **Step 5: Apply generic modifiers and result intents**

- Add active/passive penetration to the existing `directDamagePiercePctAdd` path before damage calculation.
- Multiply eligible resolved direct damage and `hitDamages` by `1 + directPhysicalDamagePct / 100` once.
- Sum all qualifying cast/passive haste into `selfHasteToApply.pct`; do not take a max inside the resolver.
- Return conditional accuracy separately as `skillAccuracyBonusPct` for the engine hit check.
- Return `enemyDelayToApply` only as a target effect.
- Return `healFromActualDamagePct` instead of precomputing healing from nominal damage.
- Return a generic intent instead of manufacturing a replacement `V2Dot`:

```ts
bleedChangeToApply?: {
  stacksToAdd: number;
  setTurns?: number;
  extendTurns?: number;
  maxTurns?: number;
  reason: "refresh" | "extend";
};
```

  The engines apply this intent to the existing active bleed entry so its source ATK, flat, coefficient, and maximum stack fields remain byte-identical. For extension, return the intent only when `bleedHuntRoll < chancePct`; the shared application helper clamps stacks to 10 and turns to `maxTurns`.

- [ ] **Step 6: Generalize actual-damage healing without changing nominal drains**

Extend the existing effect union compatibly:

```ts
| { kind: "healFromDamage"; pct: number; basis?: "nominal" | "actual" }
```

The default remains `nominal`, preserving `영혼 수확` and any existing callers. Change only Blood Demon Reign's declaration to `basis: "actual"`; the resolver routes actual-basis percentages to `healFromActualDamagePct` and normal-basis percentages through the current nominal `selfHeal` calculation. Add a catalog regression asserting the Blood Demon declaration and unchanged power score.

- [ ] **Step 7: Make miss removal comprehensive**

Update `v2SkillHasTargetEffects()` and `removeMissedV2SkillTargetEffects()` so delay, `bleedChangeToApply`, and actual-damage healing disappear on miss, while normal-cast haste remains.

- [ ] **Step 8: Run focused and existing shared-combat tests**

Run the Step 3 command. Expected: all pass; existing three-turn bleed and 10-stack cap assertions remain unchanged.

- [ ] **Step 9: Commit**

```bash
git add src/adventure/v2/combat/combatShared.ts src/adventure/v2/combat/bleedHuntCast.test.ts src/adventure/v2/combat/combatPatternCast.test.ts src/adventure/v2/combat/dotUnify.test.ts src/adventure/data/v2/v2Skills.ts src/adventure/data/v2/v2SkillsCommonCatalog.ts src/adventure/data/v2/v2SkillsByJob.test.ts
git commit -m "feat: resolve bleed hunt cast snapshots"
```

---

### Task 4: Apply actual damage healing, dot nourishment, and logs in PvE

**Files:**

- Create: `src/adventure/v2/combat/bleedHuntPve.test.ts`
- Modify: `src/adventure/v2/combat/engine.ts`
- Modify: `src/adventure/v2/combat/engine.dotClock.test.ts`

**Interfaces:**

- Consumes generic cast-result intents from Task 3.
- Supplies target bleed stacks/turns and one deterministic extension roll to the resolver.
- Applies accuracy, actual HP damage healing, ATB changes, dots, and bleed-tick nourishment.

- [ ] **Step 1: Write failing PvE integration tests**

Use deterministic patterns and mocked randomness only at the engine boundary. Assert:

- Conditional +8/+15 accuracy changes the miss threshold only with active 5-stack bleed.
- A miss retains 6/15/21 haste but applies no delay, bleed change, or actual-damage heal.
- 14% and 18% healing use `enemyHpBefore - enemyHpAfter`, cap at player max HP, and produce no heal at zero actual damage or overkill beyond remaining HP.
- Existing Blood Demon Reign still heals its declared percentage from actual damage after generalization.
- A 10-stack player bleed tick that deals actual damage heals max HP 1% exactly once, including the killing tick; 9 stacks, zero damage, or unequipped `피의 양식` does not.
- Refresh/extension logs include the resulting remaining count, e.g. `출혈 지속이 4회로 갱신됐다` or `출혈 지속이 4회로 늘어났다`.
- Default bleed still ticks three times and the 0.45 player coefficient remains unchanged.

- [ ] **Step 2: Run PvE tests and verify RED**

```bash
npm test -- src/adventure/v2/combat/bleedHuntPve.test.ts src/adventure/v2/combat/engine.dotClock.test.ts
```

Expected: resolver context lacks turns/roll, accuracy ignores the result bonus, healing remains Blood-Demon-specific, and nourishment/logging is absent.

- [ ] **Step 3: Supply the exact active bleed snapshot and roll**

Before calling `resolveV2SkillCast()`, derive the one active enemy bleed entry (`turns > 0`) and pass both stacks and turns. Generate `bleedHuntRoll: Math.random() * 100` once in the cast input alongside `procRoll`; reuse the result through any hit/evasion branches.

- [ ] **Step 4: Apply generic hit and actual-damage fields**

Add `result.skillAccuracyBonusPct` beside definition/crossover accuracy. Replace the Blood-Demon-only block with a generic actual-damage calculation:

```ts
const actualSkillDamage = Math.max(0, enemyHpBeforeSkill - nextEnemyHp);
const actualDamageHeal = Math.floor(
  actualSkillDamage * Math.max(0, result.healFromActualDamagePct ?? 0) / 100,
);
```

Blood Demon Reign already reaches this field through Task 3's data-driven `basis: "actual"`; remove its skill-ID branch. Apply the heal after actual damage is known, cap it, and log the actual recovered integer.

- [ ] **Step 5: Heal from 10-stack bleed tick before death return**

In the enemy DoT tick section, snapshot whether the pre-tick active bleed is 10 stacks, distribute actual post-multiplier damage, then if `피의 양식` is equipped and the distributed bleed portion is positive, heal once by `floor(maxHp * 0.01)`. Perform this before returning on enemy death.

- [ ] **Step 6: Apply dot intents and log duration changes**

Apply `bleedChangeToApply` through a shared helper that updates only stacks/turns on the existing bleed entry. Compare before/after and log only when Task 3 marked a refresh or extension, including the resulting `turns`; never log the derived stage every action.

- [ ] **Step 7: Run focused PvE tests and verify GREEN**

Run the Step 2 command. Expected: all pass, including Blood Demon and dot-clock regressions.

- [ ] **Step 8: Commit**

```bash
git add src/adventure/v2/combat/engine.ts src/adventure/v2/combat/bleedHuntPve.test.ts src/adventure/v2/combat/engine.dotClock.test.ts
git commit -m "feat: apply bleed hunt effects in pve"
```

---

### Task 5: Mirror the same mechanics in PvP

**Files:**

- Create: `src/adventure/v2/combat/bleedHuntPvp.test.ts`
- Modify: `src/adventure/v2/combat/engine-pvp.ts`
- Modify: `src/adventure/v2/combat/engine.pvpDamageMultiplier.test.ts`

**Interfaces:**

- Uses the same `V2SkillCastResult` fields as PvE.
- Actual damage includes opponent shield/barrier/HP loss already attributed to the skill, without counting prevented or overkill damage.

- [ ] **Step 1: Write failing PvP parity tests**

For both side A and side B, assert:

- 5/10-stack accuracy, delay, and 6/15/21 haste match PvE semantics.
- +8/+12 penetration adds to 20 and still respects the existing PvP penetration cap.
- +12% damage is applied only to eligible direct physical skills.
- 14%/18% healing uses actual shield + barrier + HP damage, never nominal damage, and caps at max HP.
- Miss/guaranteed evade clears target effects and actual-damage healing while preserving cast haste.
- 10-stack bleed tick nourishment heals the opposite/source side once, before a lethal return.
- Extension roll is once per action even for multihit; default bleed parameters remain unchanged.
- Existing Blood Demon Reign PvP healing remains byte-equivalent.

- [ ] **Step 2: Run tests and verify RED**

```bash
npm test -- src/adventure/v2/combat/bleedHuntPvp.test.ts src/adventure/v2/combat/engine.pvpDamageMultiplier.test.ts
```

Expected: PvP does not yet pass turns/roll or consume the generic result fields.

- [ ] **Step 3: Supply the shared snapshot and deterministic roll**

At the PvP cast site, find the opponent's active bleed entry and pass stacks/turns plus one `bleedHuntRoll`. Do not reroll after evasion or for individual hits.

- [ ] **Step 4: Apply accuracy, delay, haste, and actual-damage healing**

Add `result.skillAccuracyBonusPct` to the current accuracy sum. Use the engine's existing shield/barrier/HP deltas to calculate effective damage, generalize the Blood-Demon block to `healFromActualDamagePct`, and keep all current PvP caps/floors after additive metadata.

- [ ] **Step 5: Apply source-side nourishment on dot processing**

Inside `tickPvPSideDotsOnAction()`, snapshot the target's pre-tick 10-stack bleed. After actual distributed bleed damage is known, heal the other side if that side has `피의 양식` equipped. One target has exactly one opposing source in this 1v1 engine, so no persisted source owner is needed.

- [ ] **Step 6: Reuse the PvE duration-log wording**

Factor a tiny pure log-text helper into `combatShared.ts` if needed rather than duplicating Korean wording. Include the new count and do not emit stage spam.

- [ ] **Step 7: Run focused PvP tests and verify GREEN**

Run the Step 2 command. Expected: all pass, including both attacker directions and the existing multiplier regression.

- [ ] **Step 8: Commit**

```bash
git add src/adventure/v2/combat/combatShared.ts src/adventure/v2/combat/engine-pvp.ts src/adventure/v2/combat/bleedHuntPvp.test.ts src/adventure/v2/combat/engine.pvpDamageMultiplier.test.ts
git commit -m "feat: apply bleed hunt effects in pvp"
```

---

### Task 6: Expose hunt stages and complete skill/roadmap UI coverage

**Files:**

- Modify: `src/adventure/battle/BattleScene.tsx`
- Create: `src/adventure/battle/BattleScene.bleedHunt.test.tsx`
- Modify: `src/adventure/v2/SkillEffectChips.tsx`
- Create: `src/adventure/v2/SkillEffectChips.test.tsx`
- Modify: `src/adventure/v2/V2SkillLearnView.test.tsx`

**Interfaces:**

- Consumes `bleedHuntStage()` and equipped skill definitions.
- Renders no new persisted state and introduces no new `"use client"` boundary.

- [ ] **Step 1: Write failing UI tests**

Render a minimal battle state and assert:

- No stage label at 0–4 stacks.
- No label at any stack count when no equipped definition has `bleedHunt`.
- `추적` at 5–9 and `사냥의 절정` at 10 when at least one such skill is equipped.
- Both stacked and split battle layouts show the same label once.
- Enemy/monster-owned bleed does not create a player hunt stage on the wrong side.

Render `SkillEffectChips`/learn view for representative active and passive skills and assert the metadata chips plus SP are visible without duplicate effect strings.

- [ ] **Step 2: Run UI tests and verify RED**

```bash
npm test -- src/adventure/battle/BattleScene.bleedHunt.test.tsx src/adventure/v2/SkillEffectChips.test.tsx src/adventure/v2/V2SkillLearnView.test.tsx
```

Expected: stage label and new skill assertions are absent.

- [ ] **Step 3: Derive and render the battle stage**

Add a pure local selector or shared data helper:

```ts
const hasBleedHunt = state.v2Skills.equipped.some(
  (id) => V2_SKILLS[id]?.bleedHunt != null,
);
const activeBleedStacks = state.enemyV2Dots
  .filter((dot) => dot.tag === "bleed" && dot.turns > 0)
  .reduce((sum, dot) => sum + dot.stacks, 0);
const huntLabel = hasBleedHunt
  ? bleedHuntStageLabel(bleedHuntStage(activeBleedStacks))
  : null;
```

Render the small status badge next to the existing enemy dot/status area. Reuse `SURFACE_INSET` or the existing opaque status container; do not add `bg-*/40`, whole-card opacity, or another panel.

- [ ] **Step 4: Keep effect chips data-driven**

`SkillEffectChips` should continue to call only `describeV2Skill()`. Make markup changes only if stable keys or wrapping are required by the longer text; do not duplicate bleed-hunt formatting in the component.

- [ ] **Step 5: Run UI tests and verify GREEN**

Run the Step 2 command. Expected: all pass in the existing synchronous client-component test setup.

- [ ] **Step 6: Commit**

```bash
git add src/adventure/battle/BattleScene.tsx src/adventure/battle/BattleScene.bleedHunt.test.tsx src/adventure/v2/SkillEffectChips.tsx src/adventure/v2/SkillEffectChips.test.tsx src/adventure/v2/V2SkillLearnView.test.tsx
git commit -m "feat: show beastkin hunt stages"
```

---

### Task 7: Add deterministic balance simulation and tune within the approved envelope

**Files:**

- Create: `scripts/sim-v2-beastkin-jobs.ts`
- Create: `src/adventure/v2/combat/bleedHuntBalance.test.ts`
- Modify if tuning is required: `src/adventure/data/v2/v2SkillsCommonCatalog.ts`
- Modify if tuning is required: `src/adventure/data/v2/bleedHunt.ts`
- Modify if tuning is required: `src/adventure/data/v2/beastkinJobLine.test.ts`

**Interfaces:**

- Simulation reuses `resolveBattle`, `pickAutoAction`, catalog-derived job stats, equipped skill states, and a seeded PRNG.
- Reports 5/10-stack uptime, damage, effective healing, actions, win rate, and turns.

- [ ] **Step 1: Write the failing deterministic balance contract**

Create a fast Vitest harness around the same exported simulation function used by the CLI. Compare:

- Each Beastkin tier with its complete inherited lineage kit.
- A collection build containing only the current tier's two portable skills.
- Same-tier median physical representatives.
- Tier 6 `primalpredator` against `blooddemon`.
- Short ordinary encounters and a long high-HP boss fixture in PvE; a bounded deterministic PvP duel sample.

Assert results are deterministic for the same seed, finite, and include both uptime metrics. On the long-fight complete-lineage case:

```ts
expect(Math.abs(report.bleed5UptimePct - 55)).toBeLessThan(10);
expect(Math.abs(report.bleed10UptimePct - 30)).toBeLessThan(10);
```

Keep damage/healing comparisons as named envelope constants documented beside the selected baselines; do not snapshot a huge text report.

- [ ] **Step 2: Run the test and verify RED**

```bash
npm test -- src/adventure/v2/combat/bleedHuntBalance.test.ts
```

Expected: simulation module is absent.

- [ ] **Step 3: Implement the seeded simulation**

Follow `scripts/sim-v2-venom-jobs.ts` and `scripts/sim-v2-survivor-jobs.ts`, but export pure `runBeastkinBalance(seed, trials)` before the CLI printing block. Track active bleed stacks/turns at each action boundary and actual recovered HP. The CLI command is:

```bash
node --import tsx scripts/sim-v2-beastkin-jobs.ts
```

Print a compact table per tier/build with SP, win rate, turns, actions, damage, healing, 5-stack uptime, and 10-stack uptime.

- [ ] **Step 4: Run full-size simulation and reconcile assumptions**

```bash
node --import tsx scripts/sim-v2-beastkin-jobs.ts
```

If either long-fight uptime differs by 10 percentage points or more, update the named uptime constants in `bleedHunt.ts`, rerun score/SP derivation, and tune supported effect values or active damage coefficients. Preserve the approved mechanics and no-discount rule. Record the final seed/trial count and baseline envelopes in comments/tests.

- [ ] **Step 5: Re-run balance, catalog, and combat suites**

```bash
npm test -- src/adventure/v2/combat/bleedHuntBalance.test.ts src/adventure/data/v2/bleedHunt.test.ts src/adventure/data/v2/beastkinJobLine.test.ts src/adventure/v2/combat/bleedHuntCast.test.ts src/adventure/v2/combat/bleedHuntPve.test.ts src/adventure/v2/combat/bleedHuntPvp.test.ts
```

Expected: all pass, with final package power/SP still within the approved ranges.

- [ ] **Step 6: Commit**

```bash
git add scripts/sim-v2-beastkin-jobs.ts src/adventure/v2/combat/bleedHuntBalance.test.ts src/adventure/data/v2/v2SkillsCommonCatalog.ts src/adventure/data/v2/bleedHunt.ts src/adventure/data/v2/beastkinJobLine.test.ts
git commit -m "test: validate beastkin lineage balance"
```

If no tuning files changed, stage only the script and balance test.

---

### Task 8: Full regression verification and documentation reconciliation

**Files:**

- Modify only if observed values differ: `docs/superpowers/specs/2026-08-20-beastkin-tier2-tier6-design.md`
- Modify only if implementation paths changed: `docs/superpowers/plans/2026-08-20-beastkin-tier2-tier6.md`

- [ ] **Step 1: Inspect the complete diff and forbidden scope**

```bash
git status --short
git log --oneline --decorate -12
git diff --stat <implementation-base>..HEAD
git diff --check <implementation-base>..HEAD
```

Replace `<implementation-base>` with the commit recorded immediately before Task 1. Confirm there is no migration, dependency, image, route, deploy script, maintenance command, current-job restriction, skill-ID combat branch, or player/monster bleed base-constant change.

- [ ] **Step 2: Run all focused tests together**

```bash
npm test -- src/adventure/data/v2/bleedHunt.test.ts src/adventure/data/v2/beastkinJobLine.test.ts src/adventure/data/v2/v2JobCatalog.test.ts src/adventure/data/v2/proficiency.test.ts src/adventure/data/v2/v2SkillsByJob.test.ts src/adventure/data/v2/v2Skills.test.ts src/adventure/v2/jobRoadmapModel.test.ts src/adventure/v2/jobExplorer.test.ts src/adventure/v2/V2JobLadder.test.tsx src/adventure/v2/V2SkillLearnView.test.tsx src/adventure/v2/SkillEffectChips.test.tsx src/adventure/battle/BattleScene.bleedHunt.test.tsx src/adventure/v2/combat/bleedHuntCast.test.ts src/adventure/v2/combat/bleedHuntPve.test.ts src/adventure/v2/combat/bleedHuntPvp.test.ts src/adventure/v2/combat/bleedHuntBalance.test.ts src/adventure/v2/combat/combatPatternCast.test.ts src/adventure/v2/combat/dotUnify.test.ts src/adventure/v2/combat/engine.dotClock.test.ts src/adventure/v2/combat/engine.pvpDamageMultiplier.test.ts
```

Expected: all pass with no flaky random dependency.

- [ ] **Step 3: Run static checks**

```bash
npx eslint src/adventure/data/v2/bleedHunt.ts src/adventure/data/v2/beastkinJobLine.test.ts src/adventure/data/v2/v2JobCatalog.ts src/adventure/data/v2/proficiency.ts src/adventure/data/v2/v2Skills.ts src/adventure/data/v2/v2SkillsCommonCatalog.ts src/adventure/data/v2/v2SkillsByJob.ts src/adventure/v2/combat/combatShared.ts src/adventure/v2/combat/engine.ts src/adventure/v2/combat/engine-pvp.ts src/adventure/battle/BattleScene.tsx src/adventure/v2/SkillEffectChips.tsx scripts/sim-v2-beastkin-jobs.ts
npx tsc --noEmit
```

Expected: zero errors.

- [ ] **Step 4: Run the complete test suite**

```bash
npm test
```

Expected: all repository tests pass. Do not run `npm run build` merely to verify this feature because its prebuild hooks rewrite image assets; use it only if a later user explicitly requests build/deployment validation.

- [ ] **Step 5: Reconcile documented observed values**

If normalization or simulation tuning changed the exact power, SP, or measured uptime from the approved estimates, update only the observed-results subsection of the authoritative spec while preserving approved mechanics. Re-run `git diff --check`.

- [ ] **Step 6: Commit verification documentation only if changed**

```bash
git add docs/superpowers/specs/2026-08-20-beastkin-tier2-tier6-design.md docs/superpowers/plans/2026-08-20-beastkin-tier2-tier6.md
git commit -m "docs: record beastkin balance verification"
```

Skip this commit when neither document changed. Do not deploy.
