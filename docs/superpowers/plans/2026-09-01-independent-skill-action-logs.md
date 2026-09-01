# Independent Skill Action Logs Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Render every successful active-skill cast as exactly one independent battle action card.

**Architecture:** Add optional structured skill-cast metadata to battle log entries and emit one marker at every PvE/PvP cast boundary. Teach the existing action grouper to create a placeholder action from the marker and replace it with a concrete damage/recovery headline when one follows.

**Tech Stack:** TypeScript, React, Next.js App Router, Vitest, React static rendering

## Global Constraints

- Do not change combat calculations or action selection.
- Preserve old logs that do not contain the new optional metadata.
- Do not turn passives, equipment triggers, reactions, or status ticks into active-skill cards.
- Cover PvE player, PvE monster ATB/legacy, and PvP cast paths.

---

### Task 1: Battle-log grouping contract

**Files:**
- Modify: `src/adventure/v2/combat/engineState.ts`
- Modify: `src/adventure/battle/BattleLogList.tsx`
- Test: `src/adventure/battle/BattleLogList.test.tsx`

**Interfaces:**
- Consumes: `BattleLogEntry.skillCast?: { skillId: string; skillName: string }`
- Produces: one `BattleLogDisplayItem` action per cast marker, merged with a matching concrete action result

- [ ] Add failing tests for shield-only, consecutive utility, and ordinary damaging casts.
- [ ] Run `npm test -- src/adventure/battle/BattleLogList.test.tsx` and confirm the new assertions fail because markers are not recognized.
- [ ] Add the optional metadata type and marker-aware grouping.
- [ ] Re-run the focused test and confirm it passes.

### Task 2: Engine marker emission

**Files:**
- Modify: `src/adventure/v2/combat/engine.ts`
- Modify: `src/adventure/v2/combat/engine-pvp.ts`
- Test: `src/adventure/v2/combat/engine.test.ts`
- Test: `src/adventure/v2/combat/engine-pvp.test.ts`

**Interfaces:**
- Consumes: successful `V2SkillCastResult` with non-null `castSkillId` and `castSkillName`
- Produces: an actor-tagged `info` entry carrying `skillCast` before cast effect rows

- [ ] Add failing representative tests for PvE player, PvE monster, and PvP marker emission.
- [ ] Run focused engine tests and confirm failure because no marker exists.
- [ ] Emit markers in PvE player, PvE monster ATB/legacy, and PvP cast paths.
- [ ] Re-run focused engine tests and confirm they pass.

### Task 3: Regression verification

**Files:**
- Verify all modified files

**Interfaces:**
- Consumes: completed tasks 1 and 2
- Produces: verified behavior without combat-result changes

- [ ] Run the BattleLogList, PvE engine, PvP engine, ATB, and multi-hit suites.
- [ ] Run TypeScript checking and lint on changed files.
- [ ] Review the diff for accidental combat or layout changes.
- [ ] Commit the implementation and tests.
