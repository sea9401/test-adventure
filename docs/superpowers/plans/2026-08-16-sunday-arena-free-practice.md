# Sunday Arena Free Practice Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Sunday tournament-phase arena practice matches consume zero stamina while preserving weekday costs, cooldowns, rate limits, match counts, and battle history.

**Architecture:** Add one phase-aware stamina-cost helper beside the existing arena cost functions and use it from both arena state and match route handlers. Keep the existing match settlement flow intact; a zero cost passes through the existing stamina regeneration/consumption helper without reducing stamina. Update the client copy to present Sunday practice as free.

**Tech Stack:** TypeScript, Next.js App Router route handlers, React, Vitest

## Global Constraints

- Do not deploy.
- Preserve the 10-second arena cooldown and the existing high-cost rate limit.
- Continue recording Sunday practice match counts, history, and replays.
- Do not modify or stage unrelated working-tree changes.

---

### Task 1: Phase-aware arena stamina policy

**Files:**
- Modify: `src/lib/server/arena.test.ts`
- Modify: `src/lib/server/arena.ts`

**Interfaces:**
- Consumes: `ArenaState`, `ArenaSeasonPhase`, and the existing `arenaNextStaminaCost` calculation.
- Produces: `arenaStaminaCostForPhase(state, phase, now): number`.

- [x] Add failing tests proving tournament-phase practice costs `0` after any number of matches and ranked/closed phases keep the existing escalating cost.
- [x] Run `npm test -- src/lib/server/arena.test.ts` and confirm the new tests fail because the helper is missing.
- [x] Implement `arenaStaminaCostForPhase` with a tournament-only zero-cost branch.
- [x] Run `npm test -- src/lib/server/arena.test.ts` and confirm it passes.

### Task 2: Apply the policy to APIs and UI

**Files:**
- Modify: `src/app/api/v2/arena/state/route.ts`
- Modify: `src/app/api/v2/arena/match/route.ts`
- Modify: `src/adventure/v2/V2ArenaView.tsx`

**Interfaces:**
- Consumes: `arenaStaminaCostForPhase` from Task 1.
- Produces: API responses whose `nextStaminaCost` and successful match `staminaCost` are `0` during the tournament phase, plus Sunday UI copy that says the practice match is free.

- [x] Replace direct arena cost calls in the state route, match preflight, and match response with `arenaStaminaCostForPhase`.
- [x] Change the Sunday challenge button and stamina rule copy to communicate a free practice match while leaving weekday copy unchanged.
- [x] Run the focused arena test and lint all modified TypeScript/TSX files.

### Task 3: Verify and commit

**Files:**
- Verify only the files listed above and this plan document.

**Interfaces:**
- Consumes: completed Tasks 1 and 2.
- Produces: a verified local commit without deployment.

- [x] Run `npm test -- src/lib/server/arena.test.ts src/lib/server/highCostRateLimit.test.ts`.
- [x] Run `npx eslint src/lib/server/arena.ts src/lib/server/arena.test.ts src/app/api/v2/arena/state/route.ts src/app/api/v2/arena/match/route.ts src/adventure/v2/V2ArenaView.tsx`.
- [x] Run `npx tsc --noEmit`.
- [x] Review `git diff --check`, the scoped diff, and staged file list.
- [ ] Commit only the scoped files with a Korean conventional commit message.
