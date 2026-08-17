# Marketplace Recent Trade Reporting Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 공개 최근 체결 100건과 거래 전용 신고 흐름을 추가하고, 구매 화면에서 사라지던 본인 스택 매물을 안전하게 노출한다.

**Architecture:** 기존 익명 체결 API와 `ugc_reports` 파이프라인을 확장한다. 거래소 전용 신고 컴포넌트는 거래 ID와 사유만 보내고 서버가 판매 완료 행을 다시 조회해 스냅샷과 양쪽 계정을 구성한다. 구매 화면에서는 본인 스택 매물을 자동구매 묶음과 분리한 개별 관리 카드로 파생한다.

**Tech Stack:** Next.js 16.2 Route Handlers, React 19 Client Components, TypeScript, Drizzle ORM/PostgreSQL, Vitest, Tailwind CSS

## Global Constraints

- 공개·본인 최근 체결 한도는 각각 최신 100건, 화면 페이지 크기는 10건이다.
- 공개 응답에는 판매자·구매자 이름, 사용자 UUID, 매수·매도 방향을 넣지 않는다.
- 거래 신고 사유는 `abnormal_price`, `market_manipulation`, `real_money_trade`, `other`만 허용한다.
- 기존 시간당 신고 10건 제한과 활성 중복 방지를 유지한다.
- 본인 스택 매물은 구매 수량·최저가·견적·실제 자동구매 후보에서 제외한다.
- 장면 배경 위의 신규 카드와 대화상자는 불투명 공용 surface를 사용한다.
- 완료 거래 60일 보관 정책은 바꾸지 않는다.
- 배포와 점검 모드 변경을 하지 않는다.
- 현재 작업 트리의 관련 없는 변경을 수정하거나 커밋하지 않는다.

---

### Task 1: 거래 신고 분류와 DB 제약 확장

**Files:**
- Modify: `src/lib/ugc-safety.ts`
- Modify: `src/lib/ugc-safety.test.ts`
- Modify: `src/db/schema.ts`
- Create: `drizzle/0167_marketplace_trade_reports.sql`
- Modify: `drizzle/meta/_journal.json`

**Interfaces:**
- Produces: `CONTENT_REPORT_REASONS`, `MARKETPLACE_TRADE_REPORT_REASONS`, `isAllowedUgcReportReason(sourceType, reason)`, `UgcReportReason`
- Consumes: existing `UgcSourceType`, `isUgcSourceType`, `ugcReports` checks

- [ ] **Step 1: Write failing taxonomy tests**

Add literal assertions proving `marketplace_trade` is a source, all four trade reasons are accepted for that source, and content-only reasons are rejected for it:

```ts
expect(isUgcSourceType("marketplace_trade")).toBe(true);
expect(isAllowedUgcReportReason("marketplace_trade", "abnormal_price")).toBe(true);
expect(isAllowedUgcReportReason("marketplace_trade", "other")).toBe(true);
expect(isAllowedUgcReportReason("marketplace_trade", "harassment")).toBe(false);
expect(isAllowedUgcReportReason("bulletin_post", "abnormal_price")).toBe(false);
```

- [ ] **Step 2: Run the taxonomy test and verify RED**

Run: `npm test -- src/lib/ugc-safety.test.ts`

Expected: FAIL because `isAllowedUgcReportReason` and `marketplace_trade` do not exist.

- [ ] **Step 3: Implement the source-specific reason sets**

Keep existing content reason labels and add:

```ts
export const MARKETPLACE_TRADE_REPORT_REASONS = [
  "abnormal_price",
  "market_manipulation",
  "real_money_trade",
  "other",
] as const;

export function isAllowedUgcReportReason(
  sourceType: UgcSourceType,
  value: unknown,
): value is UgcReportReason {
  const allowed = sourceType === "marketplace_trade"
    ? MARKETPLACE_TRADE_REPORT_REASONS
    : CONTENT_REPORT_REASONS;
  return typeof value === "string" && allowed.includes(value as never);
}
```

