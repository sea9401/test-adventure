# Inbox Read and Claim State Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 받은 우편과 지난 우편을 통합하고, 열람 즉시 읽음 처리하되 보상 수령 상태는 독립적으로 유지하며, 전체 수령에서 보상 없는 우편을 제외한다.

**Architecture:** `marketplace_inbox.read_at`을 추가해 읽음과 `claimed_at` 처리 완료를 분리한다. 검증된 inbox payload를 하나의 순수 분류 함수로 해석하여 GET, 읽음 POST, 수령 POST와 클라이언트 UI가 같은 `claimState` 계약을 사용한다. 받은 우편 API는 모든 미완료 행과 최근 완료 100개를 합쳐 반환하고 UI는 이 단일 목록에서 미확인 강조와 미수령 상태를 표시한다.

**Tech Stack:** Next.js 16.2 Route Handlers, React 19, TypeScript, Drizzle ORM/PostgreSQL, Vitest, Tailwind surface tokens

## Global Constraints

- 운영 배포와 점검 모드 변경은 수행하지 않는다.
- 기존 작업 트리의 직업 로드맵 관련 변경을 수정하거나 커밋하지 않는다.
- 미완료 보상·초대·손상 우편에는 조회 상한을 적용하지 않는다.
- 미확인 표면은 `SURFACE_ACCENT`, 일반 카드는 `SURFACE_CARD`를 사용하며 반투명 카드와 컨테이너 전체 opacity를 사용하지 않는다.
- 파싱 실패 우편은 읽음만 허용하고 자동 완료·전체 수령·삭제 대상에서 제외한다.
- Route Handler는 Next.js 16.2의 native `Request`/`Response` 계약을 따른다.

---

### Task 1: 우편 상태 분류와 저장 스키마

**Files:**
- Modify: `src/lib/server/inboxPayload.ts`
- Modify: `src/lib/server/inboxPayload.test.ts`
- Modify: `src/db/schema.ts`
- Create: `drizzle/0162_inbox_read_state.sql`
- Modify: `drizzle/meta/_journal.json`

**Interfaces:**
- Consumes: `parseInboxPayload(kind: string, payload: unknown): InboxPayload | null`
- Produces: `InboxClaimState = "none" | "claimable" | "action" | "invalid"`
- Produces: `inboxClaimState(kind: string, payload: unknown): InboxClaimState`
- Produces: `marketplaceInbox.readAt: Date | null`

- [ ] **Step 1: Write failing payload-classification tests**

Add table-driven expectations proving `user_message` and `price_alert` are `none`, `guild_invite` is `action`, positive reward payloads are `claimable`, empty `admin_gift` is `none`, and malformed payload is `invalid`.

```ts
expect(inboxClaimState("user_message", { text: "안녕" })).toBe("none");
expect(inboxClaimState("guild_invite", validInvite)).toBe("action");
expect(inboxClaimState("admin_gift", { gold: 100 })).toBe("claimable");
expect(inboxClaimState("admin_gift", {})).toBe("none");
expect(inboxClaimState("season_reward", { season: "broken" })).toBe("invalid");
```

- [ ] **Step 2: Run the focused test and observe failure**

Run: `npm test -- src/lib/server/inboxPayload.test.ts`

Expected: FAIL because `inboxClaimState` is not exported.

- [ ] **Step 3: Implement the exhaustive classifier**

Parse once with `parseInboxPayload`, return `invalid` on null, `action` for guild invites, and inspect normalized numeric/array fields so zero-value administrative or guild mail is `none`. All item-return, recipe, equipment and positive currency payloads are `claimable`.

- [ ] **Step 4: Add `readAt` and migration**

Add `readAt: timestamp("read_at")` and a partial unread index to the schema. Create migration `0162_inbox_read_state.sql` with:

```sql
ALTER TABLE "marketplace_inbox" ADD COLUMN "read_at" timestamp;
UPDATE "marketplace_inbox"
SET "read_at" = "claimed_at"
WHERE "claimed_at" IS NOT NULL AND "read_at" IS NULL;
CREATE INDEX "inbox_unread_idx"
ON "marketplace_inbox" USING btree ("user_id", "created_at")
WHERE "marketplace_inbox"."read_at" IS NULL;
```

Append journal entry index `162`, tag `0162_inbox_read_state`, version `7`, with a timestamp greater than the `0161` entry.

- [ ] **Step 5: Verify classifier and migration metadata**

Run: `npm test -- src/lib/server/inboxPayload.test.ts`

Run: `npm run check-migrations`

Expected: both PASS.

- [ ] **Step 6: Commit the state model**

```bash
git add src/lib/server/inboxPayload.ts src/lib/server/inboxPayload.test.ts src/db/schema.ts drizzle/0162_inbox_read_state.sql drizzle/meta/_journal.json
git commit -m "feat: separate inbox read and claim states"
```

### Task 2: 통합 조회와 읽음 API

