# Elemental Resonance Loadout Rework Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reduce elemental formula material SP through resonance absorption, let Primordial Return consume Elemental Surge as a catalyst, and rebalance Primordial Mage passives.

**Architecture:** Add one shared pure resolver that selects the same cast variant used by combat and returns the active circuit, absorbed skills, effective per-skill SP, and active combat IDs. Server validation, saved-loadout reconciliation, presets, UI, and combat consume that result instead of recreating resonance rules. Skill data remains authoritative for passive values and catalyst damage.

**Tech Stack:** TypeScript, React 19, Next.js 16.2, Vitest, existing deterministic V2 combat simulation.

## Global Constraints

- Preserve all existing skill IDs and saved equipped arrays; do not add a data migration.
- Elemental material and Primordial catalyst effective cost is exactly 2 SP only while the matching resonance circuit is active.
- Absorbed skills satisfy formula conditions but cannot cast independently.
- Primordial circuit takes precedence when both complete circuits are equipped.
- Primordial Resonance remains 9 SP; Primordial Amplification becomes 9 SP.
- Do not deploy.

---

## File Structure

- Create `src/adventure/data/v2/elementalResonance.ts`: shared variant selection, circuit resolution, effective SP breakdown, and active combat IDs.
- Create `src/adventure/data/v2/elementalResonance.test.ts`: literal cost and precedence tests for the pure resolver.
- Modify `src/adventure/data/v2/v2SkillsCommonCatalog.ts`: passive values, cost adjustments, descriptions, and catalyst synergy data.
- Modify `src/adventure/data/v2/v2Skills.test.ts`: passive and fixed SP regression coverage.
- Modify `src/adventure/data/v2/v2Loadout.ts` and `v2Loadout.test.ts`: authoritative validation and safe budget clamping with contextual costs.
- Modify `src/adventure/v2/loadoutPresetDiagnostics.ts` and its test: contextual preset totals and recomputed auto-fit.
- Modify `src/app/api/v2/me/state/stateSections.ts` and its tests: server response totals use effective SP.
- Modify `src/adventure/v2/combat/combatShared.ts` and `combatPatternCast.test.ts`: shared variant selection, absorbed action filtering, and catalyst damage.
- Modify `src/adventure/v2/V2LoadoutPanel.tsx` and `V2LoadoutPanel.test.tsx`: local what-if totals and resonance labels.

### Task 1: Shared resonance resolver and passive catalog

**Files:**
- Create: `src/adventure/data/v2/elementalResonance.ts`
- Create: `src/adventure/data/v2/elementalResonance.test.ts`
- Modify: `src/adventure/data/v2/v2SkillsCommonCatalog.ts`
- Modify: `src/adventure/data/v2/v2Skills.test.ts`

**Interfaces:**
- Produces: `selectV2CastVariant(definition, learned, equipped)` returning the first matching cast variant or `undefined`.
- Produces: `resolveElementalResonanceLoadout({ learned, equipped })` returning `circuit`, `castVariant`, `absorbedSkillIds`, `catalystActive`, `effectiveSpCosts`, `spUsed`, and `activeCombatSkillIds`.
- Consumes: `V2_SKILLS`, `spCostOf`, `V2SkillDefinition`, and `V2SkillId`.

- [ ] **Step 1: Write failing resolver tests**

Add literal assertions for these complete loadouts:

```ts
expect(resolveElementalResonanceLoadout({ learned: elementalLord, equipped: elementalLord }).spUsed).toBe(28);
expect(resolveElementalResonanceLoadout({ learned: primordial, equipped: primordial }).spUsed).toBe(35);
expect(resolveElementalResonanceLoadout({ learned: catalyst, equipped: catalyst }).spUsed).toBe(37);
expect(resolveElementalResonanceLoadout({ learned: [...catalyst, "v2c_primordialmage_amplification"], equipped: [...catalyst, "v2c_primordialmage_amplification"] }).spUsed).toBe(46);
```

Also assert a two-element formula absorbs only its two required elements, an unused third element keeps base cost and remains active, a learned-only variant absorbs nothing, a broken circuit uses all base costs, and a complete Primordial circuit wins over a complete Elemental Lord circuit.

- [ ] **Step 2: Run resolver tests and confirm RED**

Run: `npm test -- src/adventure/data/v2/elementalResonance.test.ts`

Expected: FAIL because the module and exported resolver do not exist.

- [ ] **Step 3: Implement the pure resolver**

Use explicit ID constants for the two signatures, two resonance passives, catalyst, and five eligible materials. Keep `spCostOf` unchanged. Select the first matching variant using learned and equipped sets, reduce only selected `requiredEquippedSkillIds` that belong to the eligible material set, and filter absorbed IDs from `activeCombatSkillIds`.

- [ ] **Step 4: Run resolver tests and confirm GREEN**

Run: `npm test -- src/adventure/data/v2/elementalResonance.test.ts`

