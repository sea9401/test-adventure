# Long Battle Log Overflow Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Preserve every turn of long batch-hunt battles without returning all logs in the initial batch response.

**Architecture:** Keep complete replay payloads through the hunt transaction, then replace only payloads whose logs exceed 80 entries with two-hour `battle_replays` references after the gameplay transaction commits. Reuse the existing authenticated replay endpoint and deferred client loader; if temporary persistence fails, return the complete inline payload so completed rewards are never rolled back and logs are not lost.

**Tech Stack:** TypeScript, Next.js App Router Route Handlers, Drizzle ORM/PostgreSQL, React, Vitest.

## Global Constraints

- Do not deploy.
- Do not modify or include the existing unrelated fishing and top-bar working-tree changes.
- Batch-hunt long logs expire after exactly 2 hours; arena replays continue to expire after exactly 14 days.
- Logs with at most 80 entries remain inline and cause no `battle_replays` write.
- A temporary replay-store failure must not fail or roll back the hunt result.
- Replay reads retain user ownership checks and `private, no-store` caching.

---

### Task 1: Selective temporary replay storage

**Files:**
- Modify: `src/lib/server/battleReplayStore.ts`
- Test: `src/lib/server/battleReplayStore.test.ts`
- Modify: `src/app/api/v2/arena/match/route.ts`

**Interfaces:**
- Produces: `BATTLE_REPLAY_RETENTION_MS: { batchHunt: number; arena: number }`.
- Produces: `deferLongBattleReplays(executor, userId, payloads, options?, now?): Promise<ReplayPayload[]>` where `options.inlineLogLimit` defaults to `80` and `options.retentionMs` defaults to `BATTLE_REPLAY_RETENTION_MS.batchHunt`.
- Preserves: `storeBattleReplay` and `storeBattleReplays`, changing their duration argument from days to milliseconds.

- [ ] **Step 1: Write failing storage tests**

Add tests proving that a 2-hour duration creates the exact `expiresAt`, short logs remain unchanged with no insert, mixed inputs store only long logs while preserving order, and insert failure returns every original full payload.

```ts
const result = await deferLongBattleReplays(executor, "user-1", [short, long], {}, now);
expect(values).toHaveBeenCalledWith([expect.objectContaining({ payload: long })]);
expect(result[0]).toBe(short);
expect(result[1]).toMatchObject({ replayId: expect.any(String), log: [] });

values.mockRejectedValueOnce(new Error("store unavailable"));
await expect(
  deferLongBattleReplays(executor, "user-1", [long], {}, now),
).resolves.toEqual([long]);
```

- [ ] **Step 2: Run the focused test and verify failure**

Run: `npm test -- src/lib/server/battleReplayStore.test.ts`

Expected: FAIL because `BATTLE_REPLAY_RETENTION_MS` and `deferLongBattleReplays` do not exist.

- [ ] **Step 3: Implement duration-based and selective storage**

Replace the day-based duration with milliseconds, partition long payloads by `payload.log.length > inlineLogLimit`, store only that partition, merge deferred references back into their original positions, and catch storage failures with a `console.warn` before returning the original payload array.

```ts
export const BATTLE_REPLAY_RETENTION_MS = {
  batchHunt: 2 * 60 * 60 * 1_000,
  arena: 14 * 24 * 60 * 60 * 1_000,
} as const;

export async function deferLongBattleReplays(
  executor: DbExecutor,
  userId: string,
  payloads: ReplayPayload[],
  options: { inlineLogLimit?: number; retentionMs?: number } = {},
  now = new Date(),
): Promise<ReplayPayload[]>;
```

Update both arena calls to pass `BATTLE_REPLAY_RETENTION_MS.arena` without changing their transactional storage behavior.

- [ ] **Step 4: Run focused storage tests**

Run: `npm test -- src/lib/server/battleReplayStore.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit the storage unit**

```bash
git add src/lib/server/battleReplayStore.ts src/lib/server/battleReplayStore.test.ts src/app/api/v2/arena/match/route.ts
git commit -m "fix: 긴 배치 전투 로그를 선택 저장"
```

### Task 2: Batch hunt integration without truncation

**Files:**
- Modify: `src/adventure/data/v2/replayPayload.ts`
- Test: `src/adventure/data/v2/replayPayload.test.ts`
- Modify: `src/app/api/v2/dungeon/hunt/route.ts`
- Test: `src/lib/server/huntRoute.test.ts`

**Interfaces:**
- Consumes: `deferLongBattleReplays(db, userId, payloads)` from Task 1.
- Preserves: `ReplayPayload` references use `replayId` with `log: []`.

- [ ] **Step 1: Change replay and route tests to require full source logs**

Replace the cap-specific replay test with an assertion that `toReplayPayload` always preserves all 500 entries. In `huntRoute.test.ts`, mock `deferLongBattleReplays` with a hoisted spy that returns its payload argument, then update the five-hunt test to assert that the spy receives all five complete replay payloads after the transaction. Keep the assertions that short logs remain inline, have no `replayId`, and cause no `battleReplays` insert.

```ts
const payload = toReplayPayload(fixture(500));
expect(payload.log).toHaveLength(500);
expect(payload.log[0]).toMatchObject({ text: "줄 0" });
expect(payload.log.some((entry) => entry.text.includes("생략"))).toBe(false);

