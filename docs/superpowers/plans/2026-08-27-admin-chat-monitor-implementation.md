# Admin Chat Monitor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a super-admin-only, read-only monitor for global, trade, guild, public-room, and private-room chat without creating any membership records.

**Architecture:** Keep the ordinary chat authorization path unchanged. Add shared monitor DTO/validation definitions, a server-only read service for Drizzle queries, two narrowly scoped admin Route Handlers, and a lazy-loaded admin client tab. Every successful message read writes metadata-only audit history while all domain chat and membership tables remain read-only.

**Tech Stack:** Next.js 16.2 App Router Route Handlers, React 19 client components, TypeScript, Drizzle ORM/PostgreSQL, Tailwind CSS surface tokens, Vitest and Testing Library.

## Global Constraints

- Do not deploy or run maintenance-mode commands.
- Read `node_modules/next/dist/docs/01-app/01-getting-started/15-route-handlers.md` and `node_modules/next/dist/docs/01-app/02-guides/lazy-loading.md` before code changes; Next.js 16.2.11 Route Handler GETs are uncached by default and every handler must perform server-side authorization.
- Every monitor Route Handler must call `requireAdminRole("super")` inside the route module.
- Never insert, update, or delete `chat_room_members`, `guild_members`, chat rooms, invites, messages, or saves from monitor code.
- Do not apply the administrator's personal block list to monitor reads.
- Keep ordinary `/api/chat` membership and guild authorization unchanged.
- Use `SURFACE_CARD` and `SURFACE_INSET`; do not add translucent content surfaces or whole-card opacity.
- Monitor UI is read-only and exposes no send, join, invite, kick, delete, or sanction action.
- Current chat retention remains `CHAT_RETENTION_DAYS` (currently 3 days); no archival schema or migration is added.
- Do not create subagents because repository instructions prohibit them unless explicitly requested.

---

### Task 1: Shared monitor contracts and target-list API

**Files:**
- Create: `src/lib/admin-chat-monitor.ts`
- Create: `src/lib/server/adminChatMonitor.ts`
- Create: `src/lib/admin-chat-monitor.test.ts`
- Create: `src/app/api/admin/chat-monitor/rooms/route.ts`
- Create: `src/app/api/admin/chat-monitor/rooms/route.test.ts`

**Interfaces:**
- Produces: `AdminChatKind`, `AdminChatTarget`, `AdminChatRoomsResponse`, `AdminChatMessage`, `AdminChatMessagesResponse` DTOs.
- Produces: `parseAdminChatRoomsQuery(URLSearchParams)` and `parseAdminChatMessagesQuery(URLSearchParams)`, returning `{ ok: true, value } | { ok: false, error }`.
- Produces: `readAdminChatTargets(AdminChatRoomsQuery): Promise<AdminChatRoomsResponse>` for the rooms handler and Task 3 UI.
- Consumes: `db`, `guilds`, `chatRooms`, `chatRoomMembers`, `messages`, and `users` as read-only inputs.

- [ ] **Step 1: Write failing parser tests**

```ts
it("목록 조회 기본값과 상한을 검증한다", () => {
  expect(parseAdminChatRoomsQuery(new URLSearchParams())).toEqual({
    ok: true,
    value: { kind: "all", visibility: "all", q: "", offset: 0, limit: 50 },
  });
  expect(parseAdminChatRoomsQuery(new URLSearchParams("limit=101"))).toEqual({
    ok: false,
    error: "invalid limit",
  });
});

it("메시지 범위별 scopeId 요구를 검증한다", () => {
  expect(parseAdminChatMessagesQuery(new URLSearchParams("kind=room"))).toEqual({
    ok: false,
    error: "invalid scope id",
  });
  expect(parseAdminChatMessagesQuery(new URLSearchParams("kind=global"))).toEqual({
    ok: true,
    value: { kind: "global", scopeId: null, beforeId: null, limit: 100 },
  });
});
```

- [ ] **Step 2: Run parser tests and confirm RED**

