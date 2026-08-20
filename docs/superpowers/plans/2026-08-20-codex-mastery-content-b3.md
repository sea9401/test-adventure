# Codex Mastery Content B3 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Do not delegate unless the user explicitly requests subagents.

**Goal:** Connect direct equipment acquisitions, completed cooking quantities, and life-field region/environment/discovery observations to permanent codex mastery without changing rewards or responses.

**Architecture:** Extend the existing transactional gameplay adapter with equipment, cooking, and life events. Submit equipment events only from source-aware success paths; merge cooking and existing job events in the cooking transaction; derive life mastery deltas once in the shared life-field success hook, including KST-distinct environment days.

**Tech Stack:** TypeScript, Vitest, Drizzle ORM, PostgreSQL transactions, Next.js 16.2 Route Handlers.

## Global Constraints

- Work only on `feat/codex-mastery-gameplay-integration-20260820` in `/tmp/test-adventure-codex-mastery-gameplay`.
- Do not merge, push, deploy, run a production migration, enable an operations switch, or execute a real backfill with `--apply`.
- Keep `recordingEnabled` and `sealsEnabled` defaulted to `false`; do not submit `sealIds`.
- Record in the same transaction as the successful game action and propagate recorder failures.
- Do not change SP, combat values, gold, items, response fields, or existing codex completion rewards.
- Do not count failures, retries, purchases, trades, mail, warehouse movement, returns, quest rewards, starter gear, or admin/developer grants.
- B3 does not implement special seals, trophies, UI, rankings, housing, or monthly research.
- Follow `node_modules/next/dist/docs/01-app/01-getting-started/15-route-handlers.md` and `node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/route.md` for route changes.

---

### Task 1: Extend the adapter and centralize life-field mastery deltas

**Files:**
- Modify: `src/lib/server/codexMasteryGameplay.ts`
- Modify: `src/lib/server/codexMasteryGameplay.test.ts`
- Modify: `src/lib/server/lifeFieldProgress.ts`
- Create: `src/lib/server/lifeFieldProgress.test.ts`

**Interfaces:**
- Adds `equipment`, `cooking`, and `life` variants to `CodexMasteryGameplayEvent`.
- Produces `codexMasteryLifeEvents(before, after, args)` as a pure semantic-delta helper.
- Narrows `recordLifeFieldSuccessInTx` to `DbTransactionExecutor` and records after the life save.

- [ ] **Step 1: Write adapter RED tests**

Add one mixed batch containing duplicate equipment drop, equipment craft, cooking, and life events. Assert aggregation,
stable order, exact sources, `discovered: true`, and no `bestValue` outside fish. Run:

```bash
npm test -- src/lib/server/codexMasteryGameplay.test.ts
```

Expected: type/test failure because the new event variants are absent.

- [ ] **Step 2: Implement and verify the adapter extension**

Add the exact three event variants and category-specific `inputFor` branches without unsafe source casts. Preserve existing
validation and aggregation semantics. Run the adapter and central service tests.

- [ ] **Step 3: Write life-field semantic RED tests**

Test through `recordLifeFieldSuccessInTx` with an injected/mocked save store and mastery recorder:

- one success emits region 1 and environment 1;
- a second session on the same KST day emits only region 1;
- a session on the next KST day emits region 1 and environment 1;
- `successes = 7` emits region 7 but environment 1;
- a completed trace emits the exact discovery record delta 1;
- duplicate session and zero successes emit no mastery event.

Run: `npm test -- src/lib/server/lifeFieldProgress.test.ts`.

Expected: FAIL because the shared hook does not record mastery.

- [ ] **Step 4: Implement life-field delta recording**

Use `lifeFieldRegionRecordId`, `lifeFieldEnvironmentRecordId`, and `lifeFieldDiscoveryRecordId`. Region and discovery
amounts are after-minus-before record counts. Environment amount is one only when the previous `lastAt` has a different
`lifeFieldDayKey` from `args.now`. Save the life state first, call one gameplay batch second, and do neither for a
duplicate. Do not submit an empty batch.

- [ ] **Step 5: Verify and commit**

