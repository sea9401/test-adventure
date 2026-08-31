# Trade Suspension Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 관리자가 기간제·영구 거래 정지를 부과하고 모든 플레이어 간 경제 이전을 서버에서 차단하며, 기존 거래 노출과 에스크로를 원자적으로 정리한다.

**Architecture:** `users`의 비정규화된 현재 상태와 `user_sanctions` 이력을 함께 사용하고, 모든 경제 쓰기 경로가 공통 거래 참여자 잠금 모듈을 통과하게 한다. 제재 부과는 유저 행을 먼저 잠근 트랜잭션에서 매물·구매주문·최고 입찰을 정리하며, 거래소·우편·길드 서비스는 같은 정책과 오류 계약을 재사용한다. 관리자와 유저 UI는 현재 상태 API만 표시하고 서버 판정을 보안 경계로 유지한다.

**Tech Stack:** Next.js 16.2.11 App Router Route Handlers, React 19.2, TypeScript, Drizzle ORM 0.45/PostgreSQL, Vitest 4.1, Tailwind CSS surface tokens

## Global Constraints

- 구현 전 `node_modules/next/dist/docs/01-app/01-getting-started/15-route-handlers.md`와 `node_modules/next/dist/docs/01-app/02-guides/testing/vitest.md`의 현재 저장소 버전을 따른다.
- Route Handler는 native `Request`/`Response`를 사용하며 POST/PATCH 응답을 캐시하지 않는다.
- 거래 정지는 거래 조회, 본인 매물·구매주문 취소, 반환·정산·시스템 보상 우편 수령과 일반 게임을 막지 않는다.
- 유저 간 쪽지·선물 발송, 플레이어 선물 수령, 거래소 체결, 길드 창고와 길드 교역소 자산 이전은 서버에서 차단한다.
- 계정 전체 정지·영구 밴은 거래 제한을 포함하고 활성 거래 정리를 실행하되, 계정 제재 해제는 독립 거래 정지를 해제하지 않는다.
- 제재 부과와 자산 이동은 유저 ID 오름차순 잠금으로 직렬화한다.
- 신규 관리자 카드와 제재 안내 표면은 `SURFACE_CARD`, `SURFACE_INSET`, `SURFACE_ACCENT`를 사용하고 반투명 본문 카드를 만들지 않는다.
- 현재 다음 Drizzle 마이그레이션은 `0169`다. 구현 시작 시 journal을 다시 확인하고 충돌하면 다음 빈 번호로 한 번만 재생성한다.
- 운영 배포, 실제 유저 제재 적용과 점검 모드 변경을 수행하지 않는다.
- 관련 없는 작업 트리 변경을 수정하거나 커밋하지 않는다.
- 프로젝트 지침에 따라 사용자가 명시적으로 위임 방식을 선택하기 전에는 서브에이전트를 만들지 않는다.

---

### Task 1: 거래 정지 데이터 모델과 공용 계약

**Files:**
- Modify: `src/db/schema.ts`
- Create: `drizzle/0169_trade_suspension.sql`
- Create: `drizzle/meta/0169_snapshot.json`
- Modify: `drizzle/meta/_journal.json`
- Create: `src/lib/tradeSuspension.ts`
- Create: `src/lib/tradeSuspension.test.ts`

**Interfaces:**
- Produces: `users.tradeSuspendedUntil`, `users.tradeSuspensionReason`
- Produces: `ActiveTradeRestriction`, `TradeSuspendedPayload`, `resolveTradeRestriction`, `tradeSuspendedPayload`, `tradeSuspensionMessage`
- Consumes: existing account fields `bannedUntil`, `banReason`

- [ ] **Step 1: Write failing pure policy tests**

Cover normal, expired, period, permanent, overlapping account/trade restriction, and Korean message output:

```ts
expect(resolveTradeRestriction({
  bannedUntil: null,
  banReason: null,
  tradeSuspendedUntil: new Date("2026-08-21T00:00:00.000Z"),
  tradeSuspensionReason: "비정상 거래 조사",
}, new Date("2026-08-20T00:00:00.000Z"))).toMatchObject({
  source: "trade",
  reason: "비정상 거래 조사",
  permanent: false,
});
expect(resolveTradeRestriction({
  bannedUntil: null,
  banReason: null,
  tradeSuspendedUntil: new Date("2026-08-20T00:00:00.000Z"),
  tradeSuspensionReason: "만료된 제한",
}, new Date("2026-08-20T00:00:00.000Z"))).toBeNull();
expect(tradeSuspendedPayload(active)).toEqual({
  ok: false,
  error: "trade_suspended",
  reason: "비정상 거래 조사",
  expiresAt: "2026-08-21T00:00:00.000Z",
  permanent: false,
});
```

- [ ] **Step 2: Run the policy test and verify RED**

Run: `npm test -- src/lib/tradeSuspension.test.ts`

Expected: FAIL because `src/lib/tradeSuspension.ts` does not exist.

- [ ] **Step 3: Implement the pure contract**

Use Date values internally and serialize only at the response boundary:

```ts
export type ActiveTradeRestriction = {
  source: "account" | "trade";
  reason: string;
  expiresAt: Date;
  permanent: boolean;
};

export type TradeSuspendedPayload = {
  ok: false;
  error: "trade_suspended";
  reason: string;
  expiresAt: string;
  permanent: boolean;
};

export function resolveTradeRestriction(
  fields: TradeRestrictionFields,
  now = new Date(),
): ActiveTradeRestriction | null;
```