Run: `npx vitest run src/lib/admin-chat-monitor.test.ts`

Expected: FAIL because `@/lib/admin-chat-monitor` does not exist.

- [ ] **Step 3: Add exact DTOs and query validation**

```ts
export type AdminChatKind = "global" | "trade" | "guild" | "room";
export type AdminChatRoomsKind = "all" | AdminChatKind;
export type AdminChatVisibility = "all" | "public" | "private";

export type AdminChatRoomsQuery = {
  kind: AdminChatRoomsKind;
  visibility: AdminChatVisibility;
  q: string;
  offset: number;
  limit: number;
};

export type AdminChatMessagesQuery = {
  kind: AdminChatKind;
  scopeId: number | null;
  beforeId: number | null;
  limit: number;
};

type ParseResult<T> = { ok: true; value: T } | { ok: false; error: string };

export function parseAdminChatRoomsQuery(sp: URLSearchParams): ParseResult<AdminChatRoomsQuery> {
  const kind = sp.get("kind") ?? "all";
  if (!["all", "global", "trade", "guild", "room"].includes(kind)) {
    return { ok: false, error: "invalid kind" };
  }
  const visibility = sp.get("visibility") ?? "all";
  if (!["all", "public", "private"].includes(visibility)) {
    return { ok: false, error: "invalid visibility" };
  }
  const offset = Number(sp.get("offset") ?? 0);
  if (!Number.isSafeInteger(offset) || offset < 0) {
    return { ok: false, error: "invalid offset" };
  }
  const limit = Number(sp.get("limit") ?? 50);
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 100) {
    return { ok: false, error: "invalid limit" };
  }
  return {
    ok: true,
    value: {
      kind: kind as AdminChatRoomsKind,
      visibility: visibility as AdminChatVisibility,
      q: (sp.get("q") ?? "").trim().slice(0, 100),
      offset,
      limit,
    },
  };
}

export function parseAdminChatMessagesQuery(sp: URLSearchParams): ParseResult<AdminChatMessagesQuery> {
  const kind = sp.get("kind");
  if (!kind || !["global", "trade", "guild", "room"].includes(kind)) {
    return { ok: false, error: "invalid kind" };
  }
  const rawScopeId = sp.get("scopeId");
  const scopeId = rawScopeId == null ? null : Number(rawScopeId);
  if ((kind === "guild" || kind === "room") && (!Number.isSafeInteger(scopeId) || Number(scopeId) <= 0)) {
    return { ok: false, error: "invalid scope id" };
  }
  if ((kind === "global" || kind === "trade") && rawScopeId != null) {
    return { ok: false, error: "unexpected scope id" };
  }
  const rawBeforeId = sp.get("beforeId");
  const beforeId = rawBeforeId == null ? null : Number(rawBeforeId);
  if (beforeId != null && (!Number.isSafeInteger(beforeId) || beforeId <= 0)) {
    return { ok: false, error: "invalid before id" };
  }
  const limit = Number(sp.get("limit") ?? 100);
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 100) {
    return { ok: false, error: "invalid limit" };
  }
  return { ok: true, value: { kind: kind as AdminChatKind, scopeId, beforeId, limit } };
}
```

Define discriminated `AdminChatTarget` entries with `targetKey`, `kind`, `label`, `latestMessageAt`; guild entries add `scopeId`; room entries add `scopeId`, `visibility`, `ownerId`, `ownerName`, and `memberCount`. Define room/message responses exactly as approved in the design spec.

- [ ] **Step 4: Run parser tests and confirm GREEN**

Run: `npx vitest run src/lib/admin-chat-monitor.test.ts`

Expected: PASS.

- [ ] **Step 5: Write failing target-list route tests**