**Files:**
- Create: `src/app/api/marketplace/inbox/route.test.ts`
- Modify: `src/app/api/marketplace/inbox/route.ts`
- Create: `src/app/api/marketplace/inbox/read/route.ts`
- Create: `src/app/api/marketplace/inbox/read/route.test.ts`

**Interfaces:**
- Consumes: `inboxClaimState(kind, payload)` and `marketplaceInbox.readAt`
- Produces: inbox response fields `readAt`, `hasReward`, `claimState`
- Produces: `POST /api/marketplace/inbox/read` body `{ id: number }`

- [ ] **Step 1: Write failing GET contract tests**

Mock the Drizzle select chains and assert the default response merges all `claimedAt === null` rows with the latest 100 completed rows, sorts by `createdAt` descending, and returns `readAt`, `hasReward`, and `claimState`. Assert `?count=1` counts unread rows rather than unclaimed rows and sent rows expose recipient read status.

- [ ] **Step 2: Run the GET tests and observe failure**

Run: `npm test -- src/app/api/marketplace/inbox/route.test.ts`

Expected: FAIL because the current route separates history and omits read-state fields.

- [ ] **Step 3: Implement unified GET output**

Keep the sent branch at 100 rows. For received mail, query every pending row and the latest 100 completed rows, merge and sort them server-side, and map each row through one response serializer using `inboxClaimState`. Remove the `history=1` branch. Count mode filters `readAt IS NULL`.

- [ ] **Step 4: Write failing read-route tests**

Cover authentication, malformed IDs, ownership filtering, idempotency, and state-specific updates:

```ts
expect(updateFor("user_message")).toMatchObject({ readAt: now, claimedAt: now });
expect(updateFor("admin_gift_with_reward")).toMatchObject({ readAt: now });
expect(updateFor("guild_invite")).toMatchObject({ readAt: now });
expect(updateFor("invalid_payload")).toMatchObject({ readAt: now });
```

The latter three must not set `claimedAt`.

- [ ] **Step 5: Run read-route tests and observe failure**

Run: `npm test -- src/app/api/marketplace/inbox/read/route.test.ts`

Expected: FAIL because the route does not exist.

- [ ] **Step 6: Implement the idempotent read route**

Authenticate with `ensureUser`, validate one positive integer ID, lock only that user's row, classify its payload, and set `readAt` if absent. Set `claimedAt` at the same time only for `claimState === "none"`. Return 404 for absent/foreign rows and return the persisted state.

- [ ] **Step 7: Run API tests**

Run: `npm test -- src/app/api/marketplace/inbox/route.test.ts src/app/api/marketplace/inbox/read/route.test.ts`

Expected: PASS.

- [ ] **Step 8: Commit the inbox APIs**

```bash
git add src/app/api/marketplace/inbox/route.ts src/app/api/marketplace/inbox/route.test.ts src/app/api/marketplace/inbox/read/route.ts src/app/api/marketplace/inbox/read/route.test.ts
git commit -m "feat: unify inbox history and read tracking"
```

### Task 3: 수령 완료가 읽음 상태도 갱신하도록 보강

**Files:**
- Modify: `src/lib/server/inboxClaimSeasonReward.test.ts`
- Modify: `src/app/api/marketplace/inbox/claim/route.ts`
- Modify: `src/app/api/guilds/invites/[inviteId]/accept/route.ts`
- Modify: `src/app/api/guilds/invites/[inviteId]/decline/route.ts`
- Modify: `src/app/api/cron/guilds-cleanup/route.ts`

**Interfaces:**
- Consumes: `marketplaceInbox.readAt`
- Produces: every completed inbox row satisfies `claimedAt !== null` and `readAt !== null`

- [ ] **Step 1: Write failing completion-state assertions**

Capture Drizzle update payloads and assert successful reward claims set `{ claimedAt: now, readAt: now }`, while parse failures remain unclaimed. Add equivalent assertions to existing invite route tests where available; otherwise cover the shared update shape with focused tests.

- [ ] **Step 2: Run focused claim and invite tests**

Run: `npm test -- src/lib/server/inboxClaimSeasonReward.test.ts src/lib/server/guildMembershipRoutes.test.ts`

Expected: FAIL because completion paths only set `claimedAt`.

- [ ] **Step 3: Update all inbox completion writes**

Set `readAt` alongside `claimedAt` in reward claim, invite accept/decline, and expired-invite cleanup. Do not alter reward application or payload-failure preservation.

- [ ] **Step 4: Run focused tests**

