# Coop Boss Publication Lock Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make every cooperative boss start owner-only, require confirmation before publishing it to everyone, announce that publication globally, and prevent every later visibility downgrade.

**Architecture:** Keep the initial visibility and legal transition rule as pure domain policy in `coopBosses.ts`. Both scroll summons and fishing-triggered Abyssal Tyrant spawns consume that policy. The visibility route locks the session row, applies the one-way transition, and emits feed/chat side effects only after a real transition to `public`; the detail UI confirms that irreversible action and becomes read-only afterward.

**Tech Stack:** TypeScript, React 19, Next.js 16 App Router route handlers, Drizzle ORM, Vitest.

## Global Constraints

- Do not deploy or change maintenance mode.
- Do not add a database migration; existing `visibility = public` is the permanent publication marker.
- Preserve unrelated `NUL` and `_workspace/` files.
- All server writes and access checks remain authoritative; client confirmation is not a security boundary.
- Existing public active sessions remain public and locked; do not backfill them to private.
- Cooperative-boss visibility is always enforced independently of `V2_CORE_LOOP_V2` in list, detail, attack, attack-log, mutation API, and UI paths.
- Read the local Next.js 16 route-handler and client-component guides before changing route or client code.

---

### Task 1: Shared one-way visibility policy and private spawn defaults

**Files:**
- Modify: `src/adventure/data/v2/coopBosses.ts`
- Test: `src/adventure/data/v2/coopBosses.test.ts`
- Modify: `src/lib/server/v2Coop.ts`
- Create: `src/lib/server/v2Coop.test.ts`
- Modify: `src/app/api/v2/coop/summon/route.ts`
- Create: `src/app/api/v2/coop/summon/route.test.ts`
- Modify: `src/app/api/v2/fishing/reel/route.ts`
- Modify: `src/app/api/v2/coop/route.ts`
- Modify: `src/app/api/v2/coop/[sessionId]/route.ts`
- Modify: `src/app/api/v2/coop/attack/route.ts`
- Modify: `src/app/api/v2/coop/[sessionId]/attacks/[attackId]/route.ts`

**Interfaces:**
- Produces: `COOP_INITIAL_VISIBILITY: "summoner_only"` and `coopVisibilityTransition(current, requested)` returning `{ ok: true, changed }` or `{ ok: false, error: "visibility_locked" }`.
- Consumes: the policy in both session creation paths.

- [ ] **Step 1: Write failing domain tests**

Assert the initial value is `summoner_only`, private/guild transitions remain legal, private/guild to public is legal, public to private/guild returns `visibility_locked`, and public to public succeeds with `changed: false`.

- [ ] **Step 2: Run the domain test and verify failure**

Run: `npx vitest run src/adventure/data/v2/coopBosses.test.ts`

Expected: FAIL because the policy exports do not exist.

- [ ] **Step 3: Implement the pure policy**

Add the constant and transition function beside `CoopVisibility`. Parse both values before comparing so old or malformed rows retain the existing public fallback.

- [ ] **Step 4: Write failing spawn tests**

In `v2Coop.test.ts`, provide a fake transaction executor and assert `trySpawnFishingCoopBoss()` inserts `visibility: "summoner_only"`. In the summon route test, seed enough scrolls, POST a body containing `visibility: "public"`, and assert the inserted session still has `summoner_only` and no feed/chat broadcast occurs.

- [ ] **Step 5: Run spawn tests and verify failure**

Run: `npx vitest run src/lib/server/v2Coop.test.ts src/app/api/v2/coop/summon/route.test.ts`

Expected: FAIL because both creation paths currently store or accept public visibility.

- [ ] **Step 6: Apply private defaults and remove creation broadcasts**

Use `COOP_INITIAL_VISIBILITY` in both INSERT values, stop parsing a summon-time visibility choice, and remove post-summon feed/chat calls from the summon and fishing reel routes. Keep the private spawn in the response so the owner can open it. Remove `V2_CORE_LOOP_V2` gates around cooperative-boss list, detail, attack, and attack-log visibility checks so the private state is enforced in every environment.

- [ ] **Step 7: Run Task 1 tests and commit**

Run: `npx vitest run src/adventure/data/v2/coopBosses.test.ts src/lib/server/v2Coop.test.ts src/app/api/v2/coop/summon/route.test.ts src/lib/server/fishingReelRoute.test.ts`

Expected: PASS.

Commit: `feat: start coop bosses privately`

---

### Task 2: Atomic publication and global announcement

**Files:**
- Modify: `src/app/api/v2/coop/[sessionId]/visibility/route.ts`
- Create: `src/app/api/v2/coop/[sessionId]/visibility/route.test.ts`