```ts
it("super 권한이 아니면 서비스 조회를 호출하지 않는다", async () => {
  gate.mockResolvedValue(new Response("forbidden", { status: 403 }));
  const response = await GET(new Request("http://test/api/admin/chat-monitor/rooms"));
  expect(response.status).toBe(403);
  expect(readAdminChatTargets).not.toHaveBeenCalled();
});

it("검증한 필터로 전체 채팅 대상을 반환한다", async () => {
  readAdminChatTargets.mockResolvedValue({ targets: [globalTarget, privateRoom], total: 2, hasMore: false });
  const response = await GET(new Request("http://test/api/admin/chat-monitor/rooms?visibility=private&limit=50"));
  expect(readAdminChatTargets).toHaveBeenCalledWith({ kind: "all", visibility: "private", q: "", offset: 0, limit: 50 });
  expect(await response.json()).toEqual({ targets: [globalTarget, privateRoom], total: 2, hasMore: false });
});

it("잘못된 필터는 400을 반환한다", async () => {
  expect((await GET(new Request("http://test/api/admin/chat-monitor/rooms?kind=nope"))).status).toBe(400);
});
```

- [ ] **Step 6: Run route tests and confirm RED**

Run: `npx vitest run src/app/api/admin/chat-monitor/rooms/route.test.ts`

Expected: FAIL because the route and server reader do not exist.

- [ ] **Step 7: Implement read-only target aggregation and route**

```ts
export async function GET(req: Request) {
  const gate = await requireAdminRole("super");
  if (gate) return gate;
  const parsed = parseAdminChatRoomsQuery(new URL(req.url).searchParams);
  if (!parsed.ok) return new Response(parsed.error, { status: 400 });
  return Response.json(await readAdminChatTargets(parsed.value));
}
```

In `readAdminChatTargets`, issue read-only selects for global/trade latest timestamps, active guild metadata/latest timestamps, room metadata, room member counts, and room latest timestamps. Convert dates to ISO strings, prepend fixed channels, apply `kind`, `visibility`, case-insensitive name/decimal-ID search, order dynamic targets by latest activity then stable `targetKey`, slice with `offset/limit`, and return `total/hasMore`. Include empty active guilds and empty user rooms; exclude `guilds.disbandedAt IS NOT NULL`.

- [ ] **Step 8: Run target-list tests and confirm GREEN**

Run: `npx vitest run src/lib/admin-chat-monitor.test.ts src/app/api/admin/chat-monitor/rooms/route.test.ts`

Expected: PASS.

- [ ] **Step 9: Commit target-list API**

```bash
git add src/lib/admin-chat-monitor.ts src/lib/admin-chat-monitor.test.ts src/lib/server/adminChatMonitor.ts src/app/api/admin/chat-monitor/rooms/route.ts src/app/api/admin/chat-monitor/rooms/route.test.ts
git commit -m "feat: add admin chat target listing"
```

### Task 2: Message-read API, participant context, and audit logging

**Files:**
- Modify: `src/lib/server/adminChatMonitor.ts`
- Create: `src/app/api/admin/chat-monitor/messages/route.ts`
- Create: `src/app/api/admin/chat-monitor/messages/route.test.ts`
- Modify: `src/app/api/chat/route.test.ts`

**Interfaces:**
- Consumes: `AdminChatMessagesQuery` and response DTOs from Task 1.
- Produces: `readAdminChatMessages(AdminChatMessagesQuery): Promise<AdminChatMessagesResponse | null>`, where `null` means a missing/deleted scope.
- Consumes: `currentAdminEmail()` and `logAdminAction()` for successful reads.

- [ ] **Step 1: Write failing message route tests**

