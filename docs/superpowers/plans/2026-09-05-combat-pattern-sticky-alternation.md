# Combat Pattern Sticky Alternation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make A/B combat-pattern alternation advance only after the selected skill actually fires.

**Architecture:** Track the last successful skill independently for each ordered A/B pair in ephemeral PvE/PvP battle state. The pure pattern evaluator selects the opposite member, while `resolveV2SkillCast` emits a transition only for a successful alternate candidate and each engine applies it.

**Tech Stack:** TypeScript, Vitest, Next.js Client Components

## Global Constraints

- Do not deploy.
- Do not change skill proc chances, damage, crossover values, saved pattern JSON, or permanent player data.
- Preserve unrelated working-tree changes.

---

### Task 1: Preserve alternation across failed casts

**Files:**
- Modify: `src/adventure/v2/combat/combatPattern.ts`
- Modify: `src/adventure/v2/combat/combatShared.ts`
- Modify: `src/adventure/v2/combat/engineState.ts`
- Modify: `src/adventure/v2/combat/engine.ts`
- Modify: `src/adventure/v2/combat/engine-pvp.ts`
- Test: `src/adventure/v2/combat/combatPattern.test.ts`
- Test: `src/adventure/v2/combat/combatPatternCast.test.ts`
- Test: `src/adventure/v2/combat/atbSkillCast.test.ts`

**Interfaces:**
- Consumes: ordered `alternate` actions and optional per-pair last-success maps.
- Produces: a successful-cast transition `{ key: string; skillId: string }` applied to ephemeral battle stacks.

- [x] **Step 1: Write failing tests**

Add literal assertions proving an initial pair selects A, an A success selects B next, a B proc failure leaves B selected, and the following successful attempt advances back to A. Add a PvE caller test reproducing the former `A → B → 평타 → B → A` sequence and expecting `A → B → 평타 → A → B`.

- [x] **Step 2: Verify RED**

Run: `npm test -- src/adventure/v2/combat/combatPattern.test.ts src/adventure/v2/combat/combatPatternCast.test.ts src/adventure/v2/combat/atbSkillCast.test.ts`

Expected: the new assertions fail because selection still uses global turn parity and no successful-cast transition exists.

- [x] **Step 3: Implement pair-scoped battle state**

Add an optional last-success map to pattern context and PvE/PvP battle stacks. Attach an alternation key to alternate candidates, emit a transition only after the proc gate selects that candidate, preserve it across any tier-7 rerun, and merge it into the correct side's battle state.

- [x] **Step 4: Verify GREEN**

Run the Step 2 command and confirm every test passes.

### Task 2: Align user guidance and complete verification

**Files:**
- Modify: `src/adventure/v2/V2CombatPatternView.tsx`
- Modify: `src/app/manual/content/skills.tsx`
- Test: `src/adventure/v2/V2CombatPatternView.test.tsx`
- Test: `src/app/manual/current-content.test.tsx`

**Interfaces:**
- Consumes: sticky alternation behavior from Task 1.
- Produces: UI/manual wording that explains advance-on-success semantics.

- [x] **Step 1: Write failing copy tests**

Assert that both surfaces state that failed/unavailable casts keep the current A/B turn.

- [x] **Step 2: Verify RED, update copy, and verify GREEN**

Run: `npm test -- src/adventure/v2/V2CombatPatternView.test.tsx src/app/manual/current-content.test.tsx`

- [x] **Step 3: Run scoped regression and static checks**

Run the relevant combat-pattern, PvE, PvP, UI, and manual tests. Then run ESLint on changed source/test files, `npx tsc --noEmit`, and `git diff --check`.

- [x] **Step 4: Commit scoped files**

Stage only the plan, design, implementation, and tests for this fix and commit with `fix: preserve alternating skill order`.