Treat a timestamp equal to `now` as expired. Account restriction takes response precedence while active; after it expires, an active independent trade restriction remains visible.

- [ ] **Step 4: Add schema fields and active-highest-bidder index**

Add the two user columns and this partial index to `marketplaceListingsV2`:

```ts
index("listings_v2_active_highest_bidder_idx")
  .on(t.highestBidderId, t.id)
  .where(sql`${t.status} = 'active' AND ${t.highestBidderId} IS NOT NULL`),
```

Run: `npm run db:generate -- --name trade_suspension`

Expected: creates `0169_trade_suspension.sql`, snapshot, and journal entry containing only the two user columns and one partial index.

- [ ] **Step 5: Verify model and migration**

Run:

```bash
npm test -- src/lib/tradeSuspension.test.ts
npm run check-migrations
```

Expected: both PASS.

- [ ] **Step 6: Commit Task 1**

```bash
git add src/db/schema.ts src/lib/tradeSuspension.ts src/lib/tradeSuspension.test.ts drizzle/0169_trade_suspension.sql drizzle/meta/0169_snapshot.json drizzle/meta/_journal.json
git commit -m "feat: add trade suspension state"
```

### Task 2: 서버 거래 참여자 잠금과 유저 상태 API

**Files:**
- Create: `src/lib/server/tradeSuspension.ts`
- Create: `src/lib/server/tradeSuspension.test.ts`
- Modify: `src/lib/playerSanctions.ts`
- Modify: `src/lib/server/playerSanctions.ts`
- Modify: `src/app/api/v2/me/sanctions/route.ts`
- Modify: `src/lib/server/playerSanctionsRoute.test.ts`

**Interfaces:**
- Produces: `TradeSuspendedError`, `readTradeRestriction`, `lockTradeParticipantStatuses`, `requireTradeParticipants`, `tradeSuspendedResponse`
- Extends: `PlayerSanctionStatus.tradeSuspension`
- Consumes: Task 1 `resolveTradeRestriction`, `tradeSuspendedPayload`

- [ ] **Step 1: Write failing lock-order and response tests**

Use a fake executor that records the ordered user IDs. Prove deduplication, account/trade union, missing unrestricted users, and the exact 403 body:

```ts
await expect(requireTradeParticipants(tx, ["u-z", "u-a", "u-z"], now))
  .rejects.toMatchObject({ name: "TradeSuspendedError" });
expect(lockedIds).toEqual(["u-a", "u-z"]);
expect(await tradeSuspendedResponse(error).json()).toMatchObject({
  error: "trade_suspended",
  permanent: false,
});
```

- [ ] **Step 2: Run server policy tests and verify RED**

Run: `npm test -- src/lib/server/tradeSuspension.test.ts`

Expected: FAIL because the server module does not exist.

- [ ] **Step 3: Implement read, lock, and throw helpers**

Expose the flexible status map for group grants and the strict wrapper for normal transfers:

```ts
export async function lockTradeParticipantStatuses(
  tx: DbExecutor,
  userIds: readonly string[],
  now = new Date(),
): Promise<Map<string, ActiveTradeRestriction | null>>;

export async function requireTradeParticipants(
  tx: DbExecutor,
  userIds: readonly string[],
  now = new Date(),
): Promise<void>;

export function tradeSuspendedResponse(error: TradeSuspendedError): Response {
  return Response.json(tradeSuspendedPayload(error.restriction), { status: 403 });
}
```

Select user rows in ID order with `FOR UPDATE`. `requireTradeParticipants` throws on the first restricted ID in the caller's stable participant order so the transaction rolls back.

- [ ] **Step 4: Write failing player-status and acknowledgement tests**

Extend the existing route tests with an active unacknowledged trade sanction and an acknowledgement request:

```ts
expect(await GET().then((r) => r.json())).toMatchObject({
  tradeSuspension: {
    id: 11,
    reason: "비정상 거래 조사",
    permanent: false,
    acknowledged: false,
  },
});
expect(mocks.set).toHaveBeenCalledWith({ acknowledgedAt: expect.any(Date) });
```

The POST body becomes `{ sanctionId: 11, kind: "trade" }`; the old `{ warningId }` form remains valid.

- [ ] **Step 5: Run player-status tests and verify RED**

Run: `npm test -- src/lib/server/playerSanctionsRoute.test.ts`

Expected: FAIL because `tradeSuspension` and trade acknowledgement do not exist.

- [ ] **Step 6: Extend player sanction status**

Query the latest active, unlifted `trade_suspend` or `trade_ban` row and return:

```ts
export type PlayerTradeSuspension = PlayerSuspension & {
  id: number;
  acknowledged: boolean;
};

export type PlayerSanctionStatus = {
  suspension: PlayerSuspension | null;
  tradeSuspension: PlayerTradeSuspension | null;
  warning: PlayerSanctionWarning | null;
};
```

POST acknowledgement must filter by row ID, current user, allowed trade types, `liftedAt IS NULL`, and `acknowledgedAt IS NULL`. It never changes either suspension column.

- [ ] **Step 7: Verify Task 2**

Run: `npm test -- src/lib/server/tradeSuspension.test.ts src/lib/server/playerSanctionsRoute.test.ts`