```ts
it("멤버가 아닌 super 관리자도 비공개방 메시지와 실제 참여자를 읽는다", async () => {
  readAdminChatMessages.mockResolvedValue(roomMessageResponse);
  const response = await GET(new Request("http://test/api/admin/chat-monitor/messages?kind=room&scopeId=7"));
  expect(response.status).toBe(200);
  expect(readAdminChatMessages).toHaveBeenCalledWith({ kind: "room", scopeId: 7, beforeId: null, limit: 100 });
  expect(await response.json()).toEqual(roomMessageResponse);
});

it("성공한 빈 조회도 본문 없이 감사 로그를 남긴다", async () => {
  readAdminChatMessages.mockResolvedValue({ target: globalTarget, participants: null, messages: [], hasMore: false, nextBeforeId: null });
  await GET(new Request("http://test/api/admin/chat-monitor/messages?kind=global"));
  expect(logAdminAction).toHaveBeenCalledWith({
    adminEmail: "admin@example.com",
    action: "chat_monitor.read",
    detail: { kind: "global", scopeId: null, beforeId: null, messageCount: 0 },
  });
  expect(JSON.stringify(logAdminAction.mock.calls[0])).not.toContain("message body");
});

it("없는 방은 404이며 감사 로그를 남기지 않는다", async () => {
  readAdminChatMessages.mockResolvedValue(null);
  const response = await GET(new Request("http://test/api/admin/chat-monitor/messages?kind=room&scopeId=999"));
  expect(response.status).toBe(404);
  expect(logAdminAction).not.toHaveBeenCalled();
});
```

- [ ] **Step 2: Run message tests and confirm RED**

Run: `npx vitest run src/app/api/admin/chat-monitor/messages/route.test.ts`

Expected: FAIL because the route and reader are absent.

- [ ] **Step 3: Implement isolated message predicates and pagination**

```ts
const scopeWhere =
  query.kind === "global"
    ? and(eq(messages.channel, "global"), isNull(messages.guildId), isNull(messages.roomId))
    : query.kind === "trade"
      ? and(eq(messages.channel, "trade"), isNull(messages.guildId), isNull(messages.roomId))
      : query.kind === "guild"
        ? and(eq(messages.channel, "guild"), eq(messages.guildId, query.scopeId!), isNull(messages.roomId))
        : and(eq(messages.channel, "room"), eq(messages.roomId, query.scopeId!), isNull(messages.guildId));
const rows = await db.select(messageSelection).from(messages)
  .where(query.beforeId == null ? scopeWhere : and(scopeWhere, lt(messages.id, query.beforeId)))
  .orderBy(desc(messages.id)).limit(query.limit + 1);
```

Before selecting messages, load and validate active guild or room metadata. For an initial room request, select participants by joining `chatRoomMembers` to `users`, ordering owner first then `joinedAt/userId`. Return only the first `limit` rows, `hasMore = rows.length > limit`, and `nextBeforeId` equal to the last returned ID when more rows exist. Never query `readBlockedUserIds` and never mutate membership.

- [ ] **Step 4: Implement authorized route and metadata-only audit**

```ts
export async function GET(req: Request) {
  const gate = await requireAdminRole("super");
  if (gate) return gate;
  const parsed = parseAdminChatMessagesQuery(new URL(req.url).searchParams);
  if (!parsed.ok) return new Response(parsed.error, { status: 400 });
  const result = await readAdminChatMessages(parsed.value);
  if (!result) return new Response("not found", { status: 404 });
  await logAdminAction({
    adminEmail: await currentAdminEmail(),
    action: "chat_monitor.read",
    detail: {
      kind: parsed.value.kind,
      scopeId: parsed.value.scopeId,
      beforeId: parsed.value.beforeId,
      messageCount: result.messages.length,
    },
  });
  return Response.json(result);
}
```

- [ ] **Step 5: Add ordinary-chat authorization regression assertions**

Extend `src/app/api/chat/route.test.ts` with a room GET case whose membership query returns no row and assert `403 not in room`; retain the existing guild `403 not in guild` coverage. No ordinary route receives admin imports or bypass branches.

- [ ] **Step 6: Run API tests and confirm GREEN**

Run: `npx vitest run src/app/api/admin/chat-monitor/messages/route.test.ts src/app/api/chat/route.test.ts src/productionSecuritySurface.test.ts`

Expected: PASS, including the repository rule that every admin route contains an authorization call.

- [ ] **Step 7: Commit message API**

```bash
git add src/lib/server/adminChatMonitor.ts src/app/api/admin/chat-monitor/messages/route.ts src/app/api/admin/chat-monitor/messages/route.test.ts src/app/api/chat/route.test.ts
git commit -m "feat: add audited admin chat reads"
```