Keep `UGC_REPORT_REASON_LABELS` exhaustive over the union.

- [ ] **Step 4: Update schema checks and migration**

Update the Drizzle source check with `'marketplace_trade'` and reason check with the three new codes. Create migration SQL that drops and recreates only those two check constraints. Append journal index 167 after the existing index 166 without changing the existing 0166 entry. Generated/configuration migration content does not need a separate TDD cycle.

- [ ] **Step 5: Verify taxonomy and migration checks**

Run:

```bash
npm test -- src/lib/ugc-safety.test.ts
npm run check-migrations
```

Expected: both PASS.

- [ ] **Step 6: Commit Task 1 files only**

```bash
git add src/lib/ugc-safety.ts src/lib/ugc-safety.test.ts src/db/schema.ts drizzle/0167_marketplace_trade_reports.sql drizzle/meta/_journal.json
git commit -m "feat: add marketplace trade report taxonomy"
```

### Task 2: 서버 권위 거래 신고 원본과 요청 검증

**Files:**
- Create: `src/lib/server/marketplaceTradeReport.ts`
- Create: `src/lib/server/marketplaceTradeReport.test.ts`
- Modify: `src/lib/server/ugcSafety.ts`
- Modify: `src/app/api/safety/reports/route.ts`
- Modify: `src/app/api/safety/reports/route.test.ts`

**Interfaces:**
- Produces: `resolveMarketplaceTradeReportSource(reporterUserId, listingId): Promise<ResolvedUgcSource | null>`
- Extends: `ResolvedUgcSource.relatedAccounts?: Array<{ userId: string; name: string }>`
- Consumes: `isAllowedUgcReportReason`, `marketplaceListingsV2`, `resolveActor`

- [ ] **Step 1: Write failing pure trade snapshot/target tests**

Use literal sold fixtures to prove the resolver helper chooses buyer for a reporting seller, seller for a reporting buyer or observer, deduplicates related accounts, calculates unit price, and rejects non-sold/missing-closed-at rows. The production mutation each test catches is the wrong party, leaked client data, or an invalid listing accepted as evidence.

```ts
expect(buildMarketplaceTradeReportSource(soldRow, "seller", buyerActor)).toMatchObject({
  targetUserId: "buyer",
  sourceType: "marketplace_trade",
  sourceId: "42",
  relatedAccounts: [
    { userId: "seller", name: "판매자" },
    { userId: "buyer", name: "구매자" },
  ],
});
expect(result?.contentSnapshot).toContain("개당 가격: 100 G");
```

- [ ] **Step 2: Run resolver tests and verify RED**

Run: `npm test -- src/lib/server/marketplaceTradeReport.test.ts`

Expected: FAIL because the module does not exist.

- [ ] **Step 3: Implement focused trade source construction and DB lookup**

Select only the authoritative listing fields, require `status === "sold"` and `closedAt`, resolve the buyer name when a buyer remains, and return `null` if no non-self target can be selected. Put seller/buyer IDs and names plus listing payload and bid metadata in `contextSnapshot`; never return them from the history route.

- [ ] **Step 4: Connect `resolveUgcSource`**

Dispatch `marketplace_trade` before the existing profile/chat/content branches and return the focused resolver result. Keep all existing access rules unchanged.

- [ ] **Step 5: Write failing report route tests**

Add cases that reject a trade with `subjectType: "user"`, reject `harassment`, accept `abnormal_price`, and send an operations alert whose account list contains reporter, seller, and buyer once each. Assert the response and inserted real payload rather than mock existence alone.

- [ ] **Step 6: Run route tests and verify RED**

Run: `npm test -- src/app/api/safety/reports/route.test.ts`

Expected: FAIL because source-specific validation and related accounts are not used.

- [ ] **Step 7: Implement source-specific route validation and alert accounts**

After validating the source type, require:

```ts
if (body.sourceType === "marketplace_trade" && body.subjectType !== "content") {
  return new Response("invalid subject type", { status: 400 });
}
if (!isAllowedUgcReportReason(body.sourceType, body.reason)) {
  return new Response("invalid reason", { status: 400 });
}
```

Build the `accounts` alert array by stable user ID deduplication from reporter, target, and `relatedAccounts`.

- [ ] **Step 8: Verify server report tests**

Run: `npm test -- src/lib/server/marketplaceTradeReport.test.ts src/app/api/safety/reports/route.test.ts src/lib/ugc-safety.test.ts`

Expected: PASS.

- [ ] **Step 9: Commit Task 2 files only**

```bash
git add src/lib/server/marketplaceTradeReport.ts src/lib/server/marketplaceTradeReport.test.ts src/lib/server/ugcSafety.ts src/app/api/safety/reports/route.ts src/app/api/safety/reports/route.test.ts
git commit -m "feat: resolve marketplace trades for reports"
```

### Task 3: 최근 체결 100건 API 계약

**Files:**
- Modify: `src/lib/server/marketplaceV2.ts`
- Create: `src/app/api/v2/marketplace/history/route.test.ts`
- Modify: `src/app/api/v2/marketplace/history/route.ts`

**Interfaces:**
- Produces: public history `{ ok: true, trades: Trade[] }` without account fields; mine history adds only `side`
- Consumes: `MARKETPLACE_V2_HISTORY_LIMIT = 100`

- [ ] **Step 1: Write failing route contract tests**

Mock only authentication, rate limiting, and the DB boundary. Assert `.limit(100)` is used, public JSON has no `sellerId`, `sellerName`, `buyerId`, or `side`, and mine JSON derives `buy`/`sell` without retaining IDs.

- [ ] **Step 2: Run history route tests and verify RED**

Run: `npm test -- src/app/api/v2/marketplace/history/route.test.ts`

Expected: FAIL because the limit remains 50 and the test file is new.

- [ ] **Step 3: Change the shared history limit to 100**

Preserve the existing selected public fields and the 15-second in-memory public cache. Export a test reset only if cache isolation cannot be achieved through module reset; do not add test-only lifecycle methods to production.

- [ ] **Step 4: Verify route contract tests**