Expected: PASS.

- [ ] **Step 8: Commit Task 2**

```bash
git add src/lib/server/tradeSuspension.ts src/lib/server/tradeSuspension.test.ts src/lib/playerSanctions.ts src/lib/server/playerSanctions.ts src/app/api/v2/me/sanctions/route.ts src/lib/server/playerSanctionsRoute.test.ts
git commit -m "feat: enforce trade participant locks"
```

### Task 3: 재사용 가능한 거래소 에스크로 반환

**Files:**
- Create: `src/lib/server/marketplaceEscrow.ts`
- Create: `src/lib/server/marketplaceEscrow.test.ts`
- Modify: `src/app/api/v2/marketplace/cancel/route.ts`
- Create: `src/app/api/v2/marketplace/cancel/route.test.ts`
- Modify: `src/app/api/v2/marketplace/buy-orders/cancel/route.ts`
- Create: `src/app/api/v2/marketplace/buy-orders/cancel/route.test.ts`

**Interfaces:**
- Produces: `cancelMarketplaceListingEscrow`, `cancelMarketplaceBuyOrderEscrow`, `clearMarketplaceHighestBid`
- Consumes: listing/buy-order rows, `DbExecutor`, existing equipment/material/consumable restoration helpers

- [ ] **Step 1: Write failing escrow tests**

Cover equipment, material, cash item, food, fish specimen, rare map, buy-order gold, and highest-bid refund. Assert a second call against non-active rows performs no return:

```ts
expect(await cancelMarketplaceBuyOrderEscrow(tx, activeOrder, now, "trade_suspension"))
  .toMatchObject({ cancelled: true, refundedGold: 4500 });
expect(insertedInbox).toContainEqual(expect.objectContaining({
  userId: activeOrder.buyerId,
  kind: "buy_order_refund",
}));
expect(await clearMarketplaceHighestBid(tx, listing, now, "trade_suspension"))
  .toMatchObject({ cleared: true, refundedGold: listing.highestBid });
```

- [ ] **Step 2: Run escrow tests and verify RED**

Run: `npm test -- src/lib/server/marketplaceEscrow.test.ts`

Expected: FAIL because the module does not exist.

- [ ] **Step 3: Extract transaction-aware escrow helpers**

Use explicit result types and require callers to pass already locked rows:

```ts
export async function cancelMarketplaceListingEscrow(
  tx: DbExecutor,
  listing: MarketplaceListingRow,
  options: { now: Date; refundHighestBid: boolean; reason: "user_cancel" | "trade_suspension" | "expired" },
): Promise<{ cancelled: boolean; refundedBidGold: number }>;

export async function cancelMarketplaceBuyOrderEscrow(
  tx: DbExecutor,
  order: MarketplaceBuyOrderRow,
  now: Date,
  reason: "user_cancel" | "trade_suspension" | "expired",
): Promise<{ cancelled: boolean; refundedGold: number }>;

export async function clearMarketplaceHighestBid(
  tx: DbExecutor,
  listing: MarketplaceListingRow,
  now: Date,
  reason: "trade_suspension" | "expired",
): Promise<{ cleared: boolean; refundedGold: number }>;
```

Keep the manual listing rule that a seller cannot cancel an auction with bids by checking `bidCount` before calling the helper. Do not duplicate restoration branches in routes.

- [ ] **Step 4: Refactor both cancellation routes without behavior changes**

Replace inline restoration/refund writes with the new helpers and keep existing HTTP errors and economy event payloads. Add assertions to the helper tests that `reason: "user_cancel"` preserves current inbox text and status transitions.

- [ ] **Step 5: Add route regression tests for both allowed cancellations**

For listing cancellation, assert the owner can cancel a no-bid listing and still receives `has_bids` for an active auction. For buy-order cancellation, assert a restricted user can cancel and receives one refund inbox row. Mock the strict trade guard and prove neither route calls it.

- [ ] **Step 6: Verify escrow and existing cancellation behavior**

Run:

```bash
npm test -- src/lib/server/marketplaceEscrow.test.ts
npm test -- src/app/api/v2/marketplace/cancel/route.test.ts src/app/api/v2/marketplace/buy-orders/cancel/route.test.ts
```

Expected: both commands PASS.

- [ ] **Step 7: Commit Task 3**

```bash
git add src/lib/server/marketplaceEscrow.ts src/lib/server/marketplaceEscrow.test.ts src/app/api/v2/marketplace/cancel/route.ts src/app/api/v2/marketplace/cancel/route.test.ts src/app/api/v2/marketplace/buy-orders/cancel/route.ts src/app/api/v2/marketplace/buy-orders/cancel/route.test.ts
git commit -m "refactor: centralize marketplace escrow returns"
```

### Task 4: 제재 부과 시 활성 거래 정리와 관리자 API

**Files:**
- Create: `src/lib/server/tradeSuspensionCleanup.ts`
- Create: `src/lib/server/tradeSuspensionCleanup.test.ts`
- Modify: `src/app/api/admin/sanctions/route.ts`
- Create: `src/app/api/admin/sanctions/route.test.ts`
- Modify: `src/admin/displayLabels.ts`

**Interfaces:**
- Produces: `clearActiveTradeExposure(tx, userId, now): Promise<TradeExposureCleanupResult>`
- Produces: admin POST `scope: "account" | "trade"`
- Consumes: Task 2 locking, Task 3 escrow helpers

