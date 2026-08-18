# Genesis Five-Element Damage Premium Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give the two fully equipped five-element Genesis cast variants a clear direct-damage premium without changing their utility, costs, proc rates, or other formulas.

**Architecture:** Keep the rule data-driven by changing only the first `castVariants` damage effect on Elemental Surge and Primordial Return. Add literal catalog regressions and update the existing equal-SP combat guard so the unusually difficult five-element formula is intentionally stronger than ordinary tier-6 comparisons.

**Tech Stack:** TypeScript, Vitest, existing V2 skill catalog normalization and deterministic combat resolver.

## Global Constraints

- `개벽·오원소 폭주` raw direct damage becomes exactly `3.10/780`, normalized at tier 5 to `2.79/702`.
- `개벽·오원소 회귀` raw direct damage becomes exactly `3.50/925`, normalized to `3.33/879`.
- Do not change proc chance, MP, SP, statuses, learned-only variants, resonance synergy, or catalyst damage.
- The equal-46-SP Primordial comparison must be 15% to 30% above the Heavenly Bow/Black Moon direct-damage median.
- Preserve unrelated dirty-worktree changes and stage only the two coefficient hunks and their test hunks.
- Do not deploy.

---

## File Structure

- Modify `src/adventure/data/v2/v2SkillsCommonCatalog.ts`: raw damage values for the first Elemental Surge and Primordial Return cast variants.
- Modify `src/adventure/data/v2/v2SkillsByJob.test.ts`: literal normalized catalog assertions for both first variants.
- Modify `src/adventure/v2/combat/combatPatternCast.test.ts`: replace the former ±10% equal-SP guard with the approved +15% to +30% premium and retain the five-element cast behavior assertion.

### Task 1: Five-element Genesis direct-damage premium

**Files:**
- Modify: `src/adventure/data/v2/v2SkillsCommonCatalog.ts`
- Modify: `src/adventure/data/v2/v2SkillsByJob.test.ts`
- Modify: `src/adventure/v2/combat/combatPatternCast.test.ts`

**Interfaces:**
- Consumes: existing `V2_SKILLS`, `resolveV2SkillCast`, and `resolveElementalResonanceLoadout` behavior.
- Produces: normalized first-variant damage values `2.79/702` and `3.33/879`; no new runtime interface.

- [ ] **Step 1: Add failing literal catalog assertions**

In `v2SkillsByJob.test.ts`, extend the existing Elemental Lord and Primordial Mage catalog checks:

```ts
expect(V2_SKILLS.v2c_elementallord_surge.castVariants?.[0].effects[0]).toEqual({
  kind: "damage",
  statCoef: 2.79,
  baseFlat: 702,
  scaling: "magic",
});
expect(V2_SKILLS.v2c_primordialmage_return.castVariants?.[0].effects[0]).toEqual({
  kind: "damage",
  statCoef: 3.33,
  baseFlat: 879,
  scaling: "magic",
});
```

- [ ] **Step 2: Replace the obsolete equal-SP expectation and confirm RED**

Rename the combat test to state that Primordial Genesis direct damage is 15% to 30% above the comparison median, then use:

```ts
expect(primordialDamage).toBeGreaterThanOrEqual(comparisonMedian * 1.15);
expect(primordialDamage).toBeLessThanOrEqual(comparisonMedian * 1.3);
```

Run:

```bash
npm test -- src/adventure/data/v2/v2SkillsByJob.test.ts src/adventure/v2/combat/combatPatternCast.test.ts
```

Expected: the literal effects still report `2.48/630` and `2.90/779`, and the old damage output does not reach the new lower bound.

- [ ] **Step 3: Apply the minimal catalog change**

Change only these two first-variant effects in `v2SkillsCommonCatalog.ts`:

```ts
// 개벽·오원소 폭주
dmg(3.1, 780, "magic")

// 개벽·오원소 회귀
dmg(3.5, 925, "magic")
```

- [ ] **Step 4: Run focused GREEN verification**

Run:

```bash
npm test -- src/adventure/data/v2/v2SkillsByJob.test.ts src/adventure/v2/combat/combatPatternCast.test.ts src/adventure/data/v2/elementalResonance.test.ts
```

Expected: all tests pass, including unchanged two-element, material absorption, and catalyst cases.

- [ ] **Step 5: Run static checks without modifying unrelated work**

Run:

```bash
npx tsc --noEmit
npx eslint src/adventure/data/v2/v2SkillsCommonCatalog.ts src/adventure/data/v2/v2SkillsByJob.test.ts src/adventure/v2/combat/combatPatternCast.test.ts
git diff --check
```

If repository-wide type errors come from the concurrent mutation/job work, report them separately and do not edit those features.

- [ ] **Step 6: Stage only this task's hunks and commit**

Review each hunk with `git diff` and interactive `git add -p` because all three files may contain concurrent user changes. Stage only:

- the two `dmg(...)` value changes;
- the two literal normalized-effect assertions;
- the equal-SP test title and 1.15/1.30 bounds.

Verify `git diff --cached --check` and `git diff --cached`, then commit:

```bash
git commit -m "balance: reward five-element genesis formulas"
```
