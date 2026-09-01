# Tier 7 Physical Job Balance Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make 무영검신, 멸검제, and 비천무신 clearly outperform their tier-6 prerequisites in 46-SP and 80-SP PvE/PvP comparisons without allowing unrestricted inherited loadouts to explode.

**Architecture:** Keep each job's existing combat identity and redistribute conditional/inherited power into its tier-7 direct attacks. Extend the deterministic simulation harness so catalog values are calibrated against fixed 200-seed outcome ranges, while focused mechanic tests protect trigger ordering and PvP control caps.

**Tech Stack:** TypeScript, Vitest 4, existing V2 ATB/PvP combat engines, deterministic `mulberry32` simulations.

## Global Constraints

- Scope is limited to 무영검신, 멸검제, 비천무신 combat values, their tooltips, and deterministic regression coverage.
- Do not change 태초현자, advancement, SP acquisition, equipment, monsters, or deployment configuration.
- Tier-7 core packages remain exactly 46 SP.
- Core PvE long damage target: 1.10–1.15 times the strongest prerequisite core package.
- Core PvP damage target: 1.05–1.10 times the strongest prerequisite core package.
- A representative tier-7 inherited build at or below 80 SP must be at least 1.25 times its prerequisite comparison in PvE long combat.
- Unrestricted full-lineage results remain diagnostic because additional active candidates dilute the prerequisite baseline.
- Keep 비천무신 PvP enemy delay at 10% and self haste at 10%.
- Keep 멸검 charge/release sequencing and 무영검신 shadow release sequencing unchanged.
- Do not deploy without a separate explicit request.

---

### Task 1: Extend sword-line deterministic balance coverage

**Files:**
- Modify: `scripts/sim-v2-tier7-sword-line.ts`
- Modify: `src/adventure/v2/combat/tier7SwordLineBalanceSim.test.ts`
- Modify: `scripts/fixtures/tier7-sword-line-legacy-baseline.json`

**Interfaces:**
- Consumes: `runTier7SwordLineBalance({ seeds, seedBase })` and existing `V2_SKILLS_BY_JOB` packages.
- Produces: reports for prerequisite cores, tier-7 cores, at-most-80-SP inherited builds, and full-lineage safety builds; adds `shadowCoreToPrerequisitePvp`, `ruinCoreToPrerequisitePvp`, and full-lineage ratios.

- [ ] **Step 1: Write failing outcome tests**

Update the balance assertions so they require:

```ts
expect(report.ratios.shadowCoreToPrerequisiteLong).toBeGreaterThanOrEqual(1.1);
expect(report.ratios.shadowCoreToPrerequisiteLong).toBeLessThanOrEqual(1.15);
expect(report.ratios.shadowCoreToPrerequisitePvp).toBeGreaterThanOrEqual(1.05);
expect(report.ratios.shadowCoreToPrerequisitePvp).toBeLessThanOrEqual(1.1);
expect(report.ratios.ruinCoreToPrerequisiteLong).toBeGreaterThanOrEqual(1.1);
expect(report.ratios.ruinCoreToPrerequisiteLong).toBeLessThanOrEqual(1.15);
expect(report.ratios.ruinLowToRuinNormal).toBeGreaterThanOrEqual(1.2);
expect(report.ratios.ruinLowToRuinNormal).toBeLessThanOrEqual(1.35);
expect(report.ratios.shadowBudgetToPrerequisiteLong).toBeGreaterThanOrEqual(1.25);
expect(report.ratios.shadowBudgetToPrerequisiteLong).toBeLessThanOrEqual(1.35);
expect(report.ratios.ruinBudgetToPrerequisiteLong).toBeGreaterThanOrEqual(1.25);
expect(report.ratios.ruinBudgetToPrerequisiteLong).toBeLessThanOrEqual(1.35);
expect(report.ratios.shadowFullToPrerequisiteLong).toBeLessThanOrEqual(1.8);
expect(report.ratios.shadowFullToPrerequisitePvp).toBeLessThanOrEqual(1.6);
expect(report.ratios.ruinFullToPrerequisiteLong).toBeLessThanOrEqual(1.8);
expect(report.ratios.ruinFullToPrerequisitePvp).toBeLessThanOrEqual(1.6);
```

- [ ] **Step 2: Run the test and confirm the old balance fails**

Run:

```bash
NEXT_PUBLIC_V2_CORE_LOOP_V2=true NEXT_PUBLIC_V2_ATB_SKILLS=true NEXT_PUBLIC_V2_SKILL_PROC_IN_PATTERN=true npx vitest run src/adventure/v2/combat/tier7SwordLineBalanceSim.test.ts
```

Expected: FAIL on 무영검신 PvP, 멸검제 normal-health PvE, and the new missing report fields.

- [ ] **Step 3: Add the missing build definitions and report fields**