- [ ] **Step 1: Write failing cleanup service tests**

Seed fake locked rows for two owned listings, one buy order, and one foreign listing where the target is highest bidder:

```ts
expect(await clearActiveTradeExposure(tx, "u-target", now)).toEqual({
  listingsCancelled: 2,
  buyOrdersCancelled: 1,
  highestBidsCleared: 1,
  refundedGold: 12_000,
});
expect(operationOrder).toEqual([
  "lock:user:u-target",
  "listing:10",
  "listing:11",
  "buy-order:20",
  "highest-bid:30",
]);
```

Repeat the service and assert all counters are zero and no extra inbox rows appear.

- [ ] **Step 2: Run cleanup tests and verify RED**

Run: `npm test -- src/lib/server/tradeSuspensionCleanup.test.ts`

Expected: FAIL because the cleanup service does not exist.

- [ ] **Step 3: Implement deterministic cleanup**

Lock the target user first, then active rows by ascending ID. Cancel owned listings with bid refund enabled, cancel orders, and clear only current highest bids on foreign listings. Return counters and total refunded gold; leave `marketplace_bids_v2` history and `bidCount` unchanged.

- [ ] **Step 4: Write failing admin route tests**

Cover legacy scope default, trade suspend/ban/extend/lift, required reason, independent lift filters, account-ban cleanup, rollback on cleanup failure, and audit details:

```ts
expect(await post({ userId: "u", scope: "trade", action: "suspend", days: 3, reason: "조사" }))
  .toMatchObject({ status: 200, body: { tradeSuspended: true } });
expect(clearActiveTradeExposure).toHaveBeenCalledWith(expect.anything(), "u", expect.any(Date));
expect(logAdminAction).toHaveBeenCalledWith(expect.objectContaining({
  action: "sanction.trade_suspend",
  detail: expect.objectContaining({ listingsCancelled: 2 }),
}));
```

- [ ] **Step 5: Run admin route tests and verify RED**

Run: `npm test -- src/app/api/admin/sanctions/route.test.ts`

Expected: FAIL because scope-aware trade actions do not exist.

- [ ] **Step 6: Implement scope-aware admin transactions**

Keep `scope ?? "account"`. For `trade`, update only trade columns and trade sanction rows. For account suspend/ban/extend, update account fields and call cleanup in the same transaction. For account lift, leave trade fields and rows unchanged. For trade lift, clear only trade fields and lift only `trade_suspend`/`trade_ban` rows.

Return the cleanup result from the transaction and pass it into the existing best-effort audit logger after commit.

- [ ] **Step 7: Verify Task 4**

Run: `npm test -- src/lib/server/tradeSuspensionCleanup.test.ts src/app/api/admin/sanctions/route.test.ts`

Expected: PASS.

- [ ] **Step 8: Commit Task 4**

```bash
git add src/lib/server/tradeSuspensionCleanup.ts src/lib/server/tradeSuspensionCleanup.test.ts src/app/api/admin/sanctions/route.ts src/app/api/admin/sanctions/route.test.ts src/admin/displayLabels.ts
git commit -m "feat: manage trade suspensions"
```

### Task 5: 단일 행위자 거래소 변경 경로 차단

**Files:**
- Modify: `src/app/api/v2/marketplace/list/route.ts`
- Modify: `src/lib/server/marketplaceListRoute.test.ts`
- Modify: `src/app/api/v2/marketplace/reprice/route.ts`
- Create: `src/app/api/v2/marketplace/reprice/route.test.ts`
- Modify: `src/app/api/v2/marketplace/buy-orders/route.ts`
- Create: `src/app/api/v2/marketplace/buy-orders/route.test.ts`
- Create: `src/app/api/v2/marketplace/price-alerts/route.test.ts`

**Interfaces:**
- Consumes: `requireTradeParticipants`, `tradeSuspendedResponse`
- Preserves: cancel routes and price-alert POST availability

- [ ] **Step 1: Write failing route-level guard tests**

Mock `requireTradeParticipants` to throw `TradeSuspendedError`. For list, reprice, buy-order POST, and buy-order PATCH assert 403 and no save/listing/order mutation:

```ts
expect(response.status).toBe(403);
expect(await response.json()).toMatchObject({ error: "trade_suspended" });
expect(upsertSave).not.toHaveBeenCalled();
expect(insertValues).toHaveLength(0);
```

- [ ] **Step 2: Run focused route tests and verify RED**

Run: `npm test -- src/lib/server/marketplaceListRoute.test.ts src/app/api/v2/marketplace/reprice/route.test.ts src/app/api/v2/marketplace/buy-orders/route.test.ts`

Expected: FAIL because the routes do not call the trade guard.

- [ ] **Step 3: Add actor locks before asset locks**

Inside each existing transaction, make the first authoritative write-side operation:

```ts
await requireTradeParticipants(tx, [userId], now);
```

Catch `TradeSuspendedError` outside the transaction and return `tradeSuspendedResponse`. Validation and rate limiting may remain before the transaction, but no inventory, escrow, listing, or order change may precede the user lock.

- [ ] **Step 4: Add allowed-route regression assertions**

Run `src/app/api/v2/marketplace/cancel/route.test.ts` and `src/app/api/v2/marketplace/buy-orders/cancel/route.test.ts` to prove both cancellation endpoints still succeed for a restricted user fixture. Add a price-alert POST test with the same fixture and assert the personal alert is created because no asset moves. Mock the strict trade guard in all three tests and prove none of these allowed routes calls it.

