# Duelist Basic-Attack Job Line Implementation Plan

> **For Codex:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add the tier 3–6 결투가 job line, its linked declaration buffs and basic-attack passives, and make the resulting stance behave identically in PvE and PvP without changing global skill or critical-hit formulas.

**Architecture:** Put job/skill definitions in the existing v2 catalogues, then introduce one pure `duelistCombat` module that owns stance eligibility, declaration priority/composition, basic-hit modifiers, buff consumption, and UI summaries. Persist only optional combat snapshot fields on `PlayerCombat`/battle state so old saves and replays retain zero-value behavior. Both PvE and PvP basic-attack paths call the same pure resolution helpers; active-skill selection filters lower declarations before either engine evaluates combat patterns.

**Tech Stack:** TypeScript, Next.js App Router, React, Vitest, Testing Library

---

### Task 1: Register the four-job lineage and storage mappings

**Files:**
- Modify: `src/adventure/data/v2/v2JobCatalog.ts`
- Modify: `src/adventure/data/v2/v2SkillsByJob.ts`
- Modify: `src/adventure/data/classes.ts` or the actual legacy class/spec mapping module found by `rg`
- Test: `src/adventure/data/v2/duelistJobLine.test.ts`
- Test: existing class/job mapping test beside the mapping module

- [ ] Write catalogue assertions for IDs, Korean names, tiers, prerequisites, cultivation profiles, and current-job bonuses.
- [ ] Write storage round-trip assertions proving all four jobs map to the warrior class and recover the same v2 job ID/name.
- [ ] Run the focused tests and confirm the new IDs fail before implementation.
- [ ] Add `duelist`, `contender`, `undefeated`, and `grandchampion` to the job catalogue using the approved values and existing tier unlock constants.
- [ ] Add legacy class/spec and display mappings without altering existing IDs.
- [ ] Add two skill IDs per job to `V2_SKILLS_BY_JOB`, then rerun the focused tests.
- [ ] Commit only the Task 1 files.

### Task 2: Define declaration and passive skill data

**Files:**
- Modify: `src/adventure/data/v2/v2Skills.ts`
- Modify: `src/adventure/data/v2/v2SkillsCommonCatalog.ts`
- Modify: `src/adventure/data/v2/v2SkillsByJob.ts`
- Test: `src/adventure/data/v2/duelistSkills.test.ts`
- Test: `src/adventure/data/v2/v2Skills.test.ts`

- [ ] Add failing catalogue tests for the four non-damaging `buff` declarations, their MP/cooldown/tier values, and the four passive skills.
- [ ] Add failing tests for passive aggregation: STR/LUK/DEX +8%, basic-only penetration +10%p, crit-haste flag, and basic crit cap 85%.
- [ ] Extend the passive effect type only with basic-attack-specific fields; keep general attack/skill fields unchanged.
- [ ] Add all eight skill definitions using normal learning/SP conventions and exact approved names/effects.
- [ ] Wire each pair to its job and run the focused catalogue/aggregation tests.
- [ ] Commit only the Task 2 files.

### Task 3: Build pure stance and declaration helpers

**Files:**
- Create: `src/adventure/v2/combat/duelistCombat.ts`
- Test: `src/adventure/v2/combat/duelistCombat.test.ts`
- Modify: `src/adventure/data/v2/v2Skills.ts`
- Test: `src/adventure/data/v2/v2Skills.test.ts`
- Test: `src/adventure/v2/combat/combatPatternCast.test.ts`

- [ ] Write table-driven failing tests for tier stance multipliers and every legal/blocking v2 skill category.
- [ ] Identify AP skill IDs/effects from `apSkills.ts`, then write failing tests showing basic-attack helpers are legal while direct-damage transformations block the stance.
- [ ] Write failing declaration tests for highest-equipped selection, sparse lower-skill composition, inherited duration, composed preview text, and replacement state.
- [ ] Write pattern tests proving lower declarations are removed even when explicitly targeted and there is no cooldown fallback.
- [ ] Implement exported constants/types and pure helpers for stance eligibility, declaration ranking/composition, basic-hit state consumption, ramp reset, and display summaries.
- [ ] Update smart-default construction and engine-facing candidate filtering to nominate only the highest equipped declaration and only while its shared buff is inactive.
- [ ] Run the focused helper and pattern tests, then commit Task 3.

### Task 4: Snapshot loadout-derived combat values

**Files:**
- Modify: `src/lib/server/derivePlayerCombatV2.ts`
- Modify: `src/adventure/v2/combat/engineState.ts`
- Modify: `src/adventure/data/v2/replayPayload.ts`
- Test: `src/lib/server/derivePlayerCombatV2.test.ts` or create `src/lib/server/derivePlayerCombatV2.duelist.test.ts`
- Test: replay payload tests beside `replayPayload.ts`

- [ ] Write failing derive tests for each tier with legal loadouts, attack-skill blocking, permitted declarations/passives/heals, and the approved AP allow/block cases.
- [ ] Write failing tests showing passives remain usable by other jobs but stance multipliers do not.
- [ ] Add optional `PlayerCombat` snapshot fields for stance, basic penetration, crit-haste, and basic crit cap; derive them from current job plus equipped v2/AP skills.
- [ ] Add optional battle-state declaration and one-shot haste fields with safe defaults in initial-state creation and replay serialization/parsing.
- [ ] Confirm old payloads without the fields produce byte-compatible zero/inactive behavior in focused replay tests.
- [ ] Commit Task 4.