Add `blackmoon-core`, `hegemon-core`, prerequisite-combined, 80-SP, and full-lineage build definitions. Calculate every comparison against the stronger prerequisite result rather than always against 검성. Retain the fixed seed base `20_260_829`, 12/80 action cases, 35% HP low case, and the existing PvP defender fixture.

For 80-SP builds, enumerate the six prerequisite skills, retain subsets whose `spCostOf` total fits the remaining 34 SP, and select the subset with the highest 200-seed PvE-long mean. Store the selected skill IDs in the report so the test output explains the winning build.

- [ ] **Step 4: Run the extended test and capture the red baseline**

Run the command from Step 2. Expected: report construction passes, target ranges still fail under current catalog values.

- [ ] **Step 5: Commit the test harness**

```bash
git add scripts/sim-v2-tier7-sword-line.ts src/adventure/v2/combat/tier7SwordLineBalanceSim.test.ts scripts/fixtures/tier7-sword-line-legacy-baseline.json
git commit -m "test: define tier 7 sword balance targets"
```

### Task 2: Rebalance 무영검신 and 멸검제

**Files:**
- Modify: `src/adventure/data/v2/v2Skills.ts`
- Modify: `src/adventure/data/v2/v2SkillsCommonCatalog.ts`
- Modify: `src/adventure/data/v2/tier7SkillMechanics.test.ts`
- Modify: `src/adventure/v2/combat/atbSkillCastPvp.test.ts`
- Modify: `src/adventure/v2/combat/tier7SwordLineBalanceSim.test.ts`

**Interfaces:**
- Consumes: sword-line target report from Task 1.
- Produces: calibrated shadow/ruin catalog values; keeps existing `shadowStrike`, `shadowCore`, `intentStrike`, `intentCore`, and `chargedFinisher` kinds.

- [ ] **Step 1: Freeze the intended redistribution in failing catalog tests**

Assert that 무영검신 can use independent PvP direct and shadow-record scales, and that 멸검제 has a stronger unconditional 극한일격 with a lower missing-HP cap. Start calibration with these values:

```ts
expect(afterimage.tier7Mechanic).toMatchObject({ pvpDirectDamagePct: 100 });
expect(traceless.tier7Mechanic).toMatchObject({ pvpDirectDamagePct: 100 });
expect(swordshadow.tier7Mechanic).toMatchObject({
  inheritedRecordPct: 10,
  pvpScalePct: 100,
});
expect(limitstrike.effects[0]).toMatchObject({ kind: "damage", statCoef: 6.75 });
expect(limitstrike.tier7Mechanic).toMatchObject({
  missingHpBonusCapPct: 25,
  pvpDirectDamagePct: 55,
});
expect(ruinsword.tier7Mechanic).toMatchObject({ pvpDirectDamagePct: 65 });
```

- [ ] **Step 2: Run focused tests and confirm failure**

Run:

```bash
npx vitest run src/adventure/data/v2/tier7SkillMechanics.test.ts src/adventure/v2/combat/atbSkillCastPvp.test.ts
```

Expected: FAIL because the catalog still contains the old PvP scales, inherited record, coefficient, and missing-HP cap.

- [ ] **Step 3: Apply the initial catalog redistribution**

Change only the values asserted in Step 1. Preserve all SP costs, proc chances, hit counts, intent-stack requirements, charge timing, record timing, penetration caps, and action acceleration.

- [ ] **Step 4: Calibrate against the 200-seed target test**

Run the Task 1 balance test. Adjust only these knobs until every sword-line target passes:

- 무영검신: `pvpDirectDamagePct`, `pvpScalePct`, `inheritedRecordPct`.
- 멸검제: 극한일격 `statCoef`, `missingHpBonusCapPct`, 극한일격 `pvpDirectDamagePct`, 멸검 `pvpDirectDamagePct`.

Use ratio correction for each next iteration: `next = current × targetMidpoint / measuredRatio`, rounded to three decimals for damage coefficients and two decimals for percentages. Use midpoint 1.125 for PvE core, 1.075 for PvP core, 1.275 for 80-SP builds, and the nearest allowed bound for safety caps.

- [ ] **Step 5: Run mechanic and balance tests**

```bash
npx vitest run src/adventure/data/v2/tier7SkillMechanics.test.ts src/adventure/v2/combat/atbSkillCast.test.ts src/adventure/v2/combat/atbSkillCastPvp.test.ts src/adventure/v2/combat/tier7SwordLineBalanceSim.test.ts
```

Expected: PASS with unchanged trigger-order tests and all new result bands.

- [ ] **Step 6: Commit the sword-line balance**

