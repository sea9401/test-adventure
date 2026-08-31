# Storm Expedition Practice Mode Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a persistent, reward-free storm expedition practice mode that uses the same nine-node combat and choice flow without consuming daily attempts or changing progression records.

**Architecture:** Persist `mode` on the server-owned active expedition and default legacy saves to `normal`. Reuse the current start, fight, choice, risk, replay, and checkpoint flow, but branch at the economic boundaries so practice never rolls or settles rewards and never updates clears or SP-fruit pity. The client exposes separate real/practice entry actions and derives all in-run messaging from the persisted active mode.

**Tech Stack:** Next.js 16.2 Route Handlers and Client Components, React 19, TypeScript, Vitest

## Global Constraints

- Do not deploy to any environment.
- Practice uses the existing unlock requirement and the exact normal expedition combat/choice rules.
- Practice must not consume attempts or create/change gold, materials, equipment, SP fruit, clears, pity, quests, achievements, or economic records.
- Existing active saves without `mode` must parse as `normal`.
- The server-persisted active mode is authoritative; fight and choice requests do not choose their own mode.
- Use opaque UI surfaces from `src/components/ui/surfaces.ts`.
- Preserve unrelated worktree changes.

---

### Task 1: Persist the expedition mode

**Files:**
- Modify: `src/adventure/data/v2/stormExpedition.ts`
- Test: `src/adventure/data/v2/stormExpedition.test.ts`

**Interfaces:**
- Produces: `StormExpeditionMode = "normal" | "practice"`
- Produces: `StormExpeditionActive.mode: StormExpeditionMode`

- [ ] **Step 1: Write parsing tests**

Add cases asserting that an active save with `mode: "practice"` retains it and an old active save without a mode returns `mode: "normal"`.

- [ ] **Step 2: Run the focused test and verify RED**

Run: `npm test -- src/adventure/data/v2/stormExpedition.test.ts`

Expected: FAIL because parsed active expeditions do not expose `mode`.

- [ ] **Step 3: Implement mode parsing**

Add the mode union, required active field, and strict parser that accepts only `practice`; all other or missing values become `normal`.

- [ ] **Step 4: Run the focused test and verify GREEN**

Run: `npm test -- src/adventure/data/v2/stormExpedition.test.ts`

Expected: PASS.

### Task 2: Enforce reward-free practice on the server

**Files:**
- Modify: `src/app/api/v2/storm-expedition/route.ts`
- Test: `src/lib/server/stormExpeditionRoute.test.ts`

**Interfaces:**
- Consumes: `PostInput.mode?: unknown` only during `action: "start"`
- Produces: status `state.active.mode`, `practiceEnded?: boolean`, `practiceCompleted?: boolean`, `practice?: boolean`

- [ ] **Step 1: Write failing practice start tests**

Add route tests showing that `start` with `mode: "practice"` succeeds with zero attempts remaining, stores `active.mode: "practice"`, and does not increment `attemptsUsed`; invalid modes return `invalid_mode`.

- [ ] **Step 2: Run the route test and verify RED**

Run: `npm test -- src/lib/server/stormExpeditionRoute.test.ts`

Expected: FAIL because start ignores practice mode and still consumes or rejects attempts.

- [ ] **Step 3: Implement practice start**

Validate `mode` on start, default omitted mode to `normal`, bypass only the attempt limit/consumption for practice, and persist the chosen mode on the new active run.

- [ ] **Step 4: Write failing practice economy tests**

Add route tests proving a successful practice fight does not call loot rolling or mint equipment, stores no pending rewards, and a practice risk cache applies its combat penalty without adding materials.

- [ ] **Step 5: Run the route test and verify RED**

Run: `npm test -- src/lib/server/stormExpeditionRoute.test.ts`

Expected: FAIL because normal reward generation still runs.

- [ ] **Step 6: Block reward generation in practice**

Keep combat, HP/MP, boons, encounter advancement, and penalties shared. Set battle reward and drops to zero/empty without invoking reward or equipment generation; suppress the economic benefit of reward-oriented risk events.

- [ ] **Step 7: Write failing practice exit and completion tests**

Assert that practice `withdraw` works before any kill and while `risk_enemy_fury` is pending, clears only the active run, and returns `practiceEnded`. Assert that practice final-boss victory leaves character/equipment/attempts/clears/pity/obtained unchanged, returns `practiceCompleted`, and never claims rewards.

- [ ] **Step 8: Run the route test and verify RED**

Run: `npm test -- src/lib/server/stormExpeditionRoute.test.ts`