### Task 5: Apply linked declarations and shared basic-hit math in PvE

**Files:**
- Modify: `src/adventure/v2/combat/engine.ts`
- Modify: `src/adventure/v2/combat/engine.playerPhase.ts`
- Modify: `src/adventure/v2/combat/engine.damageHelpers.ts`
- Test: `src/adventure/v2/combat/duelistPve.test.ts`

- [ ] Write failing cast tests proving a declaration deals no direct damage, spends MP, starts cooldown, composes equipped lower effects, replaces an old declaration, and logs one `[계보 연계 N단계]` entry.
- [ ] Write failing damage-order tests for stance after defense, declaration fixed/ramp bonuses, and combined 10%/15% penetration.
- [ ] Write failing critical tests for normal 75%, passive 85%, buff 95%, overflow conversion from the unchanged 75% threshold, and +0.25 critical multiplier.
- [ ] Write failing consumption tests for every ordinary/extra basic hit, and non-consumption by skills/counters/reflection/DoT.
- [ ] Write failing interruption tests showing skills/potions keep remaining hits but reset ramp, and recast replaces instead of stacking.
- [ ] Initialize/replace the shared declaration state during a successful declaration cast.
- [ ] Route PvE ordinary and extra attacks through the shared basic-hit resolver, then consume one charge per actual basic attack.
- [ ] Preserve all unrelated attack, skill, counter, reflect, and DoT paths.
- [ ] Run the focused PvE suite and existing basic/critical/extra-hit tests, then commit Task 5.

### Task 6: Mirror the rules in PvP and ATB scheduling

**Files:**
- Modify: `src/adventure/v2/combat/engine-pvp.ts`
- Modify: `src/adventure/v2/combat/engine.pvpPhase.ts`
- Modify: `src/adventure/v2/combat/engine.atb.ts`
- Test: `src/adventure/v2/combat/duelistPvp.test.ts`
- Test: `src/adventure/v2/combat/combatPvpAtb.test.ts`

- [ ] Add a PvE/PvP mirror table for stance, penetration, ramp, crit cap, overflow, and declaration consumption.
- [ ] Add failing tests that a basic critical hit with 승자의 박자 advances only the next scheduled action by 8%, cannot stack, and is consumed once.
- [ ] Apply the same declaration cast and basic-hit helper in both PvP sides.
- [ ] Apply the one-shot interval multiplier when ATB schedules the next action, then clear it.
- [ ] Run focused PvP/ATB tests plus existing PvP critical and damage-multiplier suites, then commit Task 6.

### Task 7: Expose stance, linkage, preview, and combat status in the UI

**Files:**
- Modify: `src/adventure/v2/V2LoadoutPanel.tsx`
- Modify: `src/adventure/v2/V2SkillLearnView.tsx`
- Modify: `src/adventure/v2/V2CombatPatternView.tsx`
- Modify: `src/adventure/battle/BattleScene.tsx`
- Modify: `src/adventure/battle/BattleLogList.tsx` only if current generic info rendering cannot display the new log cleanly
- Test: `src/adventure/v2/V2LoadoutPanel.test.tsx`
- Test: relevant combat-pattern and battle-scene/list component tests

- [ ] Write failing component tests for `결투 태세 활성`, an exact blocking attack-skill name, lower declaration linkage text, and the highest declaration's composed effects/hit count.
- [ ] Write a failing battle-status test for declaration name, remaining basic hits, and current momentum stage.
- [ ] Pass the current job/loadout snapshot into the existing loadout panel and render status with existing opaque surface constants/classes.
- [ ] Render linkage and composition previews from the same pure helper used by combat.
- [ ] Render live declaration state in the existing battle status area; retain the generic battle-log flow.
- [ ] Run the focused component tests and commit Task 7.

### Task 8: Balance regression and final verification

**Files:**
- Create or modify: focused simulation test/script in the existing combat balance simulation location discovered by `rg`
- Modify: implementation files only if measured constants need adjustment within the approved tuning levers

- [ ] Add deterministic simulations for basic-damage share, same-tier kill time, stance-on versus attack-skill stance-off, monotonic LUK/DEX/critical-damage investment, equal-tier tank one-hit safety, defense sensitivity, and representative PvP matchups.
- [ ] Run the simulation and adjust only stance multipliers, declaration values, or hit counts if acceptance thresholds fail; document any approved-value deviation in the design spec before changing it.
- [ ] Run focused new tests, then existing job/skill/combat/UI golden tests.
- [ ] Run `npm test -- --run` (or the repository's non-watch equivalent), `npx tsc --noEmit`, and `npm run build` only after confirming the build does not deploy.
- [ ] Inspect `git diff --check`, `git status --short`, and the staged diff; exclude the pre-existing co-op/NUL/_workspace changes.
- [ ] Commit the verified implementation and report tests, commit IDs, and any remaining balance observations without deploying.
