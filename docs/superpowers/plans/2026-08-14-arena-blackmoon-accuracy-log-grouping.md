# Arena Blackmoon Accuracy and Log Grouping Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make 암월난무 accuracy reduction functional and visible in Arena, and keep shield/mana-shield defense rows inside the triggering attack action.

**Architecture:** Mirror the established PvE accuracy-debuff lifecycle in `PvPSideStacks`, and centralize effective PvP accuracy so basic attacks, skills, and the public evasion helper cannot drift. Extend the battle-log action-opening classifier for defense rows without changing raw combat-log ordering.

**Tech Stack:** TypeScript, Vitest, React server rendering tests

## Global Constraints

- Preserve the skill's existing 28% and 3-action values.
- Apply the debuff to both basic attacks and active skills.
- Do not alter shield or mana-shield damage resolution.
- Do not cross battle-log action boundaries when grouping defense rows.

---

### Task 1: Arena accuracy reduction lifecycle

**Files:**
- Create: `src/adventure/v2/combat/pvpAccuracyDown.test.ts`
- Modify: `src/adventure/v2/combat/engine-pvp.ts`
- Modify: `src/adventure/v2/combat/engine.pvpPhase.ts`

**Interfaces:**
- Consumes: `V2SkillCastResult.enemyAccuracyDownToApply`
- Produces: `PvPSideStacks.accuracyDownPct`, `PvPSideStacks.accuracyDownTurns`, and one shared effective-accuracy calculation used by PvP damage reduction paths

- [ ] **Step 1: Write failing tests**

Add real-engine tests that cast `v2c_blackmoon_flurry`, assert the target stores `{ accuracyDownPct: 28, accuracyDownTurns: 3 }`, assert the application log exists, compare basic and skill damage with/without the stored debuff, and assert three affected-side action hooks reduce the duration to zero.

- [ ] **Step 2: Run tests to verify RED**

Run: `npm test -- src/adventure/v2/combat/pvpAccuracyDown.test.ts`

Expected: FAIL because the PvP stack fields, log, and damage effect do not exist.

- [ ] **Step 3: Implement the minimal lifecycle**

Add the two stack fields and zero initialization. Add an exported helper that multiplies `accRating ?? accuracyPct ?? 0` by `1 - accuracyDownPct / 100` while active. Use it in `playerPvpEvasionReductionPct`, `advanceTurnPvP`, and the active-skill evasion calculation. Tick the duration with the existing affected-side debuffs, apply the cast result to the opponent stack, and append `[암월난무] <name> 적중도 −28% (3행동)`.

- [ ] **Step 4: Run tests to verify GREEN**

Run: `npm test -- src/adventure/v2/combat/pvpAccuracyDown.test.ts`

Expected: PASS.

### Task 2: Shield and mana-shield action grouping

**Files:**
- Modify: `src/adventure/battle/BattleLogList.tsx`
- Modify: `src/adventure/battle/BattleLogList.test.tsx`

**Interfaces:**
- Consumes: parsed leading labels `철벽` and `마나 실드`
- Produces: pending action effects that attach to the next direct action until an explicit boundary

- [ ] **Step 1: Write failing tests**

Add one case with `[철벽]` immediately before a multi-hit 암월난무 row and one case with mana-shield deployment/block rows before 암월난무. Assert each result is one action whose `effects` contain the defense rows.

- [ ] **Step 2: Run tests to verify RED**

Run: `npm test -- src/adventure/battle/BattleLogList.test.tsx`

Expected: FAIL because defense rows without an earlier damage-calculation row are standalone entries.

- [ ] **Step 3: Implement the minimal grouping rule**

Recognize `철벽` and `마나 실드` as action-opening defense effects, queue them in `pendingEffects`, and rely on existing boundary flushing and direct-action attachment.

- [ ] **Step 4: Run tests to verify GREEN**

Run: `npm test -- src/adventure/battle/BattleLogList.test.tsx`

Expected: PASS.

### Task 3: Verification and commit

**Files:**
- Verify all files from Tasks 1 and 2

**Interfaces:**
- Consumes: completed regression tests and implementation
- Produces: verified local commit

- [ ] **Step 1: Run focused tests**

Run: `npm test -- src/adventure/v2/combat/pvpAccuracyDown.test.ts src/adventure/battle/BattleLogList.test.tsx src/adventure/battle/engine-pvp.test.ts`

Expected: all selected test files pass.

- [ ] **Step 2: Run type checking**

Run: `npx tsc --noEmit`

Expected: exit code 0.

- [ ] **Step 3: Review the diff**

Run: `git diff --check` and `git diff --stat`.

Expected: no whitespace errors and only scoped files changed.

- [ ] **Step 4: Commit scoped changes**

Run: `git add docs/superpowers/specs/2026-08-14-arena-blackmoon-accuracy-log-grouping-design.md docs/superpowers/plans/2026-08-14-arena-blackmoon-accuracy-log-grouping.md src/adventure/v2/combat/pvpAccuracyDown.test.ts src/adventure/v2/combat/engine-pvp.ts src/adventure/v2/combat/engine.pvpPhase.ts src/adventure/battle/BattleLogList.tsx src/adventure/battle/BattleLogList.test.tsx && git commit -m "fix: apply arena accuracy debuffs and group defense logs"`

Expected: one commit containing only this bug fix and its documentation.
