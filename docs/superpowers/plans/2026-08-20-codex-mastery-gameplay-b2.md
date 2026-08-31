# Codex Mastery Gameplay B2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Connect server-authoritative fish catches, monster victories, and every production `jobCumLevel` gain to permanent codex mastery without changing existing rewards or responses.

**Architecture:** Add one transactional gameplay adapter that reads the codex feature switch once, aggregates events by category, stable entry ID, and source, then calls the existing central recorder. Existing success paths submit events only after their authoritative save transitions; online batches and offline settlement collect events in memory and flush once before commit.

**Tech Stack:** TypeScript, Vitest, Drizzle ORM, PostgreSQL transactions, Next.js 16.2 Route Handlers.

## Global Constraints

- Work only on `feat/codex-mastery-gameplay-integration-20260820` in `/tmp/test-adventure-codex-mastery-gameplay`.
- Do not merge, push, deploy, run a production migration, enable an operations switch, or execute a real backfill with `--apply`.
- Keep `recordingEnabled` and `sealsEnabled` defaulted to `false`.
- Record in the same transaction as the successful game action; never swallow a mastery error.
- Do not change existing SP, combat values, gold, items, response fields, or existing codex completion rewards.
- Do not record failures, cancellations, marketplace or mail transfers, development grants, or guessed historical values.
- B2 does not implement special seals, trophies, UI, rankings, or monthly research.

---

### Task 1: Add the transactional gameplay event adapter

**Files:**
- Create: `src/lib/server/codexMasteryGameplay.ts`
- Create: `src/lib/server/codexMasteryGameplay.test.ts`
- Modify: `src/lib/server/codexMasteryService.ts`
- Modify: `src/lib/server/codexMasteryService.test.ts`

**Interfaces:**
- Produces: `CodexMasteryGameplayEvent`, `CodexMasteryGameplayRecorderRuntime`, `createCodexMasteryGameplayRecorder(runtime)`, and `recordCodexMasteryGameplayBatch(executor, userId, events, now)`.
- Consumes: `readCodexMasteryFeatureSettings`, `CODEX_MASTERY_CATALOG`, and `recordCodexMastery`.

- [ ] **Step 1: Write failing source and aggregation tests**

Add service expectations for the exact job sources `job.activity`, `job.training`, and `job.consumable`. Add gameplay adapter tests with an injected runtime that prove:

```ts
await recorder("u1", [
  { category: "fish", entryId: "carp", amount: 1, bestValue: 80, source: "fishing.catch" },
  { category: "fish", entryId: "carp", amount: 2, bestValue: 90, source: "fishing.catch" },
  { category: "monster", entryId: "bat", amount: 3, source: "hunt.victory" },
  { category: "job", entryId: "warrior", amount: 4, source: "job.victory" },
], now);
```

produces one fish record with amount `3` and best value `90`, one monster record with amount `3`, and one job record with amount `4`, all with `discovered: true`. Verify deterministic category/entry/source ordering, disabled mode with zero record calls, zero-amount removal, safe-integer overflow rejection, and propagated recorder failures.

- [ ] **Step 2: Run tests and verify RED**

Run:

```bash
npm test -- src/lib/server/codexMasteryGameplay.test.ts src/lib/server/codexMasteryService.test.ts
```

Expected: FAIL because the gameplay module and new job sources do not exist.

- [ ] **Step 3: Implement the gameplay adapter**

Define the event union exactly as specified in the B2 design. `createCodexMasteryGameplayRecorder` must:

1. read settings once;
2. return an empty result when `recordingEnabled` is false;
3. validate positive safe-integer amounts and finite non-negative fish sizes;
4. aggregate with a safe-add guard by `category:entryId:source`;
5. keep the greatest fish `bestValue`;
6. sort deterministically;
7. call the injected recorder with `mutation: { amount, discovered: true, bestValue }` and the exact source.

The production runtime calls:

```ts
readCodexMasteryFeatureSettings(executor)
recordCodexMastery(executor, CODEX_MASTERY_CATALOG, input, settings, now)
```

Extend only the job source allowlist; keep existing fish, monster, and backfill sources unchanged.

- [ ] **Step 4: Run focused tests and type-check**

Run:

```bash
npm test -- src/lib/server/codexMasteryGameplay.test.ts src/lib/server/codexMasteryService.test.ts
npx tsc --noEmit
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/server/codexMasteryGameplay.ts src/lib/server/codexMasteryGameplay.test.ts src/lib/server/codexMasteryService.ts src/lib/server/codexMasteryService.test.ts
git commit -m "feat: record codex mastery gameplay events"
```

### Task 2: Connect ordinary and dangerous fishing

**Files:**
- Modify: `src/app/api/v2/fishing/reel/route.ts`
- Modify: `src/lib/server/fishingReelRoute.test.ts`
- Modify: `src/lib/server/dangerousFishingService.ts`
- Modify: `src/lib/server/dangerousFishingRoute.test.ts`

**Interfaces:**
- Consumes: `recordCodexMasteryGameplayBatch(tx, userId, events, now)`.
- Produces: successful ordinary catch events and fishing-job activity events; dangerous fishing produces only its fishing-job event because dangerous fish IDs are not in the ordinary fish catalog.

- [ ] **Step 1: Write failing ordinary-fishing wiring tests**

Mock `recordCodexMasteryGameplayBatch`. Assert a successful reel calls it once with:

```ts
[
  { category: "fish", entryId: "carp", amount: 1, bestValue: 42, source: "fishing.catch" },
  { category: "job", entryId: "fisher", amount: 1, source: "job.activity" },
]
```

and the same server `Date`. Assert missed, stale, and auto-activity-conflict requests make no call.

- [ ] **Step 2: Run the ordinary fishing test and verify RED**

Run: `npm test -- src/lib/server/fishingReelRoute.test.ts`

Expected: FAIL because the route does not submit mastery events.

- [ ] **Step 3: Wire ordinary fishing after all existing successful writes**

Build the fish event from the consumed server session. Append the job event only when `masteryJobId` is non-null and `masteryGained > 0`. Await the batch recorder before returning the existing response.

- [ ] **Step 4: Write and run the dangerous-fishing RED test**

In the existing deterministic caught-encounter test, assert a single `job.activity` event for `highestFishingJobId` and no ordinary fish event. Run:

```bash
npm test -- src/lib/server/dangerousFishingRoute.test.ts
```

Expected: FAIL because the service does not submit the job event.

- [ ] **Step 5: Wire dangerous fishing and verify both suites**

Narrow `actOnEncounterInTx` to a transaction executor and call the gameplay recorder only in the resolved `caught` branch after proficiency persistence. Run:

```bash
npm test -- src/lib/server/fishingReelRoute.test.ts src/lib/server/dangerousFishingRoute.test.ts
```

Expected: PASS with unchanged response snapshots.

- [ ] **Step 6: Commit**

```bash
git add src/app/api/v2/fishing/reel/route.ts src/lib/server/fishingReelRoute.test.ts src/lib/server/dangerousFishingService.ts src/lib/server/dangerousFishingRoute.test.ts
git commit -m "feat: connect fishing codex mastery"
```

### Task 3: Connect single, batch, and offline hunting

**Files:**
- Modify: `src/app/api/v2/dungeon/hunt/huntProficiency.ts`
- Modify: `src/app/api/v2/dungeon/hunt/huntProficiency.test.ts`
- Modify: `src/app/api/v2/dungeon/hunt/route.ts`
- Modify: `src/app/api/v2/me/offline-settle/route.ts`
- Modify: `src/lib/server/huntRoute.test.ts`
- Modify: `src/lib/server/offlineSettle.test.ts`

**Interfaces:**
- Produces: `HuntProficiencyResult.masteryJobId: string | null` and `RunOneHuntCtx.codexMasteryEvents?: CodexMasteryGameplayEvent[]`.
- Consumes: the gameplay batch recorder and the stable `enemy.key` selected by the hunt route.

- [ ] **Step 1: Write failing proficiency identity tests**

Assert a victorious warrior returns `masteryJobId: "warrior"`, a specialized job returns its concrete ID, lifestyle/no-job cases return `null`, and losses return `null` while preserving the existing `masteryAfter` readout.

- [ ] **Step 2: Run the proficiency test and verify RED**

Run: `npm test -- src/app/api/v2/dungeon/hunt/huntProficiency.test.ts`

Expected: FAIL because `masteryJobId` is absent.

- [ ] **Step 3: Return the exact credited job ID**

Set `masteryJobId` only in the same branch that calls `addJobCumLevel`; return it on every result path without changing existing mastery totals.