Run: `npm test -- src/lib/server/inboxClaimSeasonReward.test.ts src/lib/server/guildMembershipRoutes.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit completion consistency**

```bash
git add src/app/api/marketplace/inbox/claim/route.ts src/lib/server/inboxClaimSeasonReward.test.ts src/app/api/guilds/invites/[inviteId]/accept/route.ts src/app/api/guilds/invites/[inviteId]/decline/route.ts src/app/api/cron/guilds-cleanup/route.ts src/lib/server/guildMembershipRoutes.test.ts
git commit -m "fix: mark completed inbox mail as read"
```

### Task 4: 통합 받은 우편 UI와 미수령 표시

**Files:**
- Modify: `src/adventure/marketplace/api.ts`
- Modify: `src/adventure/v2/V2InboxView.tsx`
- Modify: `src/adventure/v2/V2InboxView.test.tsx`
- Modify: `src/adventure/v2/MailboxBell.tsx`
- Create: `src/adventure/v2/inboxViewState.ts`
- Create: `src/adventure/v2/inboxViewState.test.ts`

**Interfaces:**
- Consumes: `InboxItem.readAt`, `InboxItem.hasReward`, `InboxItem.claimState`
- Produces: `bulkClaimIds(items: readonly InboxItem[]): number[]`
- Produces: unified received/sent tabs and open-on-read behavior

- [ ] **Step 1: Write failing view-state tests**

Test that `bulkClaimIds` returns only `claimState === "claimable" && claimedAt == null` IDs, preserving unread messages, invites, empty admin mail and invalid rows. Test that `readAt == null` determines unread styling independently of `claimedAt`.

- [ ] **Step 2: Run view-state tests and observe failure**

Run: `npm test -- src/adventure/v2/inboxViewState.test.ts`

Expected: FAIL because the helper does not exist.

- [ ] **Step 3: Implement client contracts and pure helpers**

Extend `InboxItem`, remove `fetchInboxHistory`, add `markInboxRead(id)`, and implement `bulkClaimIds` in the focused helper file.

- [ ] **Step 4: Write failing rendered UI tests**

Render representative unread message, read/unclaimed reward, and claimed mail. Assert the unread card uses `SURFACE_ACCENT` and bold text, the reward card shows `미수령` plus `수령`, and the tab list contains `받은 우편` and `보낸 우편` but not `지난 우편`.

- [ ] **Step 5: Run UI tests and observe failure**

Run: `npm test -- src/adventure/v2/V2InboxView.test.tsx src/adventure/v2/inboxViewState.test.ts`

Expected: FAIL against the split-tab UI.

- [ ] **Step 6: Implement unified UI behavior**

Remove history state/loading and render the unified received response. On card/detail open, show the modal immediately and call `markInboxRead`; merge the returned timestamps into both selected item and list, then dispatch `v2inbox:refresh`. Keep the modal open on read failure and show an error. Use `bulkClaimIds` for 전체 수령. After claim, reload the unified list instead of invalidating history.

- [ ] **Step 7: Update the top-bar preview**

Treat `unclaimedCount` as unread count for compatibility, or rename the client response field to `unreadCount` consistently across the route, API wrapper and bell. Preview the newest unified rows while the badge counts only unread rows.

- [ ] **Step 8: Run client tests**

Run: `npm test -- src/adventure/v2/V2InboxView.test.tsx src/adventure/v2/inboxViewState.test.ts`

Expected: PASS.

- [ ] **Step 9: Commit the UI**

```bash
git add src/adventure/marketplace/api.ts src/adventure/v2/V2InboxView.tsx src/adventure/v2/V2InboxView.test.tsx src/adventure/v2/MailboxBell.tsx src/adventure/v2/inboxViewState.ts src/adventure/v2/inboxViewState.test.ts
git commit -m "feat: highlight unread and unclaimed inbox mail"
```

### Task 5: Integrated verification

**Files:**
- Modify only files shown by verification evidence to be incorrect.

**Interfaces:**
- Consumes: all prior task outputs
- Produces: verified local feature with no deployment

- [ ] **Step 1: Run all focused inbox suites**

Run: `npm test -- src/lib/server/inboxPayload.test.ts src/lib/server/inboxClaimSeasonReward.test.ts src/app/api/marketplace/inbox/route.test.ts src/app/api/marketplace/inbox/read/route.test.ts src/adventure/v2/inboxViewState.test.ts src/adventure/v2/V2InboxView.test.tsx src/lib/server/guildMembershipRoutes.test.ts`

Expected: PASS.

- [ ] **Step 2: Run static verification**

Run: `npx tsc --noEmit`

Run: `npx eslint src/lib/server/inboxPayload.ts src/app/api/marketplace/inbox/route.ts src/app/api/marketplace/inbox/read/route.ts src/app/api/marketplace/inbox/claim/route.ts src/adventure/marketplace/api.ts src/adventure/v2/V2InboxView.tsx src/adventure/v2/MailboxBell.tsx src/adventure/v2/inboxViewState.ts`

Run: `npm run check-migrations`

Run: `git diff --check`

Expected: all PASS.

- [ ] **Step 3: Run the full test suite**

Run: `npm test`

Expected: PASS. If unrelated dirty-worktree tests fail, record the exact failing suites and verify no inbox file is implicated.

- [ ] **Step 4: Audit the final diff and commits**

Confirm only inbox/schema/migration/test/plan files are included in the feature commits, no deployment or maintenance command ran, and the user's unrelated job-roadmap changes remain untouched.
