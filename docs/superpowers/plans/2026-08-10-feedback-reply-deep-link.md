# Feedback Reply Deep Link Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 건의 답변 알림을 누른 모든 진입점에서 대상 건의 내역을 즉시 펼쳐 보여준다.

**Architecture:** 클라이언트와 서버가 함께 사용할 수 있는 순수 링크·해시 파서에 URL 형식을 모은다. 건의 API는 최근 50건을 유지하면서 요청된 본인 건의만 보충하고, 건의 화면은 외부 해시 변경을 구독해 대상 조회·펼침·스크롤을 동기화한다.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript, Drizzle ORM, Vitest

## Global Constraints

- 다른 사용자의 건의는 어떤 경우에도 조회하지 않는다.
- 기존 건의 작성·목록 토글·알림 종류의 동작은 유지한다.
- 상단 답변 알림은 클릭한 한 건만 읽음 처리하며, 읽음 요청 실패가 이동을 막지 않는다.
- 동작 변경은 회귀 테스트를 먼저 작성한다.
- 별도 요청 없이는 배포하지 않는다.

---

### Task 1: 공통 건의 링크와 해시 파서

**Files:**
- Create: `src/lib/feedbackNavigation.ts`
- Create: `src/lib/feedbackNavigation.test.ts`

**Interfaces:**
- Produces: `feedbackReplyHref(feedbackId: number): string`
- Produces: `feedbackIdFromHash(hash: string): number | null`
- Produces: `feedbackHistoryApiHref(targetId: number | null): string`

- [ ] **Step 1: 링크·해시·API 주소의 실패 테스트 작성**

```ts
import { describe, expect, it } from "vitest";
import {
  feedbackHistoryApiHref,
  feedbackIdFromHash,
  feedbackReplyHref,
} from "./feedbackNavigation";

describe("건의 답변 이동", () => {
  it("대상 건의 링크와 조회 주소를 만든다", () => {
    expect(feedbackReplyHref(7)).toBe("/feedback#feedback-7");
    expect(feedbackIdFromHash("#feedback-7")).toBe(7);
    expect(feedbackHistoryApiHref(7)).toBe("/api/feedback?targetId=7");
  });

  it("비정상 번호와 해시는 대상 없는 주소로 정규화한다", () => {
    expect(feedbackReplyHref(0)).toBe("/feedback");
    expect(feedbackIdFromHash("#feedback-0")).toBeNull();
    expect(feedbackIdFromHash("#feedback-7-extra")).toBeNull();
    expect(feedbackHistoryApiHref(null)).toBe("/api/feedback");
  });
});
```

- [ ] **Step 2: 테스트가 모듈 부재로 실패하는지 확인**

Run: `npx vitest run src/lib/feedbackNavigation.test.ts`

Expected: FAIL because `./feedbackNavigation` does not exist.

- [ ] **Step 3: 최소 순수 함수 구현**

```ts
function positiveInteger(value: number): number | null {
  return Number.isSafeInteger(value) && value > 0 ? value : null;
}

export function feedbackReplyHref(feedbackId: number): string {
  const id = positiveInteger(feedbackId);
  return id ? `/feedback#feedback-${id}` : "/feedback";
}