- [ ] **Step 5: Verify Task 5**

Run: `npm test -- src/lib/server/marketplaceListRoute.test.ts src/app/api/v2/marketplace/reprice/route.test.ts src/app/api/v2/marketplace/buy-orders/route.test.ts src/app/api/v2/marketplace/cancel/route.test.ts src/app/api/v2/marketplace/buy-orders/cancel/route.test.ts src/app/api/v2/marketplace/price-alerts/route.test.ts src/lib/server/marketplaceBuyOrderEdit.test.ts`

Expected: PASS.

- [ ] **Step 6: Commit Task 5**

```bash
git add src/app/api/v2/marketplace/list/route.ts src/lib/server/marketplaceListRoute.test.ts src/app/api/v2/marketplace/reprice/route.ts src/app/api/v2/marketplace/reprice/route.test.ts src/app/api/v2/marketplace/buy-orders/route.ts src/app/api/v2/marketplace/buy-orders/route.test.ts src/app/api/v2/marketplace/price-alerts/route.test.ts
git commit -m "feat: block suspended marketplace mutations"
```

### Task 6: 양자 거래와 자동 정산 차단

**Files:**
- Modify: `src/app/api/v2/marketplace/buy/route.ts`
- Modify: `src/app/api/v2/marketplace/buy-stack/route.ts`
- Modify: `src/app/api/v2/marketplace/bid/route.ts`
- Create: `src/app/api/v2/marketplace/tradeSuspensionSettlementRoutes.test.ts`
- Modify: `src/lib/server/marketplaceBuyOrdersV2.ts`
- Modify: `src/lib/server/marketplaceBuyOrdersV2.test.ts`
- Modify: `src/lib/server/equipmentBuyOrderSale.ts`
- Create: `src/lib/server/equipmentBuyOrderSale.test.ts`
- Modify: `src/app/api/v2/marketplace/buy-orders/sell-equipment/route.ts`
- Modify: `src/app/api/v2/marketplace/buy-orders/sell-equipment-batch/route.ts`
- Modify: `src/app/api/v2/cron/marketplace-expire/route.ts`
- Create: `src/app/api/v2/cron/marketplace-expire/tradeSuspension.test.ts`

**Interfaces:**
- Consumes: Task 2 participant status locks, Task 3 escrow helpers
- Produces: no settlement where buyer, seller, or current highest bidder is restricted

- [ ] **Step 1: Write failing direct-settlement tests**

For buy, stack buy, and bid, test restricted actor and restricted seller. Assert the listing and both wallets remain unchanged. Also record lock order for reversed IDs:

```ts
expect(lockedParticipants).toEqual(["buyer-a", "seller-z"]);
expect(response.status).toBe(403);
expect(deliverMarketplaceListing).not.toHaveBeenCalled();
```

- [ ] **Step 2: Run direct-settlement tests and verify RED**

Run: `npm test -- src/app/api/v2/marketplace/tradeSuspensionSettlementRoutes.test.ts`

Expected: FAIL because counterpart status is not checked.

- [ ] **Step 3: Reorder direct settlement locks**

Read listing participant IDs without a row lock, lock buyer/bidder and seller IDs in sorted order, then re-read the listing `FOR UPDATE` and repeat ownership/status/price checks before moving assets. Catch the common suspension error at the route boundary.

- [ ] **Step 4: Write failing auto-match and equipment-order tests**

Add fixtures where the order buyer or candidate seller is suspended. The matcher must skip restricted candidates and must not create item/proceeds inbox rows:

```ts
expect(await matchMarketplaceBuyOrder(tx, 12, now)).toEqual([]);
expect(activeOrder.goldEscrow).toBe(10_000);
expect(await fillBestEquipmentBuyOrder(tx, args)).toBeNull();
expect(inboxWrites).toHaveLength(0);
```

- [ ] **Step 5: Run auto-match tests and verify RED**

Run: `npm test -- src/lib/server/marketplaceBuyOrdersV2.test.ts src/lib/server/equipmentBuyOrderSale.test.ts`

Expected: FAIL because matching does not inspect user restrictions.

- [ ] **Step 6: Enforce participant locks in matching services**

For every candidate pair, identify IDs, lock users first, then lock/re-read the order and listing in stable row-ID order. A restricted buyer leaves its order active for administrator cleanup; a restricted seller candidate is skipped. The equipment batch route checks the seller once and `fillBestEquipmentBuyOrder` checks each selected buyer.

- [ ] **Step 7: Write and implement cron defensive settlement tests**

Test auction resolution with a restricted seller and with a restricted highest bidder. In both cases cancel/refund through Task 3 helpers rather than completing a sale:

```ts
expect(listing.status).toBe("cancelled");
expect(refunds).toContainEqual(expect.objectContaining({ kind: "bid_refund" }));
expect(deliverMarketplaceListing).not.toHaveBeenCalled();
```

Use a nonlocking participant probe, sorted user locks, and listing re-lock before resolution. Normal expiration and unrestricted auction settlement remain unchanged.

- [ ] **Step 8: Verify Task 6**

Run:

```bash
npm test -- src/app/api/v2/marketplace/tradeSuspensionSettlementRoutes.test.ts src/lib/server/marketplaceBuyOrdersV2.test.ts src/lib/server/equipmentBuyOrderSale.test.ts src/app/api/v2/cron/marketplace-expire/tradeSuspension.test.ts
npm test -- src/lib/server/marketplaceV2Fulfillment.test.ts src/lib/server/marketplaceV2.test.ts
```

Expected: all PASS.

- [ ] **Step 9: Commit Task 6**

```bash
git add src/app/api/v2/marketplace/buy/route.ts src/app/api/v2/marketplace/buy-stack/route.ts src/app/api/v2/marketplace/bid/route.ts src/app/api/v2/marketplace/tradeSuspensionSettlementRoutes.test.ts src/lib/server/marketplaceBuyOrdersV2.ts src/lib/server/marketplaceBuyOrdersV2.test.ts src/lib/server/equipmentBuyOrderSale.ts src/lib/server/equipmentBuyOrderSale.test.ts src/app/api/v2/marketplace/buy-orders/sell-equipment/route.ts src/app/api/v2/marketplace/buy-orders/sell-equipment-batch/route.ts src/app/api/v2/cron/marketplace-expire/route.ts src/app/api/v2/cron/marketplace-expire/tradeSuspension.test.ts
git commit -m "feat: stop suspended marketplace settlements"
```

### Task 7: 유저 우편과 길드 경제 경계

**Files:**
- Modify: `src/app/api/inbox/send/route.ts`
- Create: `src/app/api/inbox/send/route.test.ts`
- Modify: `src/app/api/marketplace/inbox/claim/route.ts`
- Modify: `src/lib/server/inboxClaimSeasonReward.test.ts`
- Modify: `src/app/api/v2/guild/warehouse/route.ts`
- Modify: `src/app/api/v2/guild/warehouse/route.test.ts`
- Modify: `src/app/api/v2/guild/trade-post/route.ts`
- Modify: `src/app/api/v2/guild/trade-post/route.test.ts`

**Interfaces:**
- Consumes: `requireTradeParticipants`, `lockTradeParticipantStatuses`, `TradeSuspendedError`
- Produces: restricted inbox claim allowlist and suspended guild-recipient filtering

- [ ] **Step 1: Write failing user-mail tests**

Test restricted sender, restricted recipient, unrestricted text message, and unrestricted recipe gift. Both parties must be locked before insert/token consumption:

```ts
expect(restrictedResponse.status).toBe(403);
expect(await restrictedResponse.json()).toMatchObject({ error: "trade_suspended" });
expect(upsertSave).not.toHaveBeenCalled();
expect(inboxInsert).not.toHaveBeenCalled();
```

- [ ] **Step 2: Run mail tests and verify RED**

Run: `npm test -- src/app/api/inbox/send/route.test.ts`

Expected: FAIL because user mail has no trade guard.

- [ ] **Step 3: Wrap message and gift creation in participant locks**

After resolving the recipient, start one transaction, call:

```ts
await requireTradeParticipants(tx, [senderId, recipient.id], now);
```

Then re-run the rate-limit count needed for authority and perform either plain insert or recipe token consumption in that transaction.

- [ ] **Step 4: Write failing inbox-claim classification tests**

With an active trade suspension, assert `recipe_gift` from a user is rejected while `sale_proceeds`, `bid_refund`, `buy_order_refund`, `season_reward`, `admin_gift`, and a no-asset `user_message` can complete. A mixed batch containing a player gift must reject the entire transaction.

- [ ] **Step 5: Implement restricted claim allowlist**

Lock the claimant user before inbox rows. If restricted, reject when any parsed row transfers a player-originated asset:

```ts
const blockedPlayerGift = rows.some((row) =>
  row.fromUserId !== null && parseInboxPayload(row.kind, row.payload)?.kind === "recipe_gift"
);
if (restriction && blockedPlayerGift) throw new TradeSuspendedError(restriction);
```

Keep parsing failures unclaimed and keep all existing reward routing unchanged.

- [ ] **Step 6: Write failing guild tests**

Add a restricted actor case to warehouse deposit/withdraw and trade-post deliver/buy. For a guild-wide shop purchase, include one suspended member and assert the grant recipient list excludes that member without blocking eligible members.

- [ ] **Step 7: Implement guild locks and recipient filtering**

The warehouse transaction and trade-post POST lock the actor before guild/save rows. For group grants, load recipient IDs, call `lockTradeParticipantStatuses`, and pass only unrestricted IDs into `lockGuildShopGrant`; return the actual eligible `recipientCount`.

- [ ] **Step 8: Verify Task 7**

Run:

```bash
npm test -- src/app/api/inbox/send/route.test.ts src/lib/server/inboxClaimSeasonReward.test.ts
npm test -- src/app/api/v2/guild/warehouse/route.test.ts src/app/api/v2/guild/trade-post/route.test.ts
```

Expected: all PASS.

- [ ] **Step 9: Commit Task 7**

```bash
git add src/app/api/inbox/send/route.ts src/app/api/inbox/send/route.test.ts src/app/api/marketplace/inbox/claim/route.ts src/lib/server/inboxClaimSeasonReward.test.ts src/app/api/v2/guild/warehouse/route.ts src/app/api/v2/guild/warehouse/route.test.ts src/app/api/v2/guild/trade-post/route.ts src/app/api/v2/guild/trade-post/route.test.ts
git commit -m "feat: enforce trade suspension across mail and guilds"
```

