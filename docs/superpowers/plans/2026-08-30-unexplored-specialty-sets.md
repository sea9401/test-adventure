# Unexplored Specialty Sets Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add four three-piece Lv.20~22 unexplored specialty crafting sets whose twelve 6.5T items consume upper-pool materials through the existing guild workshop.

**Architecture:** Extend the tier-16 equipment catalogue and tag-set catalogue with data-only items and existing signature effects. Add a reusable specialty recipe builder to the guild workshop catalogue, including a recipe-level gold override, while preserving the existing transaction, masterwork, quality, record, and UI paths. No new API route, save shape, screen, image, or combat mechanic is introduced.

**Tech Stack:** TypeScript, React 19, Next.js repository conventions, Vitest, existing v2 equipment/combat and guild workshop catalogues.

## Global Constraints

- Do not deploy or change runtime feature flags.
- Preserve unrelated dirty-worktree files and commit only files in this plan.
- All twelve items use internal tier 16, display 6T, `craftOnly: true`, and no item-level signature.
- Reuse only existing tag-set signatures: `on_dodge`, `every_n_hits`, `on_hit`, `battle_start`, `on_hit_taken`, and `on_skill_cast`.
- Normal crafting costs 600 production resources, sunstone 6, aurora crystal 6, abyssal starsteel 2, and 500,000G; masterwork doubles every resource, material, and gold cost.
- Every recipe requires smithy Lv.5 and blacksmith Lv.20, 21, or 22 exactly as specified.
- Follow TDD: add each behavioral test, run it red for the missing feature, then add the minimum production change and run it green.

---

### Task 1: Equipment catalogue and four tag sets

**Files:**
- Modify: `src/adventure/data/v2/v2Equipment.test.ts`
- Modify: `src/adventure/data/v2/v2EquipmentCatalog.ts`
- Modify: `src/adventure/data/v2/v2Equipment.ts`

**Interfaces:**
- Produces equipment IDs: `v2_unexplored_overheat_tracking_gloves`, `v2_unexplored_shadow_leap_boots`, `v2_unexplored_orbit_calculation_ring`, `v2_unexplored_toxic_blood_erosion_armor`, `v2_unexplored_coagulated_gauntlets`, `v2_unexplored_lord_pulse_ring`, `v2_unexplored_colossus_wall_armor`, `v2_unexplored_frostbreaker_boots`, `v2_unexplored_icewall_core_necklace`, `v2_unexplored_deep_alchemy_staff`, `v2_unexplored_mana_cycle_robe`, `v2_unexplored_abyss_catalyst_ring`.
- Produces tag-set IDs: `unexplored_tracking`, `unexplored_toxic_blood`, `unexplored_glacial_guard`, `unexplored_deep_arcane`.
- Consumed later by `GUILD_WORKSHOP_RECIPES` and the existing item-card tag-set renderer.