Expected: all resolver cases pass.

- [ ] **Step 5: Write failing passive and catalyst-data tests**

Assert Primordial Resonance exposes `{ int: 24, spi: 12 }`, `magicSkillDamagePct: 16`, `maxMpPct: 20`, and costs 9 SP. Assert Primordial Amplification costs 9 SP. Assert Primordial Return has a synergy requiring both resonance and Elemental Surge whose only effect is magic damage with `statCoef: 0.28` and `baseFlat: 110`.

- [ ] **Step 6: Run passive tests and confirm RED**

Run: `npm test -- src/adventure/data/v2/v2Skills.test.ts`

Expected: failures show the old passive values, 12 SP amplification, and missing catalyst synergy.

- [ ] **Step 7: Update catalog data minimally**

Set Primordial Resonance to the approved values and add enough `spCostDiscount` to keep its final cost at 9. Remove the 12 SP floor from Primordial Amplification. Add the two-skill catalyst synergy to Primordial Return after the existing resonance synergy, and update descriptions to mention resonance material/catalyst behavior without changing other formula effects.

- [ ] **Step 8: Run Task 1 tests and commit**

Run: `npm test -- src/adventure/data/v2/elementalResonance.test.ts src/adventure/data/v2/v2Skills.test.ts`

Commit: `feat: add elemental resonance loadout rules`

### Task 2: Authoritative SP validation, reconciliation, and presets

**Files:**
- Modify: `src/adventure/data/v2/v2Loadout.ts`
- Modify: `src/adventure/data/v2/v2Loadout.test.ts`
- Modify: `src/adventure/v2/loadoutPresetDiagnostics.ts`
- Modify: `src/adventure/v2/loadoutPresetDiagnostics.test.ts`
- Modify: `src/app/api/v2/me/state/stateSections.ts`
- Modify: the colocated `stateSections` loadout tests found by `rg "loadoutSection" src/app/api/v2/me/state`

**Interfaces:**
- Consumes: `resolveElementalResonanceLoadout` from Task 1.
- Produces: server and client-side diagnostics whose `spUsed` and per-row effective costs match the resolver.

- [ ] **Step 1: Write failing loadout validation tests**

Use real catalog IDs and literal totals. Assert `validateLoadout` accepts the 28/35/37/46 configurations at exactly those budgets and rejects each at one less. Assert `sanitizeLoadout` preserves a full resonance configuration that fits only after absorption. Assert clamping never returns a set whose recomputed contextual cost exceeds budget.

- [ ] **Step 2: Run validation tests and confirm RED**

Run: `npm test -- src/adventure/data/v2/v2Loadout.test.ts`

Expected: old additive `spCostOf` totals exceed the literal budgets.

- [ ] **Step 3: Integrate contextual totals into validation and clamping**

Replace additive validation with the shared resolver total after unknown/not-learned classification. For clamping, recompute contextual cost whenever the kept set changes; after greedy selection, repeatedly remove the lowest-priority retained paid combat skill until the resolver total is within budget. Preserve zero-SP lifestyle skills and existing order.

- [ ] **Step 4: Run validation tests and confirm GREEN**

Run: `npm test -- src/adventure/data/v2/v2Loadout.test.ts`

- [ ] **Step 5: Write failing preset and state-section tests**

Assert preset diagnosis reports effective row costs and totals for the 37 SP catalyst build, auto-fit recomputes after each removal, and `loadoutSection` returns `spUsed: 37` with material/catalyst effective-cost metadata instead of 59 or base row sums.

- [ ] **Step 6: Run preset/state tests and confirm RED**

Run the two exact test files discovered above plus `src/adventure/v2/loadoutPresetDiagnostics.test.ts`.

- [ ] **Step 7: Reuse the resolver in presets and state serialization**

Keep library `spCost` as the base catalog price and add optional `effectiveSpCost` and `resonanceRole: "material" | "catalyst" | "inactive"` to equipped rows. Calculate `spUsed` from the resolver. In preset diagnosis, derive learned IDs from library metadata, assign effective costs from the candidate preset resolution, and recompute the diagnosis inside every auto-fit removal iteration.

- [ ] **Step 8: Run Task 2 tests and commit**

Run: `npm test -- src/adventure/data/v2/v2Loadout.test.ts src/adventure/v2/loadoutPresetDiagnostics.test.ts src/app/api/v2/me/state/stateSections.test.ts`

Commit: `feat: apply resonance costs to skill loadouts`

### Task 3: Combat absorption and Primordial catalyst

**Files:**
- Modify: `src/adventure/v2/combat/combatShared.ts`
- Modify: `src/adventure/v2/combat/combatPatternCast.test.ts`

**Interfaces:**
- Consumes: `selectV2CastVariant` and `resolveElementalResonanceLoadout` from Task 1.
- Produces: skill selection that keeps absorbed IDs available for formula matching while excluding them from pattern and automatic cast candidates.