```bash
git add src/adventure/data/v2/v2Skills.ts src/adventure/data/v2/v2SkillsCommonCatalog.ts src/adventure/data/v2/tier7SkillMechanics.test.ts src/adventure/v2/combat/atbSkillCastPvp.test.ts src/adventure/v2/combat/tier7SwordLineBalanceSim.test.ts scripts/sim-v2-tier7-sword-line.ts scripts/fixtures/tier7-sword-line-legacy-baseline.json
git commit -m "balance: strengthen tier 7 sword jobs"
```

### Task 3: Add 비천무신 deterministic balance coverage

**Files:**
- Create: `scripts/sim-v2-tier7-sky-line.ts`
- Create: `src/adventure/v2/combat/tier7SkyLineBalanceSim.test.ts`
- Create: `scripts/fixtures/tier7-sky-line-baseline.json`

**Interfaces:**
- Consumes: the deterministic runner conventions from `sim-v2-tier7-sword-line.ts`, `V2_SKILLS_BY_JOB.heavenlybow`, `celestialdragon`, and `skyascendant`.
- Produces: `runTier7SkyLineBalance({ seeds, seedBase })` with core, 80-SP, full-lineage, first-action, and selected-build fields.

- [ ] **Step 1: Write the failing sky-line target test**

Require core PvE 1.10–1.15, core PvP 1.05–1.10, 80-SP PvE 1.25–1.35, full PvE at most 1.8, full PvP at most 1.6, and PvP cross-control values of 10% delay/10% haste. Require 200 samples for every final scenario.

- [ ] **Step 2: Run the new test and confirm module failure**

```bash
NEXT_PUBLIC_V2_CORE_LOOP_V2=true NEXT_PUBLIC_V2_ATB_SKILLS=true NEXT_PUBLIC_V2_SKILL_PROC_IN_PATTERN=true npx vitest run src/adventure/v2/combat/tier7SkyLineBalanceSim.test.ts
```

Expected: FAIL because `sim-v2-tier7-sky-line.ts` does not exist.

- [ ] **Step 3: Implement the deterministic sky runner**

Use level 100 with DEX 60%, STR 30%, VIT 10%, seed base `20_260_829`, the same dummy and PvP defender shape as the sword runner, and the same 12/80 action scenarios. Enumerate prerequisite subsets under the remaining 34 SP for the tier-7 80-SP build and report the winning IDs.

- [ ] **Step 4: Run the test and capture current balance failures**

Expected: current 비천무신 core remains below 천룡권성 and full inheritance exceeds at least one safety cap.

- [ ] **Step 5: Commit the sky simulation**

```bash
git add scripts/sim-v2-tier7-sky-line.ts scripts/fixtures/tier7-sky-line-baseline.json src/adventure/v2/combat/tier7SkyLineBalanceSim.test.ts
git commit -m "test: define sky ascendant balance targets"
```

### Task 4: Rebalance 비천무신 direct and inherited crossover damage

**Files:**
- Modify: `src/adventure/data/v2/v2Skills.ts`
- Modify: `src/adventure/data/v2/v2SkillsCommonCatalog.ts`
- Modify: `src/adventure/data/v2/tier7SkillMechanics.ts`
- Modify: `src/adventure/data/v2/tier7SkillMechanics.test.ts`
- Modify: `src/adventure/v2/combat/skyAscendantCombat.ts`
- Modify: `src/adventure/v2/combat/atbSkillCast.test.ts`
- Modify: `src/adventure/v2/combat/atbSkillCastPvp.test.ts`

**Interfaces:**
- Consumes: `crossStrike` family and `crossCore` mechanics.
- Produces: `crossCore.inheritedCaptureDamagePct`, `inheritedPursuitDamagePct`, `pvpInheritedCaptureDamagePct`, and `pvpInheritedPursuitDamagePct`; applies them only when the triggering skill is not a skyascendant-owned skill.

- [ ] **Step 1: Write failing catalog and combat tests**

Start direct-damage calibration at:

```ts
expect(fallingstar.effects[0]).toMatchObject({ statCoef: 2.9 });
expect(voidbreak.effects).toMatchObject([
  { statCoef: 0.56 },
  { statCoef: 0.56 },
  { statCoef: 0.56 },
  { statCoef: 1.12 },
]);
expect(crossover.tier7Mechanic).toMatchObject({
  captureDamagePct: 10,
  pursuitDamagePct: 20,
  inheritedCaptureDamagePct: 5,
  inheritedPursuitDamagePct: 10,
  pvpCaptureDamagePct: 8,
  pvpPursuitDamagePct: 15,
  pvpInheritedCaptureDamagePct: 4,
  pvpInheritedPursuitDamagePct: 8,
  pvpPursuitEnemyDelayPct: 10,
  pvpHastePct: 10,
});
```

Add combat cases proving 낙성/파공 use the core percentages while 천궁궤적/천룡난무 use the inherited percentages.

- [ ] **Step 2: Run focused tests and confirm failure**