- [x] **Step 1: Add a failing catalogue contract test**

  Add one table-driven test to `v2Equipment.test.ts` with hand-written literal expectations for all twelve runtime-scaled items. Assert each item’s ID, slot, concept, final power, exact options, tier 16, `craftOnly: true`, one expected set tag, and absent item signature. Assert the deep alchemy staff has `weaponType: "staff"`; all other items have no weapon type.

  The literal runtime targets are:

  ```ts
  const expected = {
    v2_unexplored_overheat_tracking_gloves: ["gloves", "light", 86, { hp: 180, crit: 17, critMult: 65, eva: 10, spd: 10, accuracy: 12 }, "unexplored_tracking"],
    v2_unexplored_shadow_leap_boots: ["boots", "light", 80, { hp: 180, crit: 8, eva: 20, spd: 28, accuracy: 12 }, "unexplored_tracking"],
    v2_unexplored_orbit_calculation_ring: ["ring", "luck", 136, { hp: 160, crit: 13, critMult: 85, eva: 8, spd: 10, accuracy: 16 }, "unexplored_tracking"],
    v2_unexplored_toxic_blood_erosion_armor: ["armor", "light", 255, { hp: 850, magicDef: 55, statusDamageReductionPct: 15 }, "unexplored_toxic_blood"],
    v2_unexplored_coagulated_gauntlets: ["gloves", "light", 86, { hp: 220, crit: 14, critMult: 50, spd: 8, accuracy: 10 }, "unexplored_toxic_blood"],
    v2_unexplored_lord_pulse_ring: ["ring", "luck", 136, { hp: 300, crit: 12, critMult: 65, magicDef: 30, spd: 6, statusDamageReductionPct: 8 }, "unexplored_toxic_blood"],
    v2_unexplored_colossus_wall_armor: ["armor", "heavy", 280, { hp: 1_350, def: 140, magicDef: 70, critResist: 15, spd: -10 }, "unexplored_glacial_guard"],
    v2_unexplored_frostbreaker_boots: ["boots", "light", 88, { hp: 450, def: 65, magicDef: 45, critResist: 10, spd: -6 }, "unexplored_glacial_guard"],
    v2_unexplored_icewall_core_necklace: ["necklace", "mana", 160, { hp: 500, mp: 160, def: 60, magicDef: 120, critResist: 12, statusDamageReductionPct: 10 }, "unexplored_glacial_guard"],
    v2_unexplored_deep_alchemy_staff: ["weapon", "int", 710, { mp: 460, crit: 12, critMult: 50, spd: 8, accuracy: 14 }, "unexplored_deep_arcane", "staff"],
    v2_unexplored_mana_cycle_robe: ["armor", "light", 255, { hp: 700, mp: 400, magicDef: 115, crit: 8, statusDamageReductionPct: 10 }, "unexplored_deep_arcane"],
    v2_unexplored_abyss_catalyst_ring: ["ring", "luck", 138, { mp: 300, magicDef: 40, crit: 14, critMult: 70, spd: 10, accuracy: 8 }, "unexplored_deep_arcane"],
  } as const;
  ```

- [x] **Step 2: Add failing exact tag-set expectations**

  In the same test, assert each set has exactly three catalogue pieces with three distinct slots and exact `[2, 3]` thresholds. Use literal expected threshold objects:

  ```ts
  const expectedSets = {
    unexplored_tracking: [
      { count: 2, bonus: { crit: 4, eva: 5, spd: 5 }, signature: { trigger: "on_dodge", label: "암영 가속", spdBuffPct: 20, buffActions: 2 } },
      { count: 3, bonus: { accuracy: 12, critMult: 40 }, signature: { trigger: "every_n_hits", label: "추적 연쇄", everyNHits: 4 } },
    ],
    unexplored_toxic_blood: [
      { count: 2, bonus: { hp: 200, crit: 3, statusDamageReductionPct: 5 }, signature: { trigger: "on_hit", label: "군락독", poisonChancePct: 15, poisonStacks: 1 } },
      { count: 3, bonus: { crit: 4, critMult: 40, spd: 5 }, signature: { trigger: "on_hit", label: "혈흔 개방", bleedChancePct: 20, bleedStacks: 1 } },
    ],
    unexplored_glacial_guard: [
      { count: 2, bonus: { hp: 300, def: 30, magicDef: 25 }, signature: { trigger: "battle_start", label: "빙벽 전개", battleStartShieldPctMaxHp: 8 } },
      { count: 3, bonus: { hp: 450, def: 55, magicDef: 45, critResist: 10 }, signature: { trigger: "on_hit_taken", label: "거수 압축", defGainOnHitPct: 3 } },
    ],
    unexplored_deep_arcane: [
      { count: 2, bonus: { mp: 180, crit: 4 }, signature: { trigger: "on_skill_cast", label: "마력 재순환", mpRefundPctOfCost: 15 } },
      { count: 3, bonus: { hp: 300, mp: 260, magicDef: 25, crit: 5, critMult: 40, spd: 8 }, signature: { trigger: "on_hit", label: "심층 방전", shockChancePct: 8 } },
    ],
  } as const;
  ```

- [x] **Step 3: Run the focused test and verify RED**

  Run: `npm test -- src/adventure/data/v2/v2Equipment.test.ts`

  Expected: FAIL because the twelve equipment IDs and four tag sets are absent.

- [x] **Step 4: Add the twelve catalogue entries**

  Add the items beside the existing pioneer block in `v2EquipmentCatalog.ts`. Store raw powers that scale to the approved runtime values: non-weapons use `87, 81, 137, 258, 87, 137, 283, 89, 162, 258, 139`; the staff uses raw power `897`. Use the exact Korean names, descriptions, options, flags, and tag IDs from the design spec.