Expected: FAIL on the normal withdraw gates and completion settlement.

- [ ] **Step 9: Implement safe practice exit and completion**

Branch before normal withdraw validation for a practice active run. On practice final clear, clear `active` without reward roll, settlement, clear increment, or pity mutation.

- [ ] **Step 10: Run server tests and verify GREEN**

Run: `npm test -- src/adventure/data/v2/stormExpedition.test.ts src/lib/server/stormExpeditionRoute.test.ts`

Expected: PASS with normal expedition regressions intact.

### Task 3: Expose practice in the expedition UI

**Files:**
- Modify: `src/adventure/v2/V2StormExpeditionView.tsx`
- Create: `src/adventure/v2/stormExpeditionViewModel.ts`
- Test: `src/adventure/v2/stormExpeditionViewModel.test.ts`

**Interfaces:**
- Produces: `stormExpeditionEntryActions(attemptsLeft: number)` with separate normal/practice enabled states and labels
- Consumes: `active.mode`, `practiceEnded`, `practiceCompleted`, and `act("start", { routeId, mode })`

- [ ] **Step 1: Write failing entry-action tests**

Assert that normal entry disables at zero attempts while practice remains enabled and clearly states `입장 횟수 소모 없음 · 보상 없음`.

- [ ] **Step 2: Run the view-model test and verify RED**

Run: `npm test -- src/adventure/v2/stormExpeditionViewModel.test.ts`

Expected: FAIL because the view model does not exist.

- [ ] **Step 3: Implement the entry view model**

Return literal labels and enabled states used by every route card.

- [ ] **Step 4: Connect the client UI**

Replace the nested clickable route card with an opaque container containing `실전 출발` and `연습 시작` buttons. Pass mode only on start. During practice show persistent badges, replace the temporary-loot card with a no-reward practice card and unrestricted `연습 종료`, annotate drop/risk benefits as real-run previews, and show distinct practice end/completion messages without reward result cards.

- [ ] **Step 5: Run focused UI tests and lint**

Run: `npm test -- src/adventure/v2/stormExpeditionViewModel.test.ts`

Run: `npx eslint src/adventure/v2/V2StormExpeditionView.tsx src/adventure/v2/stormExpeditionViewModel.ts src/adventure/v2/stormExpeditionViewModel.test.ts`

Expected: PASS.

### Task 4: Verify and commit

**Files:**
- Modify: all files listed above
- Create: `docs/superpowers/plans/2026-08-12-storm-expedition-practice-mode.md`

**Interfaces:**
- Produces: one scoped implementation commit after fresh verification

- [ ] **Step 1: Run focused tests**

Run: `npm test -- src/adventure/data/v2/stormExpedition.test.ts src/lib/server/stormExpeditionRoute.test.ts src/adventure/v2/stormExpeditionViewModel.test.ts`

- [ ] **Step 2: Run TypeScript and scoped lint**

Run: `npx tsc --noEmit`

Run: `npx eslint src/adventure/data/v2/stormExpedition.ts src/adventure/data/v2/stormExpedition.test.ts src/app/api/v2/storm-expedition/route.ts src/lib/server/stormExpeditionRoute.test.ts src/adventure/v2/V2StormExpeditionView.tsx src/adventure/v2/stormExpeditionViewModel.ts src/adventure/v2/stormExpeditionViewModel.test.ts`

- [ ] **Step 3: Run the full test suite**

Run: `npm test`

- [ ] **Step 4: Review scoped diff and commit**

```bash
git diff --check -- src/adventure/data/v2/stormExpedition.ts src/adventure/data/v2/stormExpedition.test.ts src/app/api/v2/storm-expedition/route.ts src/lib/server/stormExpeditionRoute.test.ts src/adventure/v2/V2StormExpeditionView.tsx src/adventure/v2/stormExpeditionViewModel.ts src/adventure/v2/stormExpeditionViewModel.test.ts docs/superpowers/plans/2026-08-12-storm-expedition-practice-mode.md
git add docs/superpowers/plans/2026-08-12-storm-expedition-practice-mode.md src/adventure/data/v2/stormExpedition.ts src/adventure/data/v2/stormExpedition.test.ts src/app/api/v2/storm-expedition/route.ts src/lib/server/stormExpeditionRoute.test.ts src/adventure/v2/V2StormExpeditionView.tsx src/adventure/v2/stormExpeditionViewModel.ts src/adventure/v2/stormExpeditionViewModel.test.ts
git commit -m "feat: add storm expedition practice mode"
```