```bash
npx vitest run src/adventure/data/v2/tier7SkillMechanics.test.ts src/adventure/v2/combat/atbSkillCast.test.ts src/adventure/v2/combat/atbSkillCastPvp.test.ts
```

- [ ] **Step 3: Extend the mechanic type and runtime selection**

Add the four inherited fields to the `crossCore` mechanic type and resolved mechanic. In the PvE and PvP cast paths, determine ownership from `V2_SKILLS_BY_JOB.skyascendant.includes(skillId)` and select core or inherited capture/pursuit damage. Do not branch haste, accuracy, penetration, or enemy delay.

- [ ] **Step 4: Apply and calibrate catalog values**

Apply the initial values from Step 1, then run the 200-seed sky test. Adjust only 낙성/파공 raw `statCoef` values and the eight core/inherited PvE/PvP damage percentages. Preserve the 1:1:1:2 hit ratio by changing the first three coefficients together and keeping the fourth exactly double.

Use midpoint ratio correction as in Task 2 and stop once every core, 80-SP, and full-lineage range passes.

- [ ] **Step 5: Run sky mechanic and balance tests**

```bash
npx vitest run src/adventure/data/v2/tier7SkillMechanics.test.ts src/adventure/v2/combat/atbSkillCast.test.ts src/adventure/v2/combat/atbSkillCastPvp.test.ts src/adventure/v2/combat/tier7SkyLineBalanceSim.test.ts
```

- [ ] **Step 6: Commit the sky balance**

```bash
git add scripts/sim-v2-tier7-sky-line.ts scripts/fixtures/tier7-sky-line-baseline.json src/adventure/data/v2/v2Skills.ts src/adventure/data/v2/v2SkillsCommonCatalog.ts src/adventure/data/v2/tier7SkillMechanics.ts src/adventure/data/v2/tier7SkillMechanics.test.ts src/adventure/v2/combat/skyAscendantCombat.ts src/adventure/v2/combat/atbSkillCast.test.ts src/adventure/v2/combat/atbSkillCastPvp.test.ts src/adventure/v2/combat/tier7SkyLineBalanceSim.test.ts
git commit -m "balance: strengthen sky ascendant"
```

### Task 5: Align tooltips, manuals, and final verification

**Files:**
- Modify: `src/adventure/data/v2/v2Skills.ts`
- Modify: `src/adventure/data/v2/v2Skills.test.ts`
- Modify: `src/app/manual/content/skills.tsx`
- Modify: `src/app/manual/current-content.test.tsx`
- Modify: `docs/patch-notes/2026-09-02-tier7-physical-job-balance.md`

**Interfaces:**
- Consumes: final calibrated catalog and mechanic values from Tasks 2 and 4.
- Produces: player-facing formulas that match runtime and a concise undeployed patch note.

- [ ] **Step 1: Write failing tooltip tests**

Assert that pure STR skills show both attack and strength terms, LUK/DEX skills show the 1.15-adjusted direct stat coefficient, multi-hit skills identify hit count and total structure, and PvP-specific shadow/crossover percentages appear when they differ from PvE.

- [ ] **Step 2: Run tooltip tests and confirm failure**

```bash
npx vitest run src/adventure/data/v2/v2Skills.test.ts src/app/manual/current-content.test.tsx
```

- [ ] **Step 3: Render the final formulas from catalog mechanics**

Extend `describeV2Skill` rather than duplicating combat numbers in prose. Render core and inherited crossover damage separately, preserve Korean labels `검영`, `검의`, `멸검`, `포착`, and `추격`, and list PvP values on the same mechanic line.

- [ ] **Step 4: Add the undeployed patch note**

Document the three jobs' redistribution, the 46/80-SP target bands, the unchanged control/trigger rules, and that the change has not been deployed.

- [ ] **Step 5: Run focused and broad verification**

```bash
npx vitest run src/adventure/data/v2/tier7SkillMechanics.test.ts src/adventure/data/v2/v2Skills.test.ts src/adventure/v2/combat/atbSkillCast.test.ts src/adventure/v2/combat/atbSkillCastPvp.test.ts src/adventure/v2/combat/tier7SwordLineBalanceSim.test.ts src/adventure/v2/combat/tier7SkyLineBalanceSim.test.ts src/app/manual/current-content.test.tsx
npx tsc --noEmit
git diff --check
```

Expected: all selected tests pass, TypeScript reports no errors, and `git diff --check` prints nothing.

- [ ] **Step 6: Commit the player-facing alignment**

```bash
git add src/adventure/data/v2/v2Skills.ts src/adventure/data/v2/v2Skills.test.ts src/app/manual/content/skills.tsx src/app/manual/current-content.test.tsx docs/patch-notes/2026-09-02-tier7-physical-job-balance.md
git commit -m "docs: explain tier 7 physical balance"
```