**Interfaces:**
- Consumes: `coopVisibilityTransition`, `insertFeedEntry`, `broadcastCoopNotice`, and the existing `FOR UPDATE` session lock.
- Produces: error `visibility_locked`, success field `changed`, and one global feed/chat notification on a real transition to `public`.

- [ ] **Step 1: Read the Next.js route-handler guide**

Read `node_modules/next/dist/docs/01-app/01-getting-started/15-route-handlers.md` completely and preserve Web `Request` / `Response.json` behavior.

- [ ] **Step 2: Write failing route tests**

Mock the transaction row lock and side-effect functions. Assert:

- private to public updates once and calls feed/chat once with the session and boss names;
- public to private or guild returns HTTP 409 `visibility_locked` without an update;
- public to public returns 200 with `changed: false` and emits no notification;
- private to guild remains allowed and emits no global notification.

- [ ] **Step 3: Run the route test and verify failure**

Run: `npx vitest run 'src/app/api/v2/coop/[sessionId]/visibility/route.test.ts'`

Expected: FAIL because downgrades are allowed and publication does not announce.

- [ ] **Step 4: Implement the locked transition**

After owner/active checks, evaluate `coopVisibilityTransition()` while the row is locked. Return 409 on `visibility_locked`; only update when `changed` is true. Return the boss publication snapshot from the transaction, then call:

```ts
await insertFeedEntry(userId, "coop_summon", {
  kind,
  sessionId,
  expiresAt,
});
await broadcastCoopNotice(
  `${summonerName} 님이 「${bossName}」 토벌을 전체 공개했다`,
);
```

Only execute these calls when the old state was not public and the stored state became public.

- [ ] **Step 5: Run Task 2 tests and commit**

Run: `npx vitest run 'src/app/api/v2/coop/[sessionId]/visibility/route.test.ts' src/adventure/data/v2/coopBosses.test.ts`

Expected: PASS.

Commit: `feat: lock published coop boss visibility`

---

### Task 3: Irreversible-publication UI

**Files:**
- Modify: `src/adventure/v2/coop/V2CoopBossListView.tsx`
- Modify: `src/adventure/v2/coop/V2CoopBossDetailView.tsx`
- Modify: `src/adventure/v2/coop/useCoopBossState.ts`
- Create: `src/adventure/v2/coop/coopVisibilityUi.test.ts`

**Interfaces:**
- Produces: `confirmCoopBossPublication({ confirm, onPublish })` for a single confirmation call and single callback execution.
- Consumes: the `visibility_locked` server error and current session visibility.

- [ ] **Step 1: Read the Next.js client-component guide**

Read `node_modules/next/dist/docs/01-app/01-getting-started/05-server-and-client-components.md` completely.

- [ ] **Step 2: Write failing confirmation tests**

Use injected `confirm` and `onPublish` spies. Cancellation must call confirm once and never call `onPublish`; acceptance must call each exactly once. The confirmation string must state that public bosses cannot return to private or guild scope.

- [ ] **Step 3: Run the UI policy test and verify failure**

Run: `npx vitest run src/adventure/v2/coop/coopVisibilityUi.test.ts`

Expected: FAIL because the helper does not exist.

- [ ] **Step 4: Implement the UI flow**

Remove the summon-time visibility state and selector. Explain that new bosses start as owner-only. Remove visibility UI gates tied to `V2_CORE_LOOP_V2`. In the detail view, show controls only while owner, active, and not public. Route the public button through `window.confirm`; keep private/guild buttons immediate. Once public, render the existing read-only badge. Map `visibility_locked` to `전체 공개된 보스는 공개 범위를 줄일 수 없어요.`

- [ ] **Step 5: Run UI and related tests and commit**

Run: `npx vitest run src/adventure/v2/coop/coopVisibilityUi.test.ts src/adventure/v2/coop/coopListSections.test.ts`

Expected: PASS.

Commit: `feat: confirm coop boss publication`

---

### Task 4: Final verification

**Files:**
- Modify only the files above if an in-scope failure is found.

- [ ] **Step 1: Run focused tests**

Run all tests added or touched in Tasks 1–3 plus `src/lib/server/fishingReelRoute.test.ts`.

- [ ] **Step 2: Run static checks**

Run `npx tsc --noEmit` and ESLint on all touched TypeScript/TSX files.

- [ ] **Step 3: Run the full suite**

Run: `npm test`

- [ ] **Step 4: Review repository state**

Run `git diff --check` and `git status --short`. Preserve unrelated `NUL` and `_workspace/`, and do not deploy.