```bash
npm test -- src/lib/server/codexMasteryGameplay.test.ts src/lib/server/codexMasteryService.test.ts src/lib/server/lifeFieldProgress.test.ts src/adventure/v2/lifeFieldRecords.test.ts src/lib/server/fishingReelRoute.test.ts src/lib/server/miningRoute.test.ts src/lib/server/woodcuttingRoute.test.ts
npx tsc --noEmit
git add src/lib/server/codexMasteryGameplay.ts src/lib/server/codexMasteryGameplay.test.ts src/lib/server/lifeFieldProgress.ts src/lib/server/lifeFieldProgress.test.ts
git commit -m "feat: connect life field codex mastery"
```

### Task 2: Record completed cooking quantities

**Files:**
- Modify: `src/app/api/v2/cooking/route.ts`
- Modify: `src/app/api/v2/cooking/route.test.ts`

**Interfaces:**
- Consumes the existing gameplay batch recorder.
- Produces `cooking.complete` only for `action === "cook"`, using `recipe.id` and authoritative `quantity`.

- [ ] **Step 1: Write cooking RED tests**

Update the successful cooking test to expect one batch containing the cooking event and any existing job event. Add a
multi-quantity assertion and prove `order` and `standing_delivery` do not submit a cooking event. Run the route test and
observe the missing event failure.

- [ ] **Step 2: Merge cooking and job events**

Build one `CodexMasteryGameplayEvent[]` after all authoritative saves. Add the cooking event for `cook`, add the job event
only when actual mastery increased, and call the recorder once when the array is nonempty.

- [ ] **Step 3: Verify and commit**

```bash
npm test -- src/app/api/v2/cooking/route.test.ts src/lib/server/codexMasteryGameplay.test.ts
npx tsc --noEmit
git add src/app/api/v2/cooking/route.ts src/app/api/v2/cooking/route.test.ts
git commit -m "feat: connect cooking codex mastery"
```

### Task 3: Record hunting and storm-expedition equipment drops

**Files:**
- Modify: `src/app/api/v2/dungeon/hunt/route.ts`
- Modify: `src/lib/server/huntRoute.test.ts`
- Modify: `src/app/api/v2/storm-expedition/route.ts`
- Modify: `src/lib/server/stormExpeditionRoute.test.ts`

**Interfaces:**
- Adds `droppedEquipment` and `droppedUnique` to the existing per-hunt mastery event collector.
- Records every `active.pendingEquipment` instance when pending rewards become owned.

- [ ] **Step 1: Write hunt-drop RED assertions**

Use deterministic drop fixtures to assert regular and unique equipment each produce one `equipment.drop` event. Assert
batch and offline collectors preserve one event per actual instance for adapter aggregation, while losses produce none.

- [ ] **Step 2: Append hunt equipment events**

After `rollHuntDrops` has produced and persisted `nextOwned`, append events for non-null `droppedEquipment` and
`droppedUnique` alongside the existing monster/job events. Reuse the existing single/batch/offline flush behavior.

- [ ] **Step 3: Write storm-claim RED assertions**

Mock the gameplay recorder in `stormExpeditionRoute.test.ts`. The existing return fixture with
`v2_storm_gale_bow` must submit exactly one drop event. A failed action or empty pending list must not submit an equipment
event.

- [ ] **Step 4: Record storm pending equipment on claim**

After character/equipment/unique-acquisition saves in `claimPendingRewards`, call one batch for every pending instance,
using `equipment.drop`. Skip the call when the list is empty.

- [ ] **Step 5: Verify and commit**

```bash
npm test -- src/lib/server/huntRoute.test.ts src/lib/server/offlineSettle.test.ts src/lib/server/stormExpeditionRoute.test.ts
npx tsc --noEmit
git add src/app/api/v2/dungeon/hunt/route.ts src/lib/server/huntRoute.test.ts src/app/api/v2/storm-expedition/route.ts src/lib/server/stormExpeditionRoute.test.ts
git commit -m "feat: connect equipment drop codex mastery"
```

### Task 4: Record cooperative rewards and guild-workshop crafting

**Files:**
- Modify: `src/app/api/v2/me/use-coop-equipment-box/route.ts`
- Create: `src/lib/server/useCoopEquipmentBoxRoute.test.ts`
- Modify: `src/app/api/v2/coop/claim/route.ts`
- Create: `src/lib/server/coopClaimCodexMasteryRoute.test.ts`
- Modify: `src/app/api/v2/guild/workshop/route.ts`
- Create: `src/lib/server/guildWorkshopCodexMasteryRoute.test.ts`