### Task 3: Read-only administrator monitor tab

**Files:**
- Create: `src/admin/tabs/ChatMonitorTab.tsx`
- Create: `src/admin/tabs/ChatMonitorTab.test.tsx`
- Modify: `src/admin/AdminShell.tsx`

**Interfaces:**
- Consumes: `AdminChatRoomsResponse`, `AdminChatMessagesResponse`, and `AdminChatTarget` from `@/lib/admin-chat-monitor`.
- Consumes: `adminGet<T>(url, signal?)`, `SURFACE_CARD`, `SURFACE_INSET`, and `MessageBody`.
- Produces: named export `ChatMonitorTab` loaded by `AdminShell` through `next/dynamic`.

- [ ] **Step 1: Write failing component tests**

```tsx
it("읽기 전용 안내와 private 방을 표시하고 선택 시 메시지를 조회한다", async () => {
  adminGet.mockImplementation(async (url: string) =>
    url.includes("/rooms?") ? roomsResponse : roomMessagesResponse,
  );
  render(<ChatMonitorTab />);
  expect(await screen.findByText("비밀 작전방")).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: /비밀 작전방/ }));
  expect(await screen.findByText("작전 시작")).toBeTruthy();
  expect(screen.getByText(/최고 관리자 전용/)).toBeTruthy();
  expect(screen.queryByRole("textbox", { name: /메시지/ })).toBeNull();
});

it("대상을 바꾸면 이전 메시지를 제거하고 새 응답만 표시한다", async () => {
  adminGet.mockImplementation(async (url: string) => {
    if (url.includes("/rooms?")) return roomsResponse;
    if (url.includes("scopeId=7")) return roomAMessagesResponse;
    return roomBMessagesResponse;
  });
  render(<ChatMonitorTab />);
  fireEvent.click(await screen.findByRole("button", { name: /A방/ }));
  expect(await screen.findByText("A 메시지")).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: /B방/ }));
  expect(await screen.findByText("B 메시지")).toBeTruthy();
  expect(screen.queryByText("A 메시지")).toBeNull();
});

it("이전 메시지 실패 시 기존 메시지와 재시도 버튼을 유지한다", async () => {
  adminGet
    .mockResolvedValueOnce(roomsResponse)
    .mockResolvedValueOnce(roomMessagesResponse)
    .mockRejectedValueOnce(new Error("HTTP 500"));
  render(<ChatMonitorTab />);
  fireEvent.click(await screen.findByRole("button", { name: /비밀 작전방/ }));
  expect(await screen.findByText("작전 시작")).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "이전 메시지 더 보기" }));
  expect(await screen.findByRole("button", { name: "이전 메시지 다시 시도" })).toBeTruthy();
  expect(screen.getByText("작전 시작")).toBeTruthy();
});
```

- [ ] **Step 2: Run component tests and confirm RED**

Run: `npx vitest run src/admin/tabs/ChatMonitorTab.test.tsx`

Expected: FAIL because `ChatMonitorTab` does not exist.

- [ ] **Step 3: Implement target list state and filters**

Use controlled `kind`, `visibility`, `q`, and `offset` state. Build `/api/admin/chat-monitor/rooms` with `URLSearchParams`, fetch through `useAsyncData`, and retain already loaded list data while refresh is pending. Render kind/visibility selects, search input, total, previous/next buttons, manual refresh, and distinct loading/error/empty states.

- [ ] **Step 4: Implement race-safe selected-target message state**

On selection, increment a request token, clear `messages`, `participants`, `nextBeforeId`, and previous errors immediately, then call the message endpoint. Ignore any response whose token no longer matches. Manual refresh replaces the selected target's first page. `이전 메시지 더 보기` requests `beforeId`, deduplicates by message ID, and appends older descending rows without clearing the current page; failure preserves current messages and shows a retry button.

```ts
const mergeOlderMessages = (current: AdminChatMessage[], older: AdminChatMessage[]) => {
  const seen = new Set(current.map((message) => message.id));
  return [...current, ...older.filter((message) => !seen.has(message.id))];
};
```