- [ ] **Step 1: Write failing combat behavior tests**

Add real-cast tests proving an absorbed Fire/Wind pair cannot be selected independently, the resulting cast is `화염폭풍` or `태초의 화염폭풍`, an unused third element remains selectable, and removing the matching resonance restores independent selection. Compare Primordial Return with and without Elemental Surge under identical attacker/target inputs and assert the catalyst adds exactly the hand-calculated `0.28/+110` scaled magic damage once.

- [ ] **Step 2: Run combat tests and confirm RED**

Run: `npm test -- src/adventure/v2/combat/combatPatternCast.test.ts`

Expected: absorbed materials still cast and the catalyst produces no extra damage.

- [ ] **Step 3: Filter action candidates but preserve formula inputs**

Resolve resonance once at the start of `resolveV2SkillCast`. Build patterns, role fallback, usability checks, and automatic picks from `activeCombatSkillIds`; retain the original equipped set for variant and equipped-synergy checks. Replace the local variant `.find` with `selectV2CastVariant` so cost and combat selection cannot diverge.

- [ ] **Step 4: Run combat tests and confirm GREEN**

Run: `npm test -- src/adventure/v2/combat/combatPatternCast.test.ts`

- [ ] **Step 5: Run broader combat regression tests and commit**

Run: `npm test -- src/adventure/v2/combat/combatPatternCast.test.ts src/adventure/battle/combatShared.test.ts src/adventure/battle/engine-pvp.test.ts`

Commit: `feat: absorb resonance materials in combat`

### Task 4: Loadout UI effective costs and resonance labels

**Files:**
- Modify: `src/adventure/v2/V2LoadoutPanel.tsx`
- Modify: `src/adventure/v2/V2LoadoutPanel.test.tsx`

**Interfaces:**
- Consumes: `resolveElementalResonanceLoadout` from Task 1 and optional server metadata from Task 2.
- Produces: reactive local totals, fit checks, and user-visible material/catalyst labels.

- [ ] **Step 1: Write failing rendered-behavior tests**

Render a learned library and equipped 5-element circuit. Assert the summary shows `28 /`, material cards show `공명 재료 · 2 SP`, and base costs remain visible. Render Primordial catalyst and assert `근원 촉매 · 2 SP · 태초회귀 강화`. Render both circuits and assert `근원공명 우선 · 원소군주 회로 비활성`.

- [ ] **Step 2: Run UI tests and confirm RED**

Run: `npm test -- src/adventure/v2/V2LoadoutPanel.test.tsx`

- [ ] **Step 3: Implement local contextual display**

Memoize the resolver from all learned library IDs and current local `order`. Replace additive `spUsed` and `wouldFit` calculations with current and candidate resolver totals. Display base and effective cost only when they differ, and render the exact approved labels without introducing translucent custom surfaces.

- [ ] **Step 4: Run UI tests and confirm GREEN**

Run: `npm test -- src/adventure/v2/V2LoadoutPanel.test.tsx`

- [ ] **Step 5: Commit UI integration**

Commit: `feat: show elemental resonance SP discounts`

### Task 5: Balance verification and final regression

**Files:**
- Modify only if the deterministic comparison requires a focused fixture: `src/adventure/data/v2/levelDesignSim.test.ts`
- Modify if player-facing static text contains stale values: files returned by `rg "근원공명|원초 증폭|오원소 폭주|태초회귀" src/app/manual docs/patch-notes`

**Interfaces:**
- Consumes: completed behavior from Tasks 1-4.
- Produces: verified balance bounds and consistent documentation.

- [ ] **Step 1: Add or run a deterministic equal-SP comparison**

Compare representative Primordial Mage, Heavenly Bow, and Black Moon configurations with the same total SP and representative equipment. Assert Primordial sustained direct damage stays within 10% of the comparison median. If outside the bound, adjust only catalyst `statCoef/baseFlat` together and update the literal catalyst test.

- [ ] **Step 2: Run focused feature suite**

Run: `npm test -- src/adventure/data/v2/elementalResonance.test.ts src/adventure/data/v2/v2Skills.test.ts src/adventure/data/v2/v2Loadout.test.ts src/adventure/v2/loadoutPresetDiagnostics.test.ts src/adventure/v2/combat/combatPatternCast.test.ts src/adventure/v2/V2LoadoutPanel.test.tsx`

- [ ] **Step 3: Run repository verification**

Run sequentially:

```bash
npm test
npx tsc --noEmit
npm run lint
npm run build
```

If unrelated dirty-worktree tests fail, rerun every failing file in isolation and report exact evidence without modifying unrelated files.

- [ ] **Step 4: Review and commit the complete implementation**

Inspect `git diff --check`, stage only files belonging to this design, and commit any remaining implementation/test/documentation changes as `feat: rebalance elemental resonance builds`.

- [ ] **Step 5: Confirm no deployment occurred**

Do not run deployment or maintenance-mode commands.