### Task 8: 관리자 거래 제재 UI

**Files:**
- Modify: `src/admin/tabs/users/SanctionsSection.tsx`
- Create: `src/admin/tabs/users/SanctionsSection.test.tsx`

**Interfaces:**
- Consumes: admin sanctions GET `trade` object and POST `scope: "trade"`
- Produces: independent trade suspend/ban/extend/lift controls

- [ ] **Step 1: Write failing admin component tests**

Mock `adminGet`/`adminPost` and render active account and trade states together. Assert separate labels, 1·3·7-day presets, permanent action, independent lift body, permission disablement, and opaque surfaces:

```ts
expect(screen.getByText("거래 제재")).toBeDefined();
fireEvent.click(screen.getByRole("button", { name: "거래 제재 해제" }));
expect(adminPost).toHaveBeenCalledWith("/api/admin/sanctions", expect.objectContaining({
  scope: "trade",
  action: "lift",
}));
expect(container.innerHTML).toContain(SURFACE_CARD.split(" ")[0]);
```

- [ ] **Step 2: Run admin UI tests and verify RED**

Run: `npm test -- src/admin/tabs/users/SanctionsSection.test.tsx`

Expected: FAIL because the trade card does not exist.

- [ ] **Step 3: Implement independent trade controls**

Extend `StatusResponse` with `trade`; keep account controls and state unchanged. Add a separate reason/day state or explicitly reset shared fields when changing scope so account and trade actions cannot submit the wrong reason. Use distinct confirmation text `TRADE SUSPEND` and `TRADE BAN`.

Compose class names from surface tokens:

```tsx
<section className={`${SURFACE_CARD} p-3`}>
  <div className={`${SURFACE_INSET} mt-3 space-y-2 p-3`}>
    <p>{trade.reason}</p>
  </div>
</section>
```

- [ ] **Step 4: Verify Task 8**

Run: `npm test -- src/admin/tabs/users/SanctionsSection.test.tsx`

Expected: PASS.

- [ ] **Step 5: Commit Task 8**

```bash
git add src/admin/tabs/users/SanctionsSection.tsx src/admin/tabs/users/SanctionsSection.test.tsx
git commit -m "feat: add admin trade suspension controls"
```

### Task 9: 유저 안내, 공통 오류 문구와 전체 회귀 검증

**Files:**
- Modify: `src/adventure/v2/PlayerSanctionGate.tsx`
- Create: `src/adventure/v2/PlayerSanctionGate.test.tsx`
- Modify: `src/adventure/v2/V2MarketplaceView.tsx`
- Modify: `src/adventure/v2/V2MarketplaceView.layout.test.tsx`
- Modify: `src/adventure/marketplace/api.ts`
- Modify: `src/adventure/v2/V2InboxView.tsx`
- Modify: `src/adventure/v2/V2InboxView.test.tsx`
- Modify: `src/adventure/v2/guild/GuildWarehousePanel.tsx`
- Modify: `src/adventure/v2/guild/GuildWarehousePanel.test.ts`
- Modify: `src/adventure/v2/guild/GuildTradePostPanel.tsx`
- Modify: `src/adventure/v2/guild/GuildTradePostPanel.test.tsx`
- Modify: `src/admin/tabs/OpsManualTab.tsx`
- Modify: `docs/superpowers/specs/2026-08-20-trade-suspension-design.md`

**Interfaces:**
- Consumes: `PlayerSanctionStatus.tradeSuspension`, `TradeSuspendedPayload`, `tradeSuspensionMessage`
- Produces: one-time trade notice and consistent Korean 403 messages

- [ ] **Step 1: Write failing player gate tests**

Mock status polling with an unacknowledged trade restriction. Assert children remain present, the modal shows reason/expiry, acknowledgement posts the sanction ID, and account suspension still replaces the whole game:

```ts
expect(screen.getByText("게임 본문")).toBeDefined();
expect(screen.getByRole("dialog", { name: "거래 이용 제한" })).toBeDefined();
expect(fetch).toHaveBeenCalledWith("/api/v2/me/sanctions", expect.objectContaining({
  method: "POST",
  body: JSON.stringify({ sanctionId: 11, kind: "trade" }),
}));
```

- [ ] **Step 2: Run player gate tests and verify RED**

Run: `npm test -- src/adventure/v2/PlayerSanctionGate.test.tsx`

Expected: FAIL because trade suspension is ignored.

- [ ] **Step 3: Implement the nonblocking trade notice**

Preserve account suspension precedence. Render children plus `TradeSuspensionAcknowledgementModal` only when `tradeSuspension && !tradeSuspension.acknowledged`. Use `SURFACE_CARD` and `SURFACE_INSET`; acknowledgement refreshes status and never signs the user out.

- [ ] **Step 4: Write failing client message tests**

Add pure assertions to `src/lib/tradeSuspension.test.ts` and explicit error-mapping assertions to `V2MarketplaceView.layout.test.tsx`, `V2InboxView.test.tsx`, `GuildWarehousePanel.test.ts`, and `GuildTradePostPanel.test.tsx`:

```ts
expect(tradeSuspensionMessage({
  reason: "비정상 거래 조사",
  expiresAt: "2026-08-23T00:00:00.000Z",
  permanent: false,
})).toContain("비정상 거래 조사");
expect(actionErrorLabel({
  error: "trade_suspended",
  reason: "비정상 거래 조사",
  expiresAt: "2026-08-23T00:00:00.000Z",
  permanent: false,
}, 403)).toContain("거래 이용 제한");
```

- [ ] **Step 5: Connect all affected clients to the shared message**

Export `actionErrorLabel(payload, status)` from `V2MarketplaceView.tsx`, replacing its positional error arguments with one parsed payload object. Parse JSON before fallback text in marketplace actions, inbox send/claim, warehouse, and trade post clients. When `error === "trade_suspended"`, display `tradeSuspensionMessage(payload)`; keep existing error mappings for every other code. Do not disable browse, cancel, price-alert, inbox read, or allowed claim controls.

- [ ] **Step 6: Update operator documentation and clarify group grants**

Add the trade sanction workflow, independent lift behavior, automatic escrow cleanup, and “suspended guild members are omitted from group trade-post grants” to `OpsManualTab`. Add the same group-recipient clarification to the approved design document so plan and spec remain identical.

- [ ] **Step 7: Run focused suites**

Run:

```bash
npm test -- src/lib/tradeSuspension.test.ts src/lib/server/tradeSuspension.test.ts src/lib/server/tradeSuspensionCleanup.test.ts src/app/api/admin/sanctions/route.test.ts src/lib/server/playerSanctionsRoute.test.ts
npm test -- src/lib/server/marketplaceEscrow.test.ts src/lib/server/marketplaceBuyOrdersV2.test.ts src/lib/server/equipmentBuyOrderSale.test.ts src/app/api/v2/marketplace/tradeSuspensionSettlementRoutes.test.ts
npm test -- src/app/api/inbox/send/route.test.ts src/lib/server/inboxClaimSeasonReward.test.ts src/app/api/v2/guild/warehouse/route.test.ts src/app/api/v2/guild/trade-post/route.test.ts
npm test -- src/admin/tabs/users/SanctionsSection.test.tsx src/adventure/v2/PlayerSanctionGate.test.tsx src/adventure/v2/V2MarketplaceView.layout.test.tsx src/adventure/v2/V2InboxView.test.tsx src/adventure/v2/guild/GuildWarehousePanel.test.ts src/adventure/v2/guild/GuildTradePostPanel.test.tsx
```

Expected: all suites PASS with zero failed tests.

- [ ] **Step 8: Run repository verification**

Run:

```bash
npm run check-migrations
npx tsc --noEmit
npm run lint
npm test
npm run build
git diff --check
```

Expected: every command exits 0. `prebuild` must also report image optimization/check success. Do not deploy after build.

- [ ] **Step 9: Audit enforcement coverage**

Run:

```bash
rg -n "requireTradeParticipants|lockTradeParticipantStatuses" src/app/api/v2/marketplace src/app/api/v2/guild/warehouse src/app/api/v2/guild/trade-post src/app/api/inbox/send src/app/api/marketplace/inbox/claim src/lib/server/marketplaceBuyOrdersV2.ts src/lib/server/equipmentBuyOrderSale.ts src/app/api/v2/cron/marketplace-expire
rg -n "export async function (POST|PATCH)" src/app/api/v2/marketplace src/app/api/v2/guild/warehouse src/app/api/v2/guild/trade-post src/app/api/inbox/send src/app/api/marketplace/inbox/claim
```

Expected: every asset-moving POST/PATCH is represented by a guard call or an explicitly allowed cancellation/price-alert/read path documented in its test.

- [ ] **Step 10: Commit Task 9**

```bash
git add src/adventure/v2/PlayerSanctionGate.tsx src/adventure/v2/PlayerSanctionGate.test.tsx src/adventure/v2/V2MarketplaceView.tsx src/adventure/v2/V2MarketplaceView.layout.test.tsx src/adventure/marketplace/api.ts src/adventure/v2/V2InboxView.tsx src/adventure/v2/V2InboxView.test.tsx src/adventure/v2/guild/GuildWarehousePanel.tsx src/adventure/v2/guild/GuildWarehousePanel.test.ts src/adventure/v2/guild/GuildTradePostPanel.tsx src/adventure/v2/guild/GuildTradePostPanel.test.tsx src/admin/tabs/OpsManualTab.tsx docs/superpowers/specs/2026-08-20-trade-suspension-design.md
git commit -m "feat: show trade suspension status"
```

## Completion Criteria

- 관리자는 계정 제재와 독립된 기간·영구 거래 정지, 연장과 해제를 수행할 수 있다.
- 계정 제재도 활성 거래를 정리하고, 독립 거래 정지는 계정 제재 해제로 사라지지 않는다.
- 제재 응답 완료 뒤 대상의 활성 매물·구매주문·최고 입찰이 남지 않고 에스크로가 한 번만 반환된다.
- 거래소·유저 우편·길드 창고·길드 교역소의 모든 자산 이전이 서버 공통 경계를 통과한다.
- 조회·취소·반환·정산·시스템 보상 수령과 일반 게임은 거래 정지 중에도 동작한다.
- 관리자·유저 UI가 사유, 기간과 영구 여부를 불투명 표면으로 표시한다.
- 마이그레이션 검사, 타입 검사, 린트, 전체 테스트와 프로덕션 빌드가 모두 통과한다.
- 배포와 점검 모드는 변경되지 않는다.