- [ ] **Step 5: Render opaque, read-only detail UI**

Use `${SURFACE_CARD} p-4` for top-level list/detail panels and `${SURFACE_INSET} p-3` for nested filters, participants, and message rows. Show `최고 관리자 전용 · 읽기 전용 · 최근 ${CHAT_RETENTION_DAYS}일`, target kind/ID/visibility, participants for room targets, author name/user ID/time, body, and `MessageBody` item links. Link names to `/admin?tab=users&q=<encoded user id>`. Do not reuse `MessageList` because it contains ordinary-user block/report affordances.

- [ ] **Step 6: Add super-only lazy tab integration**

```tsx
const ChatMonitorTab = dynamic(
  () => import("./tabs/ChatMonitorTab").then((module) => module.ChatMonitorTab),
  { loading: adminTabLoading },
);
```

Add `chatMonitor` to `TabKey`, add `{ key: "chatMonitor", label: "채팅 모니터링", ..., group: "community", superOnly: true }`, filter navigation entries with `!tab.superOnly || adminMe?.capabilities.super`, and render `<ChatMonitorTab />` for direct URL access. The Route Handlers remain the authoritative access check.

- [ ] **Step 7: Run UI tests and confirm GREEN**

Run: `npx vitest run src/admin/tabs/ChatMonitorTab.test.tsx`

Expected: PASS.

- [ ] **Step 8: Commit the administrator tab**

```bash
git add src/admin/tabs/ChatMonitorTab.tsx src/admin/tabs/ChatMonitorTab.test.tsx src/admin/AdminShell.tsx
git commit -m "feat: add admin chat monitor tab"
```

### Task 4: Full verification and focused review

**Files:**
- Modify only files from Tasks 1-3 if verification exposes a defect.

**Interfaces:**
- Consumes the completed admin monitor feature.
- Produces a verified, locally committed implementation with no deployment.

- [ ] **Step 1: Run focused tests**

Run: `npx vitest run src/lib/admin-chat-monitor.test.ts src/app/api/admin/chat-monitor/rooms/route.test.ts src/app/api/admin/chat-monitor/messages/route.test.ts src/admin/tabs/ChatMonitorTab.test.tsx src/app/api/chat/route.test.ts src/productionSecuritySurface.test.ts`

Expected: PASS.

- [ ] **Step 2: Run static validation**

Run: `npx eslint src/lib/admin-chat-monitor.ts src/lib/admin-chat-monitor.test.ts src/lib/server/adminChatMonitor.ts src/app/api/admin/chat-monitor/rooms/route.ts src/app/api/admin/chat-monitor/rooms/route.test.ts src/app/api/admin/chat-monitor/messages/route.ts src/app/api/admin/chat-monitor/messages/route.test.ts src/admin/tabs/ChatMonitorTab.tsx src/admin/tabs/ChatMonitorTab.test.tsx src/admin/AdminShell.tsx src/app/api/chat/route.test.ts`

Run: `npx tsc --noEmit`

Expected: both commands exit 0.

- [ ] **Step 3: Run repository checks and production build**

Run: `npm run check-module-budgets`

Run: `npm run build`

Expected: module budgets, image prechecks, type/build validation, and production build all pass.

- [ ] **Step 4: Review security and data isolation diff**

Run: `git diff HEAD~3 -- src/app/api/admin/chat-monitor src/lib/server/adminChatMonitor.ts src/admin/tabs/ChatMonitorTab.tsx src/admin/AdminShell.tsx src/app/api/chat/route.ts`

Confirm all monitor routes call `requireAdminRole("super")`, audit detail excludes content, the monitor service contains only selects, no ordinary chat authorization changed, no write controls render, and surface tokens remain opaque.

- [ ] **Step 5: Commit any verification fixes**

If Step 1-4 required code corrections, stage only the affected monitor files and create `fix: close admin chat monitor verification`; otherwise do not create an empty commit.