**Interfaces:**
- Records the authoritative rolled box item and new coop signature unique as `equipment.drop`.
- Records the created guild-workshop equipment as `equipment.craft`.

- [ ] **Step 1: Write equipment-box RED tests**

Use an in-memory save/transaction harness and deterministic RNG. Assert a successful box use records the response
equipment ID exactly once; `no_box` and bad IDs do not record.

- [ ] **Step 2: Wire equipment-box success**

Call the recorder after character and equipment writes, before returning the success body.

- [ ] **Step 3: Write coop-claim RED tests**

Use a focused transaction/Drizzle-chain harness with deterministic reward rolls. Assert a newly granted `uniqueId`
records once, an already-claimed retry records zero times, and a valid claim without a unique records no equipment event.

- [ ] **Step 4: Wire coop-claim success**

After equipment and unique-achievement persistence, submit the new `uniqueId` when non-null. Keep the call before the
contributor claim transaction returns so failure rolls back all reward writes.

- [ ] **Step 5: Write guild-workshop RED test**

Use the route's association-mode harness to complete one deterministic recipe. Assert `recipe.equipmentId`, amount 1,
and `equipment.craft`. Insufficient-material and validation failures do not record.

- [ ] **Step 6: Wire guild-workshop craft success**

After character, equipment, crafting, unique-acquisition, and guild activity saves, submit exactly one craft event before
returning. Do not hook dismantle, delivery, warehouse, or marketplace flows.

- [ ] **Step 7: Verify and commit**

```bash
npm test -- src/lib/server/useCoopEquipmentBoxRoute.test.ts src/lib/server/coopClaimCodexMasteryRoute.test.ts src/lib/server/guildWorkshopCodexMasteryRoute.test.ts
npx tsc --noEmit
git add src/app/api/v2/me/use-coop-equipment-box/route.ts src/lib/server/useCoopEquipmentBoxRoute.test.ts src/app/api/v2/coop/claim/route.ts src/lib/server/coopClaimCodexMasteryRoute.test.ts src/app/api/v2/guild/workshop/route.ts src/lib/server/guildWorkshopCodexMasteryRoute.test.ts
git commit -m "feat: connect equipment reward codex mastery"
```

### Task 5: Audit exclusions, verify B3, and preserve phase isolation

**Files:**
- Modify only if verification exposes a B3 defect.

- [ ] **Step 1: Audit equipment creation and movement sites**

Search all production `appendEquipInstances`, `mintRolledEquipInstance`, and direct `equipment.v2` append sites. Confirm
only hunt, storm claim, coop claim/box, and guild workshop craft have B3 events. Confirm shop, marketplace, mail/inbox,
guild warehouse, quest, admin, dev, starter, cancel, expiry, and dismantle remain unconnected.

- [ ] **Step 2: Run the complete focused suite**

Run all adapter, foundation, life-field, fishing/mining/woodcutting, cooking, hunt/offline, storm, coop, and workshop tests
together. Expected: zero failures.

- [ ] **Step 3: Run static and build verification**

```bash
npx tsc --noEmit
npx eslint <all B3 changed TypeScript files>
npm run codex-mastery:budget
npm run build
```

Expected: all exit zero and image validation reports no missing references.

- [ ] **Step 4: Run the full test suite once**

Run `npm test`. If known simulation timeouts occur only under parallel load, rerun those exact files alone and report
both results. Do not change unrelated balance tests.

- [ ] **Step 5: Verify prohibited actions and branch isolation**

Confirm both worktrees are clean, feature defaults remain false, the Phase A hold commit remains isolated from the current
deployment branch, neither the active B branch nor its Phase A ancestor is an ancestor of
`fix/life-field-focus-refresh-20260815`, and no deploy, push, merge, real `--apply`, or operations-setting write occurred.

- [ ] **Step 6: Commit verification fixes only if needed**

Use a focused `fix:` commit for any defect exposed by verification. Preserve this branch and `/tmp` worktree for the next
bundle.
