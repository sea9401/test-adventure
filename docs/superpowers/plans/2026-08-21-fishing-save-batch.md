# Fishing Save Batch Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace fishing reel's per-key save reads and writes with ordered lock groups and one final bulk upsert.

**Architecture:** The existing transaction preloads related save groups through `lockSavesForUpdate`, computes against request-local values, stages dirty saves in a record, and flushes them through `upsertSaves` at the branch boundary.

**Tech Stack:** TypeScript, Drizzle ORM, Next.js Route Handler, Vitest

## Global Constraints

- Preserve catch, anti-abuse, reward, mastery, quest, and response behavior.
- Preserve the user-row life-activity lock and cross-domain lock boundaries.
- Increment each changed save version once per reel request.
- Do not deploy or mutate production data.

---

### Task 1: Fishing reel grouped locks and writes

**Files:**
- Modify: `src/lib/server/fishingReelRoute.test.ts`
- Modify: `src/app/api/v2/fishing/reel/route.ts`

**Interfaces:**
- Consumes: `lockSavesForUpdate(tx, userId, fallbacks)` and
  `upsertSaves(tx, userId, entries)`.
- Produces: no API contract changes.

- [ ] **Step 1: Extend the save test double and write a failing success budget test**

Track `lockSavesForUpdate` and `upsertSaves`. After a successful reel, assert one
reel bulk write includes session, anti-macro, guard, streak, stock, progression,
proficiency, codex, daily, wallet, and workshop keys. Existing supporting helpers
may still call the single-save primitive.

- [ ] **Step 2: Run the focused success test and verify RED**

Run: `npx vitest run src/lib/server/fishingReelRoute.test.ts -t '낚시 계열 직업'`

Expected: FAIL because the route does not call `upsertSaves`.

- [ ] **Step 3: Group the fishing, character/proficiency, and daily/wallet locks**

Replace matching single locks with the three batch reads described in the design.
Keep codex and workshop at their existing lock boundaries.

- [ ] **Step 4: Stage success writes and flush once**

Replace reel-owned `upsertSave` calls with assignments to one dirty-save record.
Flush it once before permanent mastery recording and returning success.

- [ ] **Step 5: Write a failing missed-catch bulk-write test**

Assert the failed branch performs one bulk write containing the empty session,
anti-macro state, activity guard state, and reset streak, while awarding no catch
state.

- [ ] **Step 6: Flush the failure branch and verify GREEN**

Run: `npx vitest run src/lib/server/fishingReelRoute.test.ts`

Expected: all fishing reel tests PASS.

- [ ] **Step 7: Run phase checks**

Run: `npx tsc --noEmit`

Run: `npx eslint src/app/api/v2/fishing/reel/route.ts src/lib/server/fishingReelRoute.test.ts`

Run: `git diff --check`

Expected: every command exits 0.

- [ ] **Step 8: Commit**

```bash
git add src/app/api/v2/fishing/reel/route.ts src/lib/server/fishingReelRoute.test.ts
git commit -m "perf: batch fishing reel save writes"
```
