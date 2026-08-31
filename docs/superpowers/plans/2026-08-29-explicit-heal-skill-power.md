# Explicit Heal Skill Power Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove the hidden combat-pattern multiplier from direct healing and move the existing effective power into the six affected deterministic repeatable heal definitions.

**Architecture:** `V2_SKILLS` remains the source consumed by combat and descriptions. The catalog stores the actual direct-heal percentages, coefficients, and flats; `resolveV2SkillCast` returns those direct heals without a second pattern-only multiplier. Damage, DoT, one-use recovery, damage-based healing, regeneration, shields, and buffs retain their existing paths.

**Tech Stack:** TypeScript, Vitest, existing v2 combat engine and skill catalog.

## Global Constraints

- Preserve the existing production effective power of deterministic repeatable direct heals as closely as integer rounding allows.
- Do not deploy.
- Do not alter unrelated combat-pattern damage balancing.

---

### Task 1: Lock the direct-heal contract with failing tests

**Files:**
- Modify: `src/adventure/v2/combat/combatPatternCast.test.ts`
- Modify: `src/adventure/data/v2/v2Skills.test.ts`

**Interfaces:**
- Consumes: `V2_SKILLS`, `resolveV2SkillCast`, `describeV2Skill`
- Produces: regression coverage for pattern/non-pattern parity and the six explicit skill values

- [ ] Add a table-driven test that discovers every player skill with a direct `heal` effect, forces a successful cast, and asserts that pattern and non-pattern casts return the same `selfHeal`.
- [ ] Add literal expectations for the six affected skill effects: `v2_skill_recover`, `v2c_martial_chi`, `v2c_acolyte_smite`, `v2c_bishop_heal`, `v2c_archbishop_sanctuary`, and `v2c_saint_miracle`.
- [ ] Run `npm test -- src/adventure/v2/combat/combatPatternCast.test.ts src/adventure/data/v2/v2Skills.test.ts` and confirm failures show the hidden multiplier and old catalog values.

### Task 2: Move effective healing into skill data

**Files:**
- Modify: `src/adventure/data/v2/v2SkillCatalog.ts`
- Modify: `src/adventure/data/v2/v2SkillsCommonCatalog.ts`
- Modify: `src/adventure/v2/combat/combatShared.ts`

**Interfaces:**
- Consumes: `V2_PATTERN_SKILL_POWER_MULT_BY_TIER` for damage-only balancing
- Produces: explicit catalog heal values and pattern-independent direct healing

- [ ] Set `v2_skill_recover` to maximum HP 1.8%.
- [ ] Set the five common deterministic repeatable heal definitions to their former effective values, multiplying every direct-heal percentage, stat coefficient, and flat by the old tier multiplier.
- [ ] Remove `directHealMult`, `patternScaledSelfHeal`, and `patternScaledSelfHealOnMiss`; apply only the existing PvP limited-recovery multiplier to direct healing.
- [ ] Keep `damageBasedHeal` unmodified and included exactly once.
- [ ] Run the focused tests until green.

### Task 3: Audit exclusions and run broad verification

**Files:**
- Modify only if an audit exposes a missing regression: relevant existing test file

**Interfaces:**
- Consumes: full `V2_SKILLS` catalog and combat test suites
- Produces: evidence that no related skill was omitted

- [ ] Enumerate all `heal`, `healFromDamage`, and `selfRegen` effects from `V2_SKILLS`; compare them with the design inventory.
- [ ] Run focused combat, catalog, job-catalog, and server derivation tests.
- [ ] Run TypeScript checking and lint for changed files if supported by project scripts.
- [ ] Re-run the enumeration and `rg` searches for removed pattern-heal symbols.
- [ ] Inspect `git diff --check` and the final diff, then commit only the task files.