- [x] **Step 5: Add the four tag-set definitions**

  Add the exact thresholds above to `V2_EQUIP_TAG_SETS` in `v2Equipment.ts`. Use build tags `physical/crit/evasion/speed` for tracking, `physical/poison/bleed/dot` for toxic blood, `tank/shield` for glacial guard, and `magic/crit/speed/resource` for deep arcane.

- [x] **Step 6: Run the focused test and verify GREEN**

  Run: `npm test -- src/adventure/data/v2/v2Equipment.test.ts`

  Expected: PASS with all catalogue reverse-reference and signature-label invariants still green.

- [x] **Step 7: Commit Task 1**

  ```bash
  git add src/adventure/data/v2/v2Equipment.test.ts src/adventure/data/v2/v2EquipmentCatalog.ts src/adventure/data/v2/v2Equipment.ts
  git commit -m "feat: add unexplored specialty equipment sets"
  ```

### Task 2: Lv.20~22 guild workshop recipes and gold override

**Files:**
- Modify: `src/adventure/data/v2/guildWorkshop.test.ts`
- Modify: `src/adventure/data/v2/guildWorkshop.ts`

**Interfaces:**
- Extends `GuildWorkshopRecipe` with optional `goldCost?: number`.
- `guildWorkshopRecipeGoldCost(recipe, mode)` uses the override before the existing masterwork multiplier.
- Produces twelve recipe IDs prefixed with `specialty_`, one for each Task 1 equipment ID.

- [x] **Step 1: Add a failing recipe and cost contract test**

  Add a table-driven test with one literal row per recipe. Assert equipment ID, profile, level, XP, smithy 5, exact production split, sunstone 6, aurora crystal 6, abyssal starsteel 2, exact pool-material object, note prefix, normal 500,000G, masterwork 1,000,000G, and doubled production/material costs.

  Profiles and production splits are:

  ```ts
  const profiles = {
    unexplored_tracking: ["pursuit", { crop: 360, ore: 240 }],
    unexplored_toxic_blood: ["corrosion", { crop: 300, ore: 300 }],
    unexplored_glacial_guard: ["guard", { crop: 240, ore: 360 }],
    unexplored_deep_arcane: ["focus", { crop: 330, ore: 270 }],
  } as const;
  ```

  Pool costs are `18` for each Lv.20/Lv.21 single-material item, `12 + 12` for the three boss-pair Lv.22 items, and `8 + 8 + 8` for the deep-arcane Lv.22 ring. Levels `20, 21, 22` award XP `450, 475, 500`.

- [x] **Step 2: Add a failing recipe-level gold regression test**

  Assert an existing pioneer recipe remains 300,000G/600,000G while a new specialty recipe is 500,000G/1,000,000G. This catches accidental replacement of the global display-tier fee.

- [x] **Step 3: Run the focused workshop test and verify RED**

  Run: `npm test -- src/adventure/data/v2/guildWorkshop.test.ts`

  Expected: FAIL because the specialty recipes and per-recipe gold override are absent.

- [x] **Step 4: Implement recipe-level gold override**

  Add `goldCost?: number` to `GuildWorkshopRecipe`. Update `guildWorkshopRecipeGoldCost` to choose `recipe.goldCost` when finite and non-negative, otherwise use the existing display-tier cost, then apply `GUILD_WORKSHOP_MASTERWORK_GOLD_COST_MULT` exactly once for masterwork.

- [x] **Step 5: Implement the specialty recipe builder and twelve recipes**

  Add a private total-resource splitter that uses `GUILD_WORKSHOP_WOOD_SHARE_PCT_BY_PROFILE` and preserves the existing 5-unit rounding. Add `unexploredSpecialtyRecipe(...)` that sets `goldCost: 500_000`, common guild materials `6/6/2`, exact pool material costs, smithy Lv.5, and note prefix `미개척지 · 특화 세트`. Add the twelve recipe union members and catalogue entries using the IDs and costs from Task 1 and the design spec.

- [x] **Step 6: Run focused workshop tests and verify GREEN**

  Run: `npm test -- src/adventure/data/v2/guildWorkshop.test.ts`

  Expected: PASS, including existing pioneer, masterwork, material-name, parse-record, and recipe-count contracts. Update the exact total recipe count from `87` to `99` as part of the approved catalogue expansion.

