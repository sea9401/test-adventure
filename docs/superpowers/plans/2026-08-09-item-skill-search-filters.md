# Item and Skill Search Filters Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add composable equipment-tier and skill job-tier/lineage filters to the existing marketplace and loadout searches.

**Architecture:** Put classification rules in two small pure modules so catalog compatibility and display-tier conversion are independently testable. Keep UI state local to the existing client components and compose each new predicate with the current search/filter pipeline.

**Tech Stack:** Next.js App Router client components, React, TypeScript, Tailwind CSS, Vitest.

## Global Constraints

- Do not change server APIs, persisted data, sorting, or deployment state.
- Equipment filters use the existing 1T-6T display tiers, not raw catalog tiers.
- Skill filters use source-job class tiers and root lineages; common skills remain separately selectable.
- Preserve unknown legacy entries when filters are `all` and exclude them from specific classifications.
- Preserve existing uncommitted workspace changes and use opaque input/filter surfaces.

---

### Task 1: Pure equipment-tier filtering

**Files:**
- Create: `src/adventure/v2/marketplace/marketplaceBrowseFilters.ts`
- Create: `src/adventure/v2/marketplace/marketplaceBrowseFilters.test.ts`

**Interfaces:**
- Consumes: `V2_EQUIPMENT` and `v2EquipCatalogTierToDisplayTier`.
- Produces: `MarketplaceEquipmentTierFilter` and `matchesMarketplaceEquipmentTier(itemId, filter): boolean`.

- [ ] **Step 1: Write the failing tests**

Add literal assertions that a raw tier 1 item matches `"1"`, a raw tier 4 item matches `"2"`, neither matches the wrong display tier, unknown IDs match only `"all"`, and all IDs pass `"all"`.

- [ ] **Step 2: Run the test and verify RED**

Run: `npx vitest run src/adventure/v2/marketplace/marketplaceBrowseFilters.test.ts --reporter=verbose`

Expected: FAIL because the module does not exist.

- [ ] **Step 3: Implement the minimal predicate**

Use this public type and signature:

```ts
export type MarketplaceEquipmentTierFilter =
  | "all" | "1" | "2" | "3" | "4" | "5" | "6";

export function matchesMarketplaceEquipmentTier(
  itemId: string,
  filter: MarketplaceEquipmentTierFilter,
): boolean;
```

Return `true` immediately for `all`; otherwise look up the equipment definition, convert its catalog tier with the existing helper, and compare it to `Number(filter)`.

- [ ] **Step 4: Run the test and verify GREEN**

Run: `npx vitest run src/adventure/v2/marketplace/marketplaceBrowseFilters.test.ts --reporter=verbose`

Expected: all tests PASS.

### Task 2: Pure skill classification filtering

**Files:**
- Create: `src/adventure/v2/skillLibraryFilters.ts`
- Create: `src/adventure/v2/skillLibraryFilters.test.ts`

**Interfaces:**
- Consumes: `V2_JOB_CATALOG`, `LEGACY_CLASS_SPEC_BY_JOB`, and `DROPPED_SPEC_TO_SURVIVING`.
- Produces: option constants, `classifySkillForLibrary(skillId)`, and `matchesSkillLibraryClassification(skillId, tier, lineage)`.

- [ ] **Step 1: Write the failing tests**

Use literal skill IDs to assert these hand-derived results:

```ts
v2_skill_strike               -> { tier: "common", lineage: "common" }
v2c_none_toughness            -> { tier: "common", lineage: "common" }
v2c_warrior_strike            -> { tier: "1", lineage: "warrior" }
v2c_swordsaint_flash          -> { tier: "6", lineage: "warrior" }
v2c_elementalist_magic        -> { tier: "4", lineage: "mage" }
v2c_farmer_seedselection      -> { tier: "2", lineage: "survivor" }
```

Also assert that a 6차 전사 filter requires both values to match and that an unknown ID passes only `all/all`.