- [ ] **Step 4: Write failing hunt route tests**

Mock the gameplay recorder and verify:

- one successful single hunt flushes one `monster` event with the stable entry key and one `job.victory` event;
- a loss submits neither event;
- a successful `count > 1` request calls the recorder once after the loop and supplies exactly one monster event and one job event per completed win to the adapter;
- no response field changes.

- [ ] **Step 5: Add the hunt collector and online flush**

Create the two events after the proficiency result is known. If `ctx.codexMasteryEvents` exists, append to it; otherwise record immediately before returning. For online batches, allocate one array inside the transaction, pass it to every `runOneHunt`, persist the existing batch saves, then call the recorder once.

- [ ] **Step 6: Write failing offline aggregation test**

Mock the recorder in `offlineSettle.test.ts`. For the 12-win fixture, assert exactly one recorder call with 12 monster events and 12 `job.victory` events. A zero-accrual second call must not record.

- [ ] **Step 7: Add the offline collector and verify hunting suites**

Allocate one event array per settlement transaction, pass it through each `RunOneHuntCtx`, and flush completed events after the loop but before the settlement result returns. Run:

```bash
npm test -- src/app/api/v2/dungeon/hunt/huntProficiency.test.ts src/lib/server/huntRoute.test.ts src/lib/server/offlineSettle.test.ts
```

Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add src/app/api/v2/dungeon/hunt/huntProficiency.ts src/app/api/v2/dungeon/hunt/huntProficiency.test.ts src/app/api/v2/dungeon/hunt/route.ts src/app/api/v2/me/offline-settle/route.ts src/lib/server/huntRoute.test.ts src/lib/server/offlineSettle.test.ts
git commit -m "feat: connect hunt codex mastery"
```

### Task 4: Connect life and cooking job mastery gains

**Files:**
- Modify: `src/app/api/v2/farm/harvest/route.ts`
- Modify: `src/lib/server/farmHarvestRoute.test.ts`
- Modify: `src/app/api/v2/mining/strike/route.ts`
- Modify: `src/app/api/v2/mining/auto/route.ts`
- Modify: `src/lib/server/miningRoute.test.ts`
- Modify: `src/app/api/v2/woodcutting/chop/route.ts`
- Modify: `src/app/api/v2/woodcutting/auto/route.ts`
- Modify: `src/lib/server/woodcuttingRoute.test.ts`
- Modify: `src/app/api/v2/cooking/route.ts`
- Modify: `src/app/api/v2/cooking/route.test.ts`

**Interfaces:**
- Consumes: the gameplay batch recorder.
- Produces: one `job.activity` event using the exact `jobId` and `masteryGained` already persisted by each success path.

- [ ] **Step 1: Add failing route wiring assertions**

Mock the gameplay recorder in all four route test modules. For manual and auto mining/woodcutting, farm harvest, and cooking success, assert the event amount equals the existing response `masteryGained`. Assert failure/cancel/no-valid-job cases do not call it.

- [ ] **Step 2: Run the four suites and verify RED**

Run:

```bash
npm test -- src/lib/server/farmHarvestRoute.test.ts src/lib/server/miningRoute.test.ts src/lib/server/woodcuttingRoute.test.ts src/app/api/v2/cooking/route.test.ts
```

Expected: FAIL on missing recorder calls.

- [ ] **Step 3: Wire every successful job increment**

Immediately after each existing `proficiency.v2` write, await one gameplay batch with:

```ts
{
  category: "job",
  entryId: authoritativeJobId,
  amount: masteryGained,
  source: "job.activity",
}
```

Do not call when `masteryGained <= 0` or the route did not call `addJobCumLevel`.

- [ ] **Step 4: Run focused life/cooking regressions and type-check**

Run:

```bash
npm test -- src/lib/server/farmHarvestRoute.test.ts src/lib/server/miningRoute.test.ts src/lib/server/woodcuttingRoute.test.ts src/app/api/v2/cooking/route.test.ts
npx tsc --noEmit
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/app/api/v2/farm/harvest/route.ts src/lib/server/farmHarvestRoute.test.ts src/app/api/v2/mining/strike/route.ts src/app/api/v2/mining/auto/route.ts src/lib/server/miningRoute.test.ts src/app/api/v2/woodcutting/chop/route.ts src/app/api/v2/woodcutting/auto/route.ts src/lib/server/woodcuttingRoute.test.ts src/app/api/v2/cooking/route.ts src/app/api/v2/cooking/route.test.ts
git commit -m "feat: connect life job codex mastery"
```

### Task 5: Connect training and consumable job mastery gains

**Files:**
- Modify: `src/app/api/v2/guild/training-ground/route.ts`
- Create: `src/lib/server/guildTrainingCodexMasteryRoute.test.ts`
- Modify: `src/app/api/v2/mastery-tower/use-certificate/route.ts`
- Modify: `src/lib/server/masteryCertificateRoute.test.ts`
- Modify: `src/app/api/v2/me/use-coop-mastery-tome/route.ts`
- Modify: `src/lib/server/useCoopMasteryTomeRoute.test.ts`

**Interfaces:**
- Consumes: the gameplay batch recorder.
- Produces: `job.training` for a claimed guild drill and `job.consumable` for consumed mastery certificates/tomes.

- [ ] **Step 1: Write failing training and consumable wiring tests**

Use existing route harnesses for certificates and tomes, and a minimal in-memory transaction/save harness for guild training. Assert the exact credited job ID and amount. Invalid, locked, already-claimed, no-item, and `mode = proficiency` paths must not record job mastery.

- [ ] **Step 2: Run tests and verify RED**

Run:

```bash
npm test -- src/lib/server/guildTrainingCodexMasteryRoute.test.ts src/lib/server/masteryCertificateRoute.test.ts src/lib/server/useCoopMasteryTomeRoute.test.ts
```

Expected: FAIL because the routes do not submit mastery events.

- [ ] **Step 3: Wire the three authoritative success paths**

For guild training use `totalRewardMastery` and `current.jobId` with `job.training`. For certificate mastery mode use the consumed `amount` and selected `job.id`; do not record proficiency mode. For the coop tome use `COOP_MASTERY_TOME_GAIN` and the authoritative current `jobId`. Await each call after the related save writes and before returning.

- [ ] **Step 4: Run the focused suites**

Run the three files from Step 2. Expected: PASS with response and item balances unchanged.

- [ ] **Step 5: Commit**

```bash
git add src/app/api/v2/guild/training-ground/route.ts src/lib/server/guildTrainingCodexMasteryRoute.test.ts src/app/api/v2/mastery-tower/use-certificate/route.ts src/lib/server/masteryCertificateRoute.test.ts src/app/api/v2/me/use-coop-mastery-tome/route.ts src/lib/server/useCoopMasteryTomeRoute.test.ts
git commit -m "feat: connect awarded job codex mastery"
```

### Task 6: Verify B2 and preserve phase isolation

**Files:**
- Modify only if verification exposes a B2 defect.

- [ ] **Step 1: Audit all production `addJobCumLevel` call sites**

Run:

```bash
rg -n "addJobCumLevel" src/app src/lib/server -g '*.ts'
```

Confirm every gameplay call is paired with a B2 event. Direct-value injection through
`src/app/api/admin/v2-grant/route.ts` and `src/app/api/v2/dev/grant/route.ts` must remain unconnected.

- [ ] **Step 2: Run the complete B2 and foundation suites**

Run all new adapter tests, fishing/hunting/life/job route tests, and all existing codex mastery tests together. Expected: zero failures.

- [ ] **Step 3: Run static and build verification**

Run:

```bash
npx tsc --noEmit
npx eslint <all B2 changed TypeScript files>
npm run codex-mastery:budget
npm run build
```

Expected: all commands exit zero and image validation reports no missing references.

- [ ] **Step 4: Run the full test suite and classify unrelated timeouts**

Run: `npm test`

If the known simulation timeout tests fail only under parallel load, rerun those files alone and report both results exactly. Do not alter unrelated balance tests as part of B2.

- [ ] **Step 5: Verify prohibited actions and branch isolation**

Confirm both worktrees are clean, all codex feature defaults remain false, `hold/codex-mastery-phase-a-20260820` is an ancestor of this branch, neither Phase A nor B is an ancestor of `fix/life-field-focus-refresh-20260815`, and no deploy, push, merge, real `--apply`, or operations-setting write occurred.

- [ ] **Step 6: Commit verification fixes if needed**

Use a focused `fix:` commit only for defects exposed by verification. Preserve the B2 branch and `/tmp` worktree for the next bundle.
