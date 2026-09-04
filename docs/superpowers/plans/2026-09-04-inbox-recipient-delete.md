# Received Mail Deletion Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a recipient remove completed received mail from their own inbox without erasing the sender's sent-mail record or discarding pending rewards and actions.

**Architecture:** Add a recipient-only soft-delete timestamp to `marketplace_inbox`, exclude it from received-mail and unread-count queries, and expose one authenticated Route Handler that marks completed owned mail deleted. The client uses the existing game confirmation dialog, removes the successful item from local state, closes an open detail modal, and refreshes the shared inbox badge.

**Tech Stack:** Next.js App Router Route Handlers, React 19 client components, TypeScript, Drizzle ORM/PostgreSQL, Vitest, Testing Library.

## Global Constraints

- Only received mail with a non-null `claimed_at` can be deleted.
- Deletion hides mail only from the recipient; database rows and sender history remain intact.
- Pending rewards, pending guild invites, invalid pending mail, and sent mail cannot be deleted.
- Use the existing `confirmGameAction` dialog and opaque shared UI surfaces.
- Do not deploy or change maintenance mode.

---

### Task 1: Recipient soft-delete persistence and received-mail filtering

**Files:**
- Modify: `src/db/schema.ts`
- Modify: `src/app/api/marketplace/inbox/route.ts`
- Modify: `src/app/api/marketplace/inbox/route.test.ts`
- Create: `drizzle/0183_inbox_recipient_delete.sql`
- Create: `drizzle/meta/0183_snapshot.json`
- Modify: `drizzle/meta/_journal.json`

**Interfaces:**
- Produces: `marketplaceInbox.recipientDeletedAt: timestamp | null`.
- Produces: received list and `?count=1` queries constrained by `recipient_deleted_at IS NULL`.
- Preserves: `?sent=1` returns sender history regardless of the recipient deletion timestamp.

- [x] **Step 1: Extend route tests with deleted-row query expectations**

Add query-spy coverage that distinguishes received/count queries from sent queries. Assert received and count query predicates include `recipient_deleted_at IS NULL`, while the sent query does not filter on that column.

- [x] **Step 2: Run the focused route test and verify failure**

Run: `npx vitest run src/app/api/marketplace/inbox/route.test.ts`

Expected: FAIL because `recipientDeletedAt` and the received-only filters do not exist.

- [x] **Step 3: Add the schema column and received query filters**

Add this column beside the existing state timestamps:

```ts
recipientDeletedAt: timestamp("recipient_deleted_at"),
```

Add `isNull(marketplaceInbox.recipientDeletedAt)` to the count, pending received, and completed received query conditions. Do not add it to the sent query.

- [x] **Step 4: Generate and inspect the migration artifacts**

Run: `npm run db:generate -- --name inbox_recipient_delete`

Expected: creates `drizzle/0183_inbox_recipient_delete.sql`, `drizzle/meta/0183_snapshot.json`, and journal entry 183. Confirm the SQL only adds nullable `recipient_deleted_at` to `marketplace_inbox`.

- [x] **Step 5: Run focused tests and migration validation**

Run: `npx vitest run src/app/api/marketplace/inbox/route.test.ts`

Run: `npm run check-migrations`

Expected: both commands exit 0.

---

### Task 2: Authenticated, idempotent delete boundary

**Files:**
- Create: `src/app/api/marketplace/inbox/delete/route.ts`
- Create: `src/app/api/marketplace/inbox/delete/route.test.ts`
- Modify: `src/adventure/marketplace/api.ts`
- Create: `src/adventure/marketplace/api.inbox-delete.test.ts`

**Interfaces:**
- Produces: `POST /api/marketplace/inbox/delete` with body `{ id: number }`.
- Produces: success DTO `{ ok: true, deletedAt: string }`.
- Produces: `deleteReceivedInbox(id: number): Promise<{ ok: true; deletedAt: string }>`.
- Produces: `inboxDeleteErrorLabel(payload, status): string` mapping `not_completed` to `수령하거나 처리를 마친 우편만 삭제할 수 있어요.`.

- [x] **Step 1: Write failing Route Handler tests**

Cover invalid JSON and IDs (`400`), no session (`401`), missing/not-owned mail (`404`), incomplete mail (`409` with `{ error: "not_completed" }`), completed mail timestamp update, and an already deleted row returning its existing timestamp without another update.

- [x] **Step 2: Run the delete route test and verify failure**

Run: `npx vitest run src/app/api/marketplace/inbox/delete/route.test.ts`

Expected: FAIL because the route module does not exist.

- [x] **Step 3: Implement the minimal delete Route Handler**

Authenticate with `ensureUser()`, validate a positive integer `id`, select the owned row inside a transaction with `FOR UPDATE`, reject a null `claimedAt`, and set `recipientDeletedAt` only when it is currently null. Never delete the database row or mutate reward state.

- [x] **Step 4: Run the delete route tests**

Run: `npx vitest run src/app/api/marketplace/inbox/delete/route.test.ts`

Expected: PASS.

- [x] **Step 5: Write failing client API tests**

Mock `fetch` and assert `deleteReceivedInbox(7)` sends a JSON POST to `/api/marketplace/inbox/delete`, returns the success DTO, maps `not_completed`, and falls back to `우편 삭제 실패 (500)` for a non-JSON failure.

- [x] **Step 6: Run the client API test and verify failure**