Run: `npm test -- src/app/api/v2/marketplace/history/route.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit Task 3 files only**

```bash
git add src/lib/server/marketplaceV2.ts src/app/api/v2/marketplace/history/route.ts src/app/api/v2/marketplace/history/route.test.ts
git commit -m "feat: expand marketplace trade history"
```

### Task 4: 거래소 전용 신고 대화상자

**Files:**
- Create: `src/adventure/v2/marketplace/MarketplaceTradeReportButton.tsx`
- Create: `src/adventure/v2/marketplace/MarketplaceTradeReportButton.test.tsx`

**Interfaces:**
- Produces: `<MarketplaceTradeReportButton tradeId: number itemName: string />`
- Consumes: `MARKETPLACE_TRADE_REPORT_REASONS`, `UGC_REPORT_REASON_LABELS`, `SURFACE_CARD`, `SURFACE_INSET`

- [ ] **Step 1: Write failing rendering and response-message tests**

Render the real exported dialog surface with a trade ID and assert all four labels, 500-character textarea limit, no user/block choices, and opaque surface classes. Test the pure HTTP response mapper for `409`, `429`, `404`, and fallback messages with literal expected Korean strings.

- [ ] **Step 2: Run component tests and verify RED**

Run: `npm test -- src/adventure/v2/marketplace/MarketplaceTradeReportButton.test.tsx`

Expected: FAIL because the component does not exist.

- [ ] **Step 3: Implement the report button and portal dialog**

POST exactly:

```ts
{
  subjectType: "content",
  sourceType: "marketplace_trade",
  sourceId: tradeId,
  reason,
  details,
}
```

Use a flag icon, Escape/backdrop close behavior, a busy guard, `role="dialog"`, and inline success/error status. After success, mark that row as reported and disable repeat submission for the current mount.

- [ ] **Step 4: Verify component tests**

Run: `npm test -- src/adventure/v2/marketplace/MarketplaceTradeReportButton.test.tsx`

Expected: PASS.

- [ ] **Step 5: Commit Task 4 files only**

```bash
git add src/adventure/v2/marketplace/MarketplaceTradeReportButton.tsx src/adventure/v2/marketplace/MarketplaceTradeReportButton.test.tsx
git commit -m "feat: add marketplace trade report dialog"
```

### Task 5: 공개 최근 거래 탭과 본인 스택 매물 관리 카드

**Files:**
- Modify: `src/adventure/v2/marketplace/marketplaceShared.tsx`
- Modify: `src/adventure/v2/marketplace/marketplaceShared.test.ts`
- Modify: `src/adventure/v2/V2MarketplaceView.tsx`
- Modify: `src/adventure/v2/V2MarketplaceView.layout.test.tsx`

**Interfaces:**
- Produces: top-level `Tab = "browse" | "sell" | "recent" | "mine"`
- Produces: `individualMarketplaceListings(listings, browseMode)` that includes own stack listings as individual rows
- Consumes: `MarketplaceTradeReportButton`, public `/api/v2/marketplace/history`, existing `ListingList`

- [ ] **Step 1: Write failing listing partition tests**

With one foreign iron stack, one own iron stack, and one equipment row, assert the group contains only the foreign stack while individual fixed rows contain the own stack and equipment. Assert the own stack cannot change a hand-computed quote of `200G` for two foreign units.

- [ ] **Step 2: Run shared marketplace tests and verify RED**

Run: `npm test -- src/adventure/v2/marketplace/marketplaceShared.test.ts`

Expected: FAIL because own stacks are absent from individual fixed rows.

- [ ] **Step 3: Implement the listing partition helper**

Return individual rows when the mode is auction, the listing is not stackable, or `listing.isMine` is true. Keep `groupMarketplaceStackListings` excluding own rows.

- [ ] **Step 4: Write failing marketplace layout tests**

Assert server-rendered markup contains four top-level tabs including `최근 거래`, uses `grid-cols-4`, and renders the report action in an exported/public-history list surface. Add a fixture-based assertion that an own fixed stack receives `내 매물 관리` instead of a buy control.

- [ ] **Step 5: Run layout tests and verify RED**

Run: `npm test -- src/adventure/v2/V2MarketplaceView.layout.test.tsx`

Expected: FAIL because the fourth tab and management action do not exist.

- [ ] **Step 6: Implement public and personal history state separately**

Rename existing state to `myHistory`; add `recentTrades`. Fetch `/api/v2/marketplace/history` only for `tab === "recent"` and `?mine=1` for the personal history. Convert both through one trade-to-listing helper, but only personal rows use `side` for buy/sell labels.

- [ ] **Step 7: Render the recent tab and report actions**

Reuse `ListingList` with `historical`, paginate 10 rows, show relative time, and render `MarketplaceTradeReportButton` for each trade. Change the nav grid to four columns and keep all cards on opaque surfaces.

- [ ] **Step 8: Render own fixed listings as management cards**

Use the partition helper. For fixed own equipment or stack cards, render `내 매물 관리` and set `tab` to `mine` plus `mineTab` to `active`. Keep own active-auction bid inspection unchanged.

- [ ] **Step 9: Verify marketplace UI tests**

Run:

```bash
npm test -- src/adventure/v2/marketplace/marketplaceShared.test.ts src/adventure/v2/V2MarketplaceView.layout.test.tsx src/adventure/v2/marketplace/MarketplaceStackBrowse.test.tsx
```

Expected: PASS.

- [ ] **Step 10: Commit Task 5 files only**

```bash
git add src/adventure/v2/marketplace/marketplaceShared.tsx src/adventure/v2/marketplace/marketplaceShared.test.ts src/adventure/v2/V2MarketplaceView.tsx src/adventure/v2/V2MarketplaceView.layout.test.tsx
git commit -m "feat: show recent and owned marketplace listings"
```

### Task 6: 운영 신고함의 거래 표시와 안전한 처리 동작

**Files:**
- Modify: `src/admin/tabs/SafetyReportsTab.tsx`
- Create: `src/admin/tabs/SafetyReportsTab.test.tsx`

**Interfaces:**
- Consumes: `marketplace_trade`, extended `UGC_REPORT_REASON_LABELS`, `contextSnapshot.relatedAccounts`
- Produces: read-only trade evidence display and no destructive content-removal action for trade reports

- [ ] **Step 1: Write failing admin rendering test**

Render an item with a marketplace trade report and assert `거래소 체결 신고`, the trade reason label, both related account links/names, and the absence of `신고 콘텐츠 제거`.

- [ ] **Step 2: Run admin test and verify RED**

Run: `npm test -- src/admin/tabs/SafetyReportsTab.test.tsx`

Expected: FAIL because the source label and trade-specific treatment do not exist.

- [ ] **Step 3: Implement trade evidence treatment**

Add `marketplace_trade: "거래소 체결"`, render related accounts from a validated array in `contextSnapshot`, update the section introduction to include transactions, and hide the content-removal button when the source is a trade. Status updates, notes, and the primary target sanction link remain available.

- [ ] **Step 4: Verify admin test**

Run: `npm test -- src/admin/tabs/SafetyReportsTab.test.tsx`

Expected: PASS.

- [ ] **Step 5: Commit Task 6 files only**

```bash
git add src/admin/tabs/SafetyReportsTab.tsx src/admin/tabs/SafetyReportsTab.test.tsx
git commit -m "feat: review marketplace trade reports"
```

### Task 7: 통합 검증과 범위 감사

**Files:**
- Modify only if verification finds a feature regression in the files above.

**Interfaces:**
- Consumes: all tasks above
- Produces: verified local implementation; no deployment

- [ ] **Step 1: Run focused tests together**

```bash
npm test -- src/lib/ugc-safety.test.ts src/lib/server/marketplaceTradeReport.test.ts src/app/api/safety/reports/route.test.ts src/app/api/v2/marketplace/history/route.test.ts src/adventure/v2/marketplace/MarketplaceTradeReportButton.test.tsx src/adventure/v2/marketplace/marketplaceShared.test.ts src/adventure/v2/V2MarketplaceView.layout.test.tsx src/adventure/v2/marketplace/MarketplaceStackBrowse.test.tsx src/admin/tabs/SafetyReportsTab.test.tsx
```

Expected: all PASS with no unhandled errors.

- [ ] **Step 2: Run static and repository checks**

```bash
npx tsc --noEmit
npx eslint src/lib/ugc-safety.ts src/lib/server/marketplaceTradeReport.ts src/lib/server/ugcSafety.ts src/app/api/safety/reports/route.ts src/app/api/v2/marketplace/history/route.ts src/adventure/v2/marketplace/MarketplaceTradeReportButton.tsx src/adventure/v2/marketplace/marketplaceShared.tsx src/adventure/v2/V2MarketplaceView.tsx src/admin/tabs/SafetyReportsTab.tsx
npm run check-migrations
npm run check-images
git diff --check
```

Expected: all commands exit 0. If full TypeScript reports an unrelated pre-existing failure in a user-modified file, record it with the exact path and separately verify all changed files through focused tests and ESLint.

- [ ] **Step 3: Privacy and scope audit**

Inspect the public history JSON mapper and client `Trade` type to confirm no seller/buyer fields were added. Inspect `git diff --name-only` and ensure only planned files are included in this feature's commits. Confirm no deployment or maintenance command ran.

- [ ] **Step 4: Final implementation commit if verification required changes**

Stage only the affected planned files and commit with a message describing the verified correction. Do not amend or include unrelated worktree changes.