- [ ] **Step 2: Run the test and verify RED**

Run: `npx vitest run src/adventure/v2/skillLibraryFilters.test.ts --reporter=verbose`

Expected: FAIL because the module does not exist.

- [ ] **Step 3: Implement classification and matching**

Export these types:

```ts
export type SkillJobTierFilter =
  | "all" | "common" | "1" | "2" | "3" | "4" | "5" | "6";
export type SkillLineageFilter =
  | "all" | "common" | "warrior" | "martial" | "mage" | "rogue" | "survivor";
```

Parse only the `v2c_` prefix, normalize dropped job IDs, treat `none` and `v2_skill_*` as common, map survivor tier 0 to `"1"`, and return `null` for unrecognized values. The matcher must apply tier and lineage as independent AND predicates while allowing `all` to bypass its axis.

- [ ] **Step 4: Run the test and verify GREEN**

Run: `npx vitest run src/adventure/v2/skillLibraryFilters.test.ts --reporter=verbose`

Expected: all tests PASS.

### Task 3: Wire the filters into both client screens

**Files:**
- Modify: `src/adventure/v2/V2MarketplaceView.tsx`
- Modify: `src/adventure/v2/V2LoadoutPanel.tsx`
- Modify: `src/adventure/v2/V2LoadoutPanel.test.tsx`

**Interfaces:**
- Consumes: Tasks 1-2 predicates and option constants.
- Produces: local selection state, accessible select controls, combined result filtering, active-filter counts, and reset behavior.

- [ ] **Step 1: Add a failing loadout markup test**

Render `V2LoadoutPanel` and assert named `차수` and `계열` select controls contain `공용`, `1차` through `6차`, and the five lineage labels. This catches accidental removal of the user-facing controls while pure tests protect the filtering rules.

- [ ] **Step 2: Run the panel test and verify RED**

Run: `npx vitest run src/adventure/v2/V2LoadoutPanel.test.tsx --reporter=verbose`

Expected: FAIL because the controls are absent.

- [ ] **Step 3: Wire the marketplace tier filter**

Add `equipmentTierFilter` state, place an `아이템 티어` `SelectControl` in the existing filter panel for equipment tabs, call `matchesMarketplaceEquipmentTier` in `displayedListings`, and include the state in active counts, reset logic, result badges, and pagination keys.

- [ ] **Step 4: Wire the loadout filters**

Add `skillTierFilter` and `skillLineageFilter` state. Apply `matchesSkillLibraryClassification` after query matching and before the existing status/category predicate. Render two explicitly labelled native selects below the search toolbar and reset both from `검색 초기화`.

- [ ] **Step 5: Run focused tests and verify GREEN**

Run:

```bash
npx vitest run src/adventure/v2/marketplace/marketplaceBrowseFilters.test.ts src/adventure/v2/skillLibraryFilters.test.ts src/adventure/v2/V2LoadoutPanel.test.tsx --reporter=verbose
```

Expected: all tests PASS without warnings.

### Task 4: Final verification and integration

**Files:**
- Verify all changed files; no expected production edits.

**Interfaces:**
- Confirms both filter systems compose with the existing UI and repository constraints.

- [ ] **Step 1: Run static and repository checks**

Run:

```bash
npx tsc --noEmit
npm run check-images
git diff --check
```

Expected: every command exits 0.

- [ ] **Step 2: Run the full regression suite**

Run: `npm test -- --run`

Expected: all pre-existing and new tests PASS.

- [ ] **Step 3: Review filter composition and surfaces**

Confirm the marketplace tier predicate is equipment-only, all new filters are represented in reset and pagination keys, loadout filters combine with query/status/category filters, and select controls use opaque white/zinc backgrounds in light/dark mode.

- [ ] **Step 4: Commit the feature**

Stage only the two docs, two filter modules and tests, and the two UI files, then commit with `feat: add item and skill search filters`.