Run: `npx vitest run src/adventure/marketplace/api.inbox-delete.test.ts`

Expected: FAIL because the helper functions do not exist.

- [x] **Step 7: Implement the client API helper and error mapping**

Add the exact functions from the Interfaces section to `src/adventure/marketplace/api.ts`; clone the response before JSON parsing so the status fallback remains available.

- [x] **Step 8: Run all Task 2 tests**

Run: `npx vitest run src/app/api/marketplace/inbox/delete/route.test.ts src/adventure/marketplace/api.inbox-delete.test.ts`

Expected: PASS.

---

### Task 3: Inbox delete controls and immediate UI update

**Files:**
- Modify: `src/adventure/v2/V2InboxView.tsx`
- Modify: `src/adventure/v2/V2InboxView.test.tsx`

**Interfaces:**
- Consumes: `deleteReceivedInbox(id)` and `confirmGameAction(input)`.
- Adds: `onDelete: (item: InboxItem) => void` to `InboxMailCard` and `MailDetailModal`.
- Renders: delete controls only when `item.direction !== "sent" && item.claimedAt != null`.

- [x] **Step 1: Write failing visibility tests**

Extend static render tests so completed received mail contains `삭제`, pending reward/action mail does not, and sent mail does not. Verify both card and detail modal behavior and accessible labels such as `보낸사람님의 쪽지 삭제` or the mail-kind fallback.

- [x] **Step 2: Run the component test and verify failure**

Run: `npx vitest run src/adventure/v2/V2InboxView.test.tsx`

Expected: FAIL because the delete props and controls do not exist.

- [x] **Step 3: Add delete controls with existing shared surfaces**

Import `Trash`, `confirmGameAction`, and `deleteReceivedInbox`. Render a compact destructive button in completed received cards and a destructive footer button beside `닫기` in completed received detail modals. Stop card event propagation from the delete button.

- [x] **Step 4: Implement the confirmed delete flow in `V2InboxView`**

Use this flow:

```ts
if (!(await confirmGameAction({
  title: "받은 우편 삭제",
  message: "이 우편을 삭제할까요?\n삭제한 우편은 받은 우편함에서 다시 확인할 수 없습니다.",
  confirmLabel: "삭제",
  tone: "danger",
}))) return;

await deleteReceivedInbox(item.id);
setItems((current) => current?.filter((candidate) => candidate.id !== item.id) ?? []);
setSelected((current) => current?.id === item.id ? null : current);
setMsg("우편을 삭제했어요.");
window.dispatchEvent(new Event("v2inbox:refresh"));
```

Share the existing `busy` flag, clear stale errors before the request, preserve the item/modal on failure, and show the mapped API error through the existing error surface.

- [x] **Step 5: Add interaction coverage for success, cancellation, and failure**

In a jsdom test, mock `confirmGameAction`, `deleteReceivedInbox`, inbox loading, and game-state hooks. Verify cancellation sends no request, success removes the selected row and emits `v2inbox:refresh`, and failure retains the row while displaying the error.

- [x] **Step 6: Run the UI tests**

Run: `npx vitest run src/adventure/v2/V2InboxView.test.tsx`

Expected: PASS.

---

### Task 4: Full verification and implementation commit

**Files:**
- Verify all files changed in Tasks 1–3.

**Interfaces:**
- Consumes: completed feature and tests from Tasks 1–3.
- Produces: a verified local implementation commit; no deployment or external write.

- [x] **Step 1: Run the focused inbox suite**

Run: `npx vitest run src/app/api/marketplace/inbox/route.test.ts src/app/api/marketplace/inbox/read/route.test.ts src/app/api/marketplace/inbox/delete/route.test.ts src/adventure/marketplace/api.inbox-delete.test.ts src/adventure/v2/inboxViewState.test.ts src/adventure/v2/V2InboxView.test.tsx`

Expected: all test files pass with zero failed tests.

- [x] **Step 2: Run static and migration checks**

Run: `npx tsc --noEmit`

Run: `npx eslint src/app/api/marketplace/inbox/route.ts src/app/api/marketplace/inbox/route.test.ts src/app/api/marketplace/inbox/delete/route.ts src/app/api/marketplace/inbox/delete/route.test.ts src/adventure/marketplace/api.ts src/adventure/marketplace/api.inbox-delete.test.ts src/adventure/v2/V2InboxView.tsx src/adventure/v2/V2InboxView.test.tsx src/db/schema.ts`

Run: `npm run check-migrations`

Expected: all commands exit 0.

- [x] **Step 3: Inspect diff and working tree**

Run: `git diff --check && git status --short`

Expected: no whitespace errors and only the planned feature, tests, plan, schema, and migration artifacts are changed.

- [x] **Step 4: Commit the verified implementation**

```bash
git add src/db/schema.ts drizzle/0183_inbox_recipient_delete.sql drizzle/meta/0183_snapshot.json drizzle/meta/_journal.json src/app/api/marketplace/inbox/route.ts src/app/api/marketplace/inbox/route.test.ts src/app/api/marketplace/inbox/delete/route.ts src/app/api/marketplace/inbox/delete/route.test.ts src/adventure/marketplace/api.ts src/adventure/marketplace/api.inbox-delete.test.ts src/adventure/v2/V2InboxView.tsx src/adventure/v2/V2InboxView.test.tsx docs/superpowers/plans/2026-09-04-inbox-recipient-delete.md
git commit -m "feat: allow recipients to delete completed mail"
```
