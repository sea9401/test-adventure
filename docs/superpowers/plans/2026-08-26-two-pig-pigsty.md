# Two-Pig Pigsty Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the abstract two-shipment queue with two real pig positions that fatten independently for 12 hours at half the per-pig cost and reward.

**Architecture:** Ranch save version 3 adds `shipmentStartedAt` to each slot. Pig settlement moves only elapsed timestamps into ready pigs, while recurring chicken and cow production keeps the existing feed/progress engine. Version 1 and 2 pig value is migrated into two version 3 pigs so paid feed and completed rewards are preserved.

**Tech Stack:** TypeScript, React 19, Next.js 16 App Router, Vitest, Tailwind CSS.

## Global Constraints

- Do not deploy or change maintenance mode.
- Preserve unrelated dirty combat files and stage only ranch-related files.
- Keep opaque `SURFACE_CARD` and `SURFACE_INSET` backgrounds.
- Write and observe failing behavior tests before production changes.
- A pig costs 2 compound feed, takes 12 hours, yields 4 pork and 8 farming XP, and a pigsty holds at most 2 active-or-ready pigs.
- Construction and rebuilding include exactly one first pig.

---

### Task 1: Version 3 independent pig state

**Files:**
- Modify: `src/adventure/v2/ranch.test.ts`
- Modify: `src/adventure/v2/ranch.ts`

**Interfaces:**
- Produces: `RanchSlotState.shipmentStartedAt: number[]`.
- Produces: `RanchState.version: 3`.
- Preserves: `parseRanchState`, `settleRanch`, `addRanchFeed`, `collectRanchProducts`, `unlockRanchSlot`, and `rebuildRanchSlot` signatures.

- [ ] **Step 1: Write failing independent-timer and migration tests**

Add literal assertions covering this sequence: construct one pig at `1_000`, add a second with 2 feed at `1_000 + 6 * HOUR`, settle at 12 hours to get one ready pig and one active pig, settle at 18 hours to get two ready pigs, collect 8 pork and 16 XP, and reject a third pig while two positions are occupied. Add version 2 fixtures proving `feed: 4` migrates to two active timestamps and `readyCycles: 1, readyItems: 8` migrates to two ready pigs.

- [ ] **Step 2: Run the ranch test and verify RED**

Run: `npm test -- src/adventure/v2/ranch.test.ts --maxWorkers=1`

Expected: FAIL because the save is version 2, pig feed costs 4, and no independent timestamps exist.

- [ ] **Step 3: Implement the version 3 state and migration**

Add `shipmentStartedAt` to `RanchSlotState`, return version 3 from empty and parsed states, accept versions 2 and 3 in `parseRanchState`, and normalize pig timestamps separately from recurring feed. For version 1 and 2 pig slots, convert old paid or ready value into two new pigs as specified in the design. Set pig definition values to `feedPerCycle: 2`, `feedCapacity: 4`, `outputAmount: 4`, and `xpPerCycle: 8`.

- [ ] **Step 4: Implement independent settlement and capacity**

Branch shipment animals in `settleRanch`: partition `shipmentStartedAt` by `startedAt + cycleMs <= now`, preserve unfinished timestamps, and increment ready values by the completed count. In `addRanchFeed`, append `now` for one pig without storing feed and reject total occupancy 2. Start one timestamp on construction and pig rebuild, include timestamps in the rebuild-empty check, and leave active timestamps untouched during collection.

- [ ] **Step 5: Run the ranch test and verify GREEN**

Run: `npm test -- src/adventure/v2/ranch.test.ts --maxWorkers=1`

Expected: all ranch tests pass.

### Task 2: Farm economy and two-position UI

**Files:**
- Modify: `src/adventure/v2/farm.test.ts`
- Modify: `src/adventure/v2/FarmRanchPanel.test.tsx`
- Modify: `src/adventure/v2/FarmRanchPanel.tsx`

**Interfaces:**
- Consumes: `RanchSlotState.shipmentStartedAt` and the version 3 ranch functions.
- Preserves: `FarmRanchPanel` props and farm route payloads.

- [ ] **Step 1: Write failing farm and rendered UI tests**

Change the farm integration fixture to spend exactly 2 compound feed for the second pig and assert one completed pig grants `{ pork: 4 }` and 8 XP. Render a pigsty with one ready timestamp and one six-hour active timestamp and assert `돼지 1`, `돼지 2`, `출하 대기`, `6시간`, `돼지고기 4개 / 마리`, and `돼지우리 가득 참`.

- [ ] **Step 2: Run farm and UI tests and verify RED**

Run: `npm test -- src/adventure/v2/farm.test.ts src/adventure/v2/FarmRanchPanel.test.tsx --maxWorkers=1`

Expected: FAIL because the existing UI displays aggregate queued cycles and the old cost/reward.

- [ ] **Step 3: Render two independent pig positions**

For shipment animals, derive active positions from sorted `shipmentStartedAt`, append ready positions, and fill remaining capacity with empty positions. Render two opaque `SURFACE_CARD` rows. Show each active pig's remaining duration from its own timestamp, show ready and empty labels, and change the action button to consume 2 feed for one empty position or display `돼지우리 가득 참` at capacity.

- [ ] **Step 4: Run farm, UI, route, and ranch tests and verify GREEN**

Run: `npm test -- src/adventure/v2/ranch.test.ts src/adventure/v2/farm.test.ts src/adventure/v2/FarmRanchPanel.test.tsx src/lib/server/ranchRoutes.test.ts --maxWorkers=1`

Expected: all selected tests pass.

### Task 3: Player documentation and complete verification

**Files:**
- Modify: `src/app/manual/content/pastimes.tsx`
- Modify: `docs/patch-notes/2026-08-26-life-chat-and-battle-follow-up.md`

**Interfaces:**
- Consumes: the final pig definition constants.
- Produces: current player-facing explanation of two real pig positions.

- [ ] **Step 1: Update current documentation**

Describe a two-pig maximum, independent 12-hour fattening, 2 feed per added pig, 4 pork and 8 XP per shipment, and one included first pig. Remove wording about abstract two-cycle reservation or storage. Do not rewrite historical patch notes or older design documents.

- [ ] **Step 2: Run focused static verification**

Run: `npm test -- src/app/manual/current-content.test.tsx --maxWorkers=1`

Run: `npx tsc --noEmit`

Run: `npx eslint src/adventure/v2/ranch.ts src/adventure/v2/ranch.test.ts src/adventure/v2/farm.test.ts src/adventure/v2/FarmRanchPanel.tsx src/adventure/v2/FarmRanchPanel.test.tsx src/app/manual/content/pastimes.tsx`

Run: `npm run check-images`

Expected: every command exits 0.

- [ ] **Step 3: Run complete regression verification**

Run: `npm test -- --maxWorkers=4`

Run: `npm run build`

Expected: the complete suite and Next.js production build exit 0.

- [ ] **Step 4: Review and commit only ranch changes**

Run: `git diff --check`

Run: `git status --short`

Stage only the two design/plan documents, ranch engine/tests, farm/UI tests, manual, and current patch note. Commit with `feat: support two pigs per pigsty`. Leave unrelated combat changes untouched.