expect(deferLongBattleReplays).toHaveBeenCalledWith(
  expect.anything(),
  "u-test",
  expect.arrayContaining([expect.objectContaining({ log: expect.any(Array) })]),
);
```

- [ ] **Step 2: Run focused tests and verify failure**

Run: `npm test -- src/adventure/data/v2/replayPayload.test.ts src/lib/server/huntRoute.test.ts`

Expected: FAIL while the route still passes `logCap` and produces the omission marker.

- [ ] **Step 3: Remove truncation and defer long payloads after commit**

Remove `logCap`, `clampReplayLog`, `BATCH_REPLAY_LOG_CAP`, and `RunOneHuntCtx.replayLogCap`. Let every `runOneHunt(true, ...)` result carry the complete log inside the transaction. After `db.transaction` resolves, map `result.body.batch.replays` through `deferLongBattleReplays`, replacing only each entry's `replay` field; leave single-hunt responses untouched.

```ts
if (result.status === 200 && "batch" in result.body) {
  const entries = result.body.batch.replays;
  const payloads = await deferLongBattleReplays(
    db,
    userId,
    entries.map((entry) => entry.replay),
  );
  result.body.batch.replays = entries.map((entry, index) => ({
    ...entry,
    replay: payloads[index] ?? entry.replay,
  }));
}
```

- [ ] **Step 4: Run replay and hunt tests**

Run: `npm test -- src/adventure/data/v2/replayPayload.test.ts src/lib/server/huntRoute.test.ts`

Expected: PASS; the ordinary five-hunt fixture stays inline because each log is at most 80 entries.

- [ ] **Step 5: Commit the hunt integration**

```bash
git add src/adventure/data/v2/replayPayload.ts src/adventure/data/v2/replayPayload.test.ts src/app/api/v2/dungeon/hunt/route.ts src/lib/server/huntRoute.test.ts
git commit -m "fix: 긴 일괄 사냥 로그 전체 열람 복원"
```

### Task 3: Deferred replay failure guidance and final verification

**Files:**
- Modify: `src/adventure/v2/ReplayBattleScene.tsx`
- Test: `src/adventure/v2/ReplayBattleScene.test.tsx`

**Interfaces:**
- Consumes: deferred `ReplayPayload` values with `replayId` and empty `log`.

- [ ] **Step 1: Write a failing UI copy test**

Add and import an exported `DEFERRED_REPLAY_UNAVAILABLE_MESSAGE` constant, assert that its value is `전투 기록 보관 시간이 지났거나 찾을 수 없습니다.`, and use that same constant in the deferred-loading error banner so the test covers the exact user-facing copy without duplicating it inside the component.

- [ ] **Step 2: Run the focused UI test and verify failure**

Run: `npm test -- src/adventure/v2/ReplayBattleScene.test.tsx`

Expected: FAIL because the current message is `전체 전투 로그를 불러오지 못했습니다.`.

- [ ] **Step 3: Update the failure message**

Change only the deferred replay failure message; keep abort handling, retry state, and `private, no-store` server response behavior unchanged.

- [ ] **Step 4: Run all affected tests and static checks**

Run: `npm test -- src/lib/server/battleReplayStore.test.ts src/adventure/data/v2/replayPayload.test.ts src/lib/server/huntRoute.test.ts src/adventure/v2/ReplayBattleScene.test.tsx src/app/api/v2/battle-replays/[replayId]/route.test.ts`

Run: `npx tsc --noEmit`

Run: `git diff --check`

Expected: all tests pass, TypeScript exits 0, and diff check prints no errors.

- [ ] **Step 5: Commit the UI and verification unit**

```bash
git add src/adventure/v2/ReplayBattleScene.tsx src/adventure/v2/ReplayBattleScene.test.tsx
git commit -m "fix: 만료된 전투 로그 안내 개선"
```