- [x] **Step 7: Commit Task 2**

  ```bash
  git add src/adventure/data/v2/guildWorkshop.test.ts src/adventure/data/v2/guildWorkshop.ts
  git commit -m "feat: craft unexplored specialty sets"
  ```

### Task 3: Existing workshop UI exposure

**Files:**
- Modify: `src/adventure/v2/guild/WorkshopCraftPanel.test.tsx`

**Interfaces:**
- Consumes `guildWorkshopRecipeView` for `specialty_abyss_catalyst_ring`.
- Proves the existing component exposes the new note, level, normal/masterwork fees, and all three upper-pool materials without production UI changes.

- [x] **Step 1: Add a focused render test**

  Build a `WorkshopState` containing only the deep-arcane Lv.22 ring view and render the real `WorkshopCraftPanel`. Assert the markup contains `미개척지 · 특화 세트 · 심층 마도`, `대장장이 Lv 22`, `제작소 Lv 5`, `500,000 G`, `1,000,000 G`, `과열 동력핵 8`, `농축 독낭 8`, `혹한 결정 8`, `태양석 6`, `오로라 결정 6`, and `심해성철 2`.

- [x] **Step 2: Run the focused UI test**

  Run: `npm test -- src/adventure/v2/guild/WorkshopCraftPanel.test.tsx`

  Expected: PASS because the existing generic workshop renderer consumes the newly added recipe view. If it fails, change production UI only when the failure identifies a real generic rendering gap; do not add a specialty-only branch.

- [x] **Step 3: Commit Task 3**

  ```bash
  git add src/adventure/v2/guild/WorkshopCraftPanel.test.tsx
  git commit -m "test: cover unexplored specialty workshop cards"
  ```

### Task 4: Integration verification and scope audit

**Files:**
- Verify only; modify tests or implementation only for failures caused by this feature.

**Interfaces:**
- Confirms equipment, tag-set aggregation, workshop cost/view, transaction consumers, type safety, formatting, images, and production compilation remain compatible.

- [x] **Step 1: Run related focused suites together**

  Run:

  ```bash
  npm test -- src/adventure/data/v2/v2Equipment.test.ts src/adventure/data/v2/guildWorkshop.test.ts src/adventure/v2/guild/WorkshopCraftPanel.test.tsx src/adventure/v2/combat/signatureEffects.test.ts
  ```

  Expected: PASS.

- [x] **Step 2: Run static verification**

  Run:

  ```bash
  npx tsc --noEmit
  npx eslint src/adventure/data/v2/v2Equipment.test.ts src/adventure/data/v2/v2EquipmentCatalog.ts src/adventure/data/v2/v2Equipment.ts src/adventure/data/v2/guildWorkshop.test.ts src/adventure/data/v2/guildWorkshop.ts src/adventure/v2/guild/WorkshopCraftPanel.test.tsx
  npm run check-images
  ```

  Expected: all commands exit 0. The image check should require no new assets.

- [x] **Step 3: Run full tests and production build**

  Run:

  ```bash
  npm test
  npm run build
  ```

  Expected: all tests and the production build pass. If an unrelated dirty-worktree file fails lint, typecheck, tests, or build, report it separately and do not absorb it into this feature commit.

- [x] **Step 4: Audit the diff against the spec**

  Compare `git diff 5c51ea2b7..HEAD` with `docs/superpowers/specs/2026-08-30-unexplored-specialty-sets-design.md`. Confirm exactly twelve items, four three-piece sets, twelve recipes, no item signatures, no new combat mechanic/API/save shape/image, and no deployment or feature-flag change.

- [x] **Step 5: Commit any verification-only corrections**

  If verification required scoped corrections, stage only the exact modified files from Tasks 1~3 and commit them:

  ```bash
  git add src/adventure/data/v2/v2Equipment.test.ts src/adventure/data/v2/v2EquipmentCatalog.ts src/adventure/data/v2/v2Equipment.ts src/adventure/data/v2/guildWorkshop.test.ts src/adventure/data/v2/guildWorkshop.ts src/adventure/v2/guild/WorkshopCraftPanel.test.tsx
  git commit -m "fix: align unexplored specialty set contracts"
  ```