export function feedbackIdFromHash(hash: string): number | null {
  const match = hash.match(/^#feedback-([1-9][0-9]*)$/);
  if (!match) return null;
  return positiveInteger(Number(match[1]));
}

export function feedbackHistoryApiHref(targetId: number | null): string {
  return targetId ? `/api/feedback?targetId=${targetId}` : "/api/feedback";
}
```

- [ ] **Step 4: 단위 테스트 통과 확인**

Run: `npx vitest run src/lib/feedbackNavigation.test.ts`

Expected: PASS, 2 tests.

- [ ] **Step 5: 공통 함수 커밋**

```bash
git add src/lib/feedbackNavigation.ts src/lib/feedbackNavigation.test.ts
git commit -m "feat: add feedback reply navigation helpers"
```

### Task 2: 오래된 대상 건의 보충 조회

**Files:**
- Modify: `src/app/api/feedback/route.ts`
- Create: `src/app/api/feedback/route.test.ts`

**Interfaces:**
- Consumes: `GET(req: Request)`의 `targetId` 검색 파라미터
- Produces: 최근 50건과 요청된 본인 건의를 중복 없이 합친 `entries`

- [ ] **Step 1: 최근 목록 밖 대상과 잘못된 대상의 실패 테스트 작성**

`db.select()` 체인을 순서대로 돌려주는 mock을 만들고 다음을 검증한다.

```ts
it("최근 50건 밖의 요청 대상 건의를 목록에 보충한다", async () => {
  mocks.queryRows = [[feedbackRow(100)], [feedbackRow(7)]];
  const response = await GET(
    new Request("http://localhost/api/feedback?targetId=7"),
  );
  const body = await response.json();
  expect(body.entries.map((entry: { id: number }) => entry.id)).toEqual([100, 7]);
  expect(mocks.select).toHaveBeenCalledTimes(2);
});

it("잘못된 대상 번호는 최근 목록만 조회한다", async () => {
  mocks.queryRows = [[feedbackRow(100)]];
  await GET(new Request("http://localhost/api/feedback?targetId=invalid"));
  expect(mocks.select).toHaveBeenCalledTimes(1);
});
```

추가 조회 builder의 `where` 호출이 존재하는지 검증하고, 구현에서는 `and(eq(feedbackReports.userId, userId), eq(feedbackReports.id, targetId))`를 사용한다.

- [ ] **Step 2: 기존 GET 시그니처가 Request를 받지 않아 실패하는지 확인**

Run: `npx vitest run src/app/api/feedback/route.test.ts`

Expected: FAIL because the target query is ignored and only recent rows are returned.

- [ ] **Step 3: 사용자 소유 조건을 포함한 대상 보충 조회 구현**

```ts
const FEEDBACK_SELECTION = {
  id: feedbackReports.id,
  category: feedbackReports.category,
  content: feedbackReports.content,
  imageKey: feedbackReports.imageKey,
  status: feedbackReports.status,
  adminReply: feedbackReports.adminReply,
  reviewedAt: feedbackReports.reviewedAt,
  repliedAt: feedbackReports.repliedAt,
  createdAt: feedbackReports.createdAt,
};

export async function GET(req: Request) {
  const userId = await ensureUser();
  // existing unauthorized response
  const rawTargetId = new URL(req.url).searchParams.get("targetId");
  const parsedTargetId = Number(rawTargetId);
  const targetId =
    rawTargetId != null && Number.isSafeInteger(parsedTargetId) && parsedTargetId > 0
      ? parsedTargetId
      : null;
  const recentEntries = await db
    .select(FEEDBACK_SELECTION)
    .from(feedbackReports)
    .where(eq(feedbackReports.userId, userId))
    .orderBy(desc(feedbackReports.id))
    .limit(50);
  let entries = recentEntries;
  if (targetId && !recentEntries.some((entry) => entry.id === targetId)) {
    const [target] = await db
      .select(FEEDBACK_SELECTION)
      .from(feedbackReports)
      .where(
        and(
          eq(feedbackReports.userId, userId),
          eq(feedbackReports.id, targetId),
        ),
      )
      .limit(1);
    if (target) entries = [...recentEntries, target].sort((a, b) => b.id - a.id);
  }
  return feedbackEntriesResponse(entries);
}
```

반복되는 select 필드와 응답 변환은 파일 내부 상수·함수로만 추출한다. POST 동작은 변경하지 않는다.

- [ ] **Step 4: API 회귀 테스트 통과 확인**

Run: `npx vitest run src/app/api/feedback/route.test.ts`

Expected: PASS, including target inclusion and invalid target behavior.

- [ ] **Step 5: API 변경 커밋**

```bash
git add src/app/api/feedback/route.ts src/app/api/feedback/route.test.ts
git commit -m "feat: load targeted feedback history entry"
```

### Task 3: 모든 답변 알림 진입점 통일

**Files:**
- Modify: `src/lib/server/webPush.test.ts`
- Modify: `src/lib/server/webPush.ts`
- Modify: `src/adventure/v2/NotificationBell.tsx`
- Modify: `src/app/(game)/notifications/page.tsx`
- Modify: `src/app/(game)/plaza/inbox/page.tsx`

**Interfaces:**
- Consumes: `feedbackReplyHref(feedbackId)`
- Preserves: 협동 보스·농장·우편 및 다른 일반 알림 이동

- [ ] **Step 1: 웹 푸시 대상 링크 실패 테스트로 변경**

```ts
expect(
  pushMessageForNotification("feedback_replied", { feedbackId: 7 }),
).toMatchObject({
  title: "문의 답변 도착",
  url: "/feedback#feedback-7",
});
```

- [ ] **Step 2: 기존 `/feedback` 결과로 실패하는지 확인**

Run: `npx vitest run src/lib/server/webPush.test.ts src/lib/feedbackNavigation.test.ts`

Expected: FAIL with expected `/feedback#feedback-7`, received `/feedback`.

- [ ] **Step 3: 공통 링크를 웹 푸시와 페이지 라우터에 적용**

`webPush.ts`와 두 페이지의 중복 문자열을 `feedbackReplyHref(feedbackId)` 호출로 교체한다.

- [ ] **Step 4: 상단 알림 종에서 답변 알림을 직접 처리**

`openNotification`의 협동 보스 처리 다음에 `feedback_replied` 분기를 둔다.

```ts
if (notification.type === "feedback_replied") {
  const { feedbackId } = notification.payload as { feedbackId: number };
  setOpen(false);
  setNotificationUnread((current) => Math.max(0, current - 1));
  setItems((current) =>
    current?.filter(
      (entry) =>
        entry.kind !== "notification" || entry.item.id !== notification.id,
    ) ?? null,
  );
  void acknowledgeV2Notification(notification.id);
  router.push(feedbackReplyHref(feedbackId));
  return;
}
```

- [ ] **Step 5: 알림 링크 테스트 통과 확인**

Run: `npx vitest run src/lib/server/webPush.test.ts src/lib/feedbackNavigation.test.ts`

Expected: PASS.

- [ ] **Step 6: 알림 진입점 변경 커밋**

```bash
git add src/lib/server/webPush.ts src/lib/server/webPush.test.ts src/adventure/v2/NotificationBell.tsx 'src/app/(game)/notifications/page.tsx' 'src/app/(game)/plaza/inbox/page.tsx'
git commit -m "feat: open replied feedback from notifications"
```

### Task 4: 대상 건의 펼침과 같은 페이지 해시 동기화

**Files:**
- Modify: `src/components/FeedbackHistory.tsx`
- Modify: `src/components/FeedbackCenter.tsx`
- Test: `src/lib/feedbackNavigation.test.ts`

**Interfaces:**
- Consumes: `feedbackIdFromHash(window.location.hash)`
- Consumes: `feedbackHistoryApiHref(targetId)`
- Produces: `feedbackSelectionFromHash(hash: string): { targetId: number | null; expandedId: number | null }`
- Preserves: 사용자가 목록 제목을 눌러 여닫는 기존 해시 갱신

- [ ] **Step 1: 외부 해시가 조회·펼침 대상을 함께 바꾸는 실패 테스트 작성**

```ts
it("외부 답변 해시를 조회 대상과 펼침 대상으로 변환한다", () => {
  expect(feedbackSelectionFromHash("#feedback-91")).toEqual({
    targetId: 91,
    expandedId: 91,
  });
  expect(feedbackSelectionFromHash("#invalid")).toEqual({
    targetId: null,
    expandedId: null,
  });
});
```

- [ ] **Step 2: 새 선택 함수가 없어 실패하는지 확인**

Run: `npx vitest run src/lib/feedbackNavigation.test.ts`

Expected: FAIL because `feedbackSelectionFromHash` is not exported.

- [ ] **Step 3: 선택 함수를 구현하고 `FeedbackHistory`가 외부 해시 변경을 구독하도록 구현**

```ts
export function feedbackSelectionFromHash(hash: string): {
  targetId: number | null;
  expandedId: number | null;
} {
  const id = feedbackIdFromHash(hash);
  return { targetId: id, expandedId: id };
}
```

`targetId`와 `expandedId`를 분리한다. 최초 값과 `hashchange`에서는 둘을 같은 번호로 갱신하고, 사용자의 로컬 토글에서는 `targetId`를 비워 불필요한 대상 재조회를 피한다.

```ts
const initialSelection =
  typeof window === "undefined"
    ? { targetId: null, expandedId: null }
    : feedbackSelectionFromHash(window.location.hash);
const [targetId, setTargetId] = useState<number | null>(initialSelection.targetId);
const [expandedId, setExpandedId] = useState<number | null>(initialSelection.expandedId);

useEffect(() => {
  const syncHash = () => {
    const next = feedbackSelectionFromHash(window.location.hash);
    setTargetId(next.targetId);
    setExpandedId(next.expandedId);
  };
  window.addEventListener("hashchange", syncHash);
  return () => window.removeEventListener("hashchange", syncHash);
}, []);
```

`useAsyncData` fetch URL을 `feedbackHistoryApiHref(targetId)`로 바꾸고 의존성에 `targetId`를 추가한다. 로드 완료 후 `targetId`가 목록에 없으면 `해당 건의를 찾을 수 없습니다.` 안내를 표시한다. 기존 펼침 후 `scrollIntoView` 효과는 유지한다.

- [ ] **Step 4: `FeedbackCenter`의 해시 판정을 공통 파서로 교체**

`startsWith("#feedback-")` 대신 `feedbackIdFromHash(...) != null`을 사용해 비정상 해시가 내역 탭을 여는 일을 막는다.

- [ ] **Step 5: 관련 테스트·린트·타입 검사**

Run:

```bash
npx vitest run src/lib/feedbackNavigation.test.ts src/lib/server/webPush.test.ts src/app/api/feedback/route.test.ts
npx eslint src/lib/feedbackNavigation.ts src/lib/feedbackNavigation.test.ts src/lib/server/webPush.ts src/lib/server/webPush.test.ts src/adventure/v2/NotificationBell.tsx src/components/FeedbackCenter.tsx src/components/FeedbackHistory.tsx src/app/api/feedback/route.ts src/app/api/feedback/route.test.ts 'src/app/(game)/notifications/page.tsx' 'src/app/(game)/plaza/inbox/page.tsx'
npx tsc --noEmit
```

Expected: all commands exit 0.

- [ ] **Step 6: 최종 구현 커밋**

```bash
git add src/components/FeedbackHistory.tsx src/components/FeedbackCenter.tsx src/lib/feedbackNavigation.test.ts
git commit -m "feat: expand targeted feedback history"
```

### Task 5: 완료 전 통합 검증

**Files:**
- Verify only; no new files expected.

**Interfaces:**
- Verifies: spec completion conditions across shared navigation, API ownership, notifications, and history UI

- [ ] **Step 1: 관련 회귀 테스트 재실행**

Run: `npx vitest run src/lib/feedbackNavigation.test.ts src/lib/server/webPush.test.ts src/app/api/feedback/route.test.ts`

Expected: all files and tests pass.

- [ ] **Step 2: 정적 검증 재실행**

Run: the exact ESLint command from Task 4, then `npx tsc --noEmit`.

Expected: both exit 0 with no errors.

- [ ] **Step 3: 변경 범위와 커밋 확인**

Run:

```bash
git diff --check
git status --short
git log --oneline -6
```

Expected: whitespace errors are absent, only unrelated concurrent changes remain unstaged, and feedback commits are present.
