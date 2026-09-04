# Web Card Payment Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Integrate Toss Payments V2 web card checkout with the existing Museun Coin shop, including idempotent coin grants, paid/free balances, refunds, recovery, and operational tooling without enabling or deploying live payments.

**Architecture:** Add dedicated PostgreSQL payment, coin-account, immutable-ledger, paid-lot, allocation, and refund tables. Route all Museun Coin mutations through one transaction-aware service, isolate Toss HTTP calls behind a server-only adapter, and expose authenticated Next.js Route Handlers plus existing-shop UI and a standalone admin payment page. Keep the current shop gate closed and default payment mode to `disabled`.

**Tech Stack:** Next.js 16.2.11 App Router, React 19, TypeScript, Drizzle ORM/PostgreSQL, Vitest, Playwright, `@tosspayments/tosspayments-sdk` 2.8.1, Toss Payments Core API v1.

## Global Constraints

- Do not deploy or enable any environment.
- Keep `NEXT_PUBLIC_MUSEUN_COIN_SHOP_OPEN=false` in tracked production configuration.
- Default `MUSEUN_COIN_PAYMENTS_MODE` to `disabled`; only `test` permits test-key checkout for existing shop-authorized accounts.
- Never expose `TOSS_PAYMENTS_SECRET_KEY` or card data to the client, logs, or database.
- Determine package price and coin quantity only from server-owned `MUSEUN_COIN_PACKAGES`.
- Display one total balance, but track and spend free coins before paid coins; consume paid lots FIFO.
- Payment, supply, and cancellation records must be retained for at least five years and remain append-only where designated.
- Use the current Next.js 16 Route Handler, environment-variable, and data-security conventions documented under `node_modules/next/dist/docs/`.
- Use opaque random Toss `customerKey` and `orderId` values; never use email or raw user ID as the customer key.
- Do not modify the user's unrelated staged or unstaged work.

---

### Task 1: Payment domain types, configuration, and Toss adapter

**Files:**
- Modify: `package.json`
- Modify: `package-lock.json`
- Modify: `.env.example`
- Modify: `.env.production`
- Create: `src/lib/server/museunCoinPaymentConfig.ts`
- Create: `src/lib/server/museunCoinPaymentConfig.test.ts`
- Create: `src/lib/server/tossPayments.ts`
- Create: `src/lib/server/tossPayments.test.ts`

**Interfaces:**
- Produces: `MuseunCoinPaymentMode = "disabled" | "test" | "live"`.
- Produces: `readMuseunCoinPaymentConfig(env?)` returning `{ mode, clientKey, secretKey } | null` and failing closed for incomplete or live configuration in tests.
- Produces: `createTossPaymentsClient({ secretKey, fetchImpl? })` with `confirm`, `get`, and `cancel` methods returning normalized `TossPayment` data.

- [ ] **Step 1: Install the pinned official browser SDK**

Run: `npm install @tosspayments/tosspayments-sdk@2.8.1 --save-exact`

Expected: `package.json` and `package-lock.json` contain exactly version `2.8.1`.

- [ ] **Step 2: Write failing configuration tests**

Cover these exact cases in `museunCoinPaymentConfig.test.ts`:

```ts
expect(readMuseunCoinPaymentConfig({})).toBeNull();
expect(readMuseunCoinPaymentConfig({ MUSEUN_COIN_PAYMENTS_MODE: "disabled" }))
  .toBeNull();
expect(readMuseunCoinPaymentConfig({
  MUSEUN_COIN_PAYMENTS_MODE: "test",
  TOSS_PAYMENTS_CLIENT_KEY: "test_ck_demo",
  TOSS_PAYMENTS_SECRET_KEY: "test_sk_demo",
})).toEqual({
  mode: "test",
  clientKey: "test_ck_demo",
  secretKey: "test_sk_demo",
});
expect(() => readMuseunCoinPaymentConfig({
  MUSEUN_COIN_PAYMENTS_MODE: "live",
  TOSS_PAYMENTS_CLIENT_KEY: "test_ck_demo",
  TOSS_PAYMENTS_SECRET_KEY: "test_sk_demo",
})).toThrow("live_keys_required");
```

- [ ] **Step 3: Run the configuration tests and verify RED**

Run: `npm test -- src/lib/server/museunCoinPaymentConfig.test.ts`

Expected: FAIL because the module does not exist.

- [ ] **Step 4: Implement fail-closed runtime configuration**

Use a server-only module and exact environment names:

```ts
import "server-only";

export type MuseunCoinPaymentMode = "disabled" | "test" | "live";

export function readMuseunCoinPaymentConfig(
  env: Record<string, string | undefined> = process.env,
) {
  const mode = env.MUSEUN_COIN_PAYMENTS_MODE;
  if (!mode || mode === "disabled") return null;
  if (mode !== "test" && mode !== "live") throw new Error("invalid_payment_mode");
  const clientKey = env.TOSS_PAYMENTS_CLIENT_KEY?.trim();
  const secretKey = env.TOSS_PAYMENTS_SECRET_KEY?.trim();
  if (!clientKey || !secretKey) throw new Error("payment_keys_required");
  if (mode === "live" && (clientKey.startsWith("test_") || secretKey.startsWith("test_"))) {
    throw new Error("live_keys_required");
  }
  return { mode, clientKey, secretKey } as const;
}
```

Add empty examples to `.env.example` and explicit `MUSEUN_COIN_PAYMENTS_MODE=disabled` to `.env.production`. Do not add real keys.

- [ ] **Step 5: Write failing Toss adapter tests**

Test Basic auth as `base64(secretKey + ":")`, JSON headers, `/v1/payments/confirm`, encoded `/v1/payments/{paymentKey}`, `/v1/payments/{paymentKey}/cancel`, `Idempotency-Key`, normalization of `DONE`, `CANCELED`, and `PARTIAL_CANCELED`, and a typed `TossPaymentsError` for non-2xx responses and network ambiguity.

- [ ] **Step 6: Run the adapter tests and verify RED**

Run: `npm test -- src/lib/server/tossPayments.test.ts`

Expected: FAIL because the adapter is absent.

- [ ] **Step 7: Implement the Toss adapter and make both suites GREEN**

Use these public method signatures:

```ts
type TossPayment = {
  paymentKey: string;
  orderId: string;
  status: "READY" | "IN_PROGRESS" | "DONE" | "CANCELED" |
    "PARTIAL_CANCELED" | "ABORTED" | "EXPIRED";
  totalAmount: number;
  balanceAmount: number;
  method: string | null;
  approvedAt: string | null;
  cancels: Array<{ transactionKey: string; cancelAmount: number; cancelReason: string }>;
};

client.confirm({ paymentKey, orderId, amount, idempotencyKey });
client.get(paymentKey);
client.cancel({ paymentKey, cancelReason, cancelAmount, idempotencyKey });
```

Run: `npm test -- src/lib/server/museunCoinPaymentConfig.test.ts src/lib/server/tossPayments.test.ts`

Expected: PASS.

- [ ] **Step 8: Commit Task 1**

```bash
git add package.json package-lock.json .env.example .env.production src/lib/server/museunCoinPaymentConfig.ts src/lib/server/museunCoinPaymentConfig.test.ts src/lib/server/tossPayments.ts src/lib/server/tossPayments.test.ts
git commit -m "feat: add Toss payment configuration and adapter"
```

### Task 2: Relational payment and coin ledger schema

**Files:**
- Modify: `src/db/schema.ts`
- Create: `src/db/museunCoinPaymentSchema.test.ts`
- Create: `drizzle/0182_museun_coin_payments.sql`
- Modify: `drizzle/meta/_journal.json`
- Create: `drizzle/meta/0182_snapshot.json`

**Interfaces:**
- Produces tables `museunCoinAccounts`, `museunCoinPaymentOrders`, `museunCoinLedger`, `museunCoinPaidLots`, `museunCoinSpendAllocations`, and `museunCoinRefundRequests`.
- Payment order status union: `ready | confirming | paid | cancel_pending | partially_canceled | canceled | failed | review_required`.

- [ ] **Step 1: Write a failing schema contract test**

Use Drizzle metadata assertions to require the six exports, non-negative checks on balances/amounts, unique `customer_key`, `order_id`, `payment_key`, and `event_key`, and indexes for user/order history and pending reconciliation.

- [ ] **Step 2: Run the schema test and verify RED**

Run: `npm test -- src/db/museunCoinPaymentSchema.test.ts`

Expected: FAIL because the exports are absent.

- [ ] **Step 3: Add focused schema definitions**

Define the following columns without card PAN/CVC fields:

```ts
museunCoinAccounts: userId PK/FK, customerKey UNIQUE, freeBalance,
  paidBalance, reviewRequiredAt, reviewReason, createdAt, updatedAt
museunCoinPaymentOrders: orderId PK, userId FK, packageId, coinAmount,
  amountKrw, status, paymentKey UNIQUE NULLABLE, method NULLABLE,
  failureCode NULLABLE, failureMessage NULLABLE, requestedAt, approvedAt,
  canceledAt, updatedAt
museunCoinLedger: id serial PK, eventKey UNIQUE, userId FK, kind,
  sourceId, freeDelta, paidDelta, freeBalanceAfter, paidBalanceAfter,
  detail jsonb, createdAt
museunCoinPaidLots: orderId PK/FK, userId FK, grantedCoins,
  availableCoins, heldCoins, createdAt, updatedAt
museunCoinSpendAllocations: id serial PK, ledgerId FK, lotOrderId FK,
  coins, createdAt
museunCoinRefundRequests: id text PK, orderId FK, userId FK,
  requestedCoins, amountKrw, reason, status, processedByEmail,
  tossTransactionKey, createdAt, updatedAt, processedAt
```

Use integer non-negative checks, valid-status checks, and a lot invariant of
`availableCoins + heldCoins <= grantedCoins`.

- [ ] **Step 4: Generate the named migration**

Run: `npm run db:generate -- --name museun_coin_payments`

Expected: Drizzle creates migration `0182_museun_coin_payments.sql`, snapshot `0182_snapshot.json`, and a journal entry.

- [ ] **Step 5: Verify migration and schema consistency**

Run: `npm test -- src/db/museunCoinPaymentSchema.test.ts && npm run check-migrations`

Expected: PASS with no schema/migration mismatch.

- [ ] **Step 6: Commit Task 2**

```bash
git add src/db/schema.ts src/db/museunCoinPaymentSchema.test.ts drizzle/0182_museun_coin_payments.sql drizzle/meta/0182_snapshot.json drizzle/meta/_journal.json
git commit -m "feat: add Museun Coin payment ledger schema"
```

### Task 3: Transactional Museun Coin account service

**Files:**
- Create: `src/lib/server/museunCoinAccount.ts`
- Create: `src/lib/server/museunCoinAccount.test.ts`

**Interfaces:**
- Produces `getMuseunCoinBalance(executor, userId)` returning `{ freeCoins, paidCoins, coins }`.
- Produces `lockMuseunCoinAccount(tx, userId)` which locks the user row, lazily imports the legacy wallet as free balance, creates an opaque customer key, and returns the account.
- Produces `grantFreeMuseunCoins(tx, input)`, `grantPaidMuseunCoins(tx, input)`, `spendMuseunCoins(tx, input)`, `holdPaidLotForRefund(tx, input)`, `releasePaidLotHold(tx, input)`, and `finalizePaidLotRefund(tx, input)`.
- All mutation inputs include a unique `eventKey`; duplicate keys return the previously committed balance without reapplying deltas.

- [ ] **Step 1: Write failing pure allocation and service tests**

Cover legacy `coins` import as free, zero-balance new users, free-first spending, FIFO paid-lot allocation, insufficient balance with no writes, duplicate event replay, refund holds, and an invariant that account total matches the legacy mirror after every mutation.

- [ ] **Step 2: Run the tests and verify RED**

Run: `npm test -- src/lib/server/museunCoinAccount.test.ts`

Expected: FAIL because the service is absent.

- [ ] **Step 3: Implement account locking and lazy migration**

Lock `users.id` first, then `museunCoinAccounts`, then paid lots ordered by `createdAt, orderId`. If the account is absent, read `museun-coin-wallet.v1`, normalize it with `parseMuseunCoinBalance`, store the amount as `freeBalance`, set `paidBalance=0`, and generate `customerKey` as `mc_` plus a hyphen-free UUID.

- [ ] **Step 4: Implement append-only grants and spending**

Return a discriminated result:

```ts
type MuseunCoinSpendResult =
  | { ok: true; coins: number; freeCoins: number; paidCoins: number; ledgerId: number }
  | { ok: false; error: "insufficient_coins"; coins: number; requiredCoins: number };
```

Insert the ledger event, update account balances, create spend allocations, and mirror `{ ...legacyWallet, coins }` in one transaction. Never update or delete an existing ledger row.

- [ ] **Step 5: Implement refund holds and finalization**

Only hold coins still available in the target lot. Finalization decrements `heldCoins` and the account paid balance, records a negative paid ledger delta, and mirrors the total. Release changes only the lot hold and creates an audit ledger event with zero balance delta.

- [ ] **Step 6: Run focused tests**

Run: `npm test -- src/lib/server/museunCoinAccount.test.ts src/adventure/data/v2/museunCashItems.test.ts`

Expected: PASS.

- [ ] **Step 7: Commit Task 3**

```bash
git add src/lib/server/museunCoinAccount.ts src/lib/server/museunCoinAccount.test.ts
git commit -m "feat: add transactional Museun Coin accounts"
```

### Task 4: Move existing Museun Coin mutations onto the account service

**Files:**
- Modify: `src/app/api/v2/museun-coin-shop/route.ts`
- Modify: `src/app/api/v2/museun-coin-shop/route.test.ts`
- Modify: `src/app/api/v2/guild/emblem/route.ts`
- Modify: `src/lib/server/guildEmblemRoute.test.ts`
- Modify: `src/app/api/marketplace/inbox/claim/route.ts`
- Modify: `src/lib/server/inboxClaimSeasonReward.test.ts`

**Interfaces:**
- Consumes the Task 3 balance/grant/spend functions.
- Produces no remaining production call site that directly writes `MUSEUN_COIN_WALLET_KEY`.

- [ ] **Step 1: Update route tests first**

Assert shop purchases and guild emblems call `spendMuseunCoins` with stable event keys derived from the operation, and inbox season rewards call `grantFreeMuseunCoins` with the claimed inbox entry ID. Preserve existing response `coins` fields and error codes.

- [ ] **Step 2: Run the three focused suites and verify RED**

Run: `npm test -- src/app/api/v2/museun-coin-shop/route.test.ts src/lib/server/guildEmblemRoute.test.ts src/lib/server/inboxClaimSeasonReward.test.ts`

Expected: FAIL because routes still mutate `savesKv` directly.

- [ ] **Step 3: Refactor the shop purchase transaction**

Keep the existing character/growth/stamina locks and item delivery logic. Replace wallet locking and subtraction with `spendMuseunCoins(tx, { userId, coins: totalPrice, eventKey, sourceId, kind: "shop_purchase" })` inside the same transaction so item delivery rolls back with the spend.

- [ ] **Step 4: Refactor guild emblem and inbox reward mutations**

Preserve the guild-row-first lock order, then enter the coin service. Grant inbox Museun Coins as free and keep PvP/fishing wallets unchanged.

- [ ] **Step 5: Prove direct wallet writes are gone**

Run: `rg -n "upsertSave\(.*MUSEUN_COIN_WALLET_KEY|eq\(savesKv.key, MUSEUN_COIN_WALLET_KEY\)" src --glob '!**/*.test.*'`

Expected: no production mutation matches; the compatibility mirror exists only inside `museunCoinAccount.ts`.

- [ ] **Step 6: Run focused regression tests**

Run: `npm test -- src/app/api/v2/museun-coin-shop/route.test.ts src/lib/server/guildEmblemRoute.test.ts src/lib/server/inboxClaimSeasonReward.test.ts`

Expected: PASS.

- [ ] **Step 7: Commit Task 4**

```bash
git add src/app/api/v2/museun-coin-shop/route.ts src/app/api/v2/museun-coin-shop/route.test.ts src/app/api/v2/guild/emblem/route.ts src/lib/server/guildEmblemRoute.test.ts src/app/api/marketplace/inbox/claim/route.ts src/lib/server/inboxClaimSeasonReward.test.ts
git commit -m "refactor: centralize Museun Coin mutations"
```

### Task 5: Order creation, confirmation, status, history, and webhook recovery

**Files:**
- Create: `src/lib/server/museunCoinPayments.ts`
- Create: `src/lib/server/museunCoinPayments.test.ts`
- Create: `src/app/api/v2/museun-coin-payments/orders/route.ts`
- Create: `src/app/api/v2/museun-coin-payments/orders/route.test.ts`
- Create: `src/app/api/v2/museun-coin-payments/orders/[orderId]/route.ts`
- Create: `src/app/api/v2/museun-coin-payments/confirm/route.ts`
- Create: `src/app/api/v2/museun-coin-payments/confirm/route.test.ts`
- Create: `src/app/api/toss-payments/webhook/route.ts`
- Create: `src/app/api/toss-payments/webhook/route.test.ts`

**Interfaces:**
- Consumes Tasks 1-3.
- Produces `createPaymentOrder`, `confirmPaymentOrder`, `reconcilePaymentOrder`, `getPaymentOrderForUser`, and `listPaymentOrdersForUser`.
- Produces client-safe order DTOs without secret keys or raw Toss payloads.

- [ ] **Step 1: Write failing service and route tests**

Cover disabled mode as `404`, unauthorized as `401` only when the shop is publicly open, invalid package, server-owned price, opaque customer/order keys, owner-only reads, amount mismatch, concurrent confirmation, confirmed-payment replay, Toss rejection, ambiguous timeout reconciliation, duplicate webhooks, and webhook completion under ten seconds.

- [ ] **Step 2: Run focused tests and verify RED**

Run: `npm test -- src/lib/server/museunCoinPayments.test.ts src/app/api/v2/museun-coin-payments/orders/route.test.ts src/app/api/v2/museun-coin-payments/confirm/route.test.ts src/app/api/toss-payments/webhook/route.test.ts`

Expected: FAIL because payment services and routes are absent.

- [ ] **Step 3: Implement order creation and safe DTOs**

Accept only `{ packageId }`, validate `canAccessMuseunCoinShop`, payment mode, rate limits, and the server catalog. Generate `orderId` as `mc_` plus a hyphen-free UUID, persist the snapshot, and return `{ orderId, orderName, amountKrw, coinAmount, customerKey, clientKey }`.

- [ ] **Step 4: Implement the confirmation state machine**

Persist `paymentKey` and conditionally move `ready -> confirming`. Call Toss outside a long-lived database transaction. On exact `DONE` result, transactionally call `grantPaidMuseunCoins` with `eventKey: "payment:" + paymentKey`, create the paid lot, and set `paid`. Replays return the existing paid DTO. Rejected results set `failed`; network ambiguity calls `get(paymentKey)` and either completes, fails, or sets `review_required`.

- [ ] **Step 5: Implement status and history routes**

Return only the current user's orders, newest first, capped at 50. Include order ID, package snapshot, amounts, status, safe method label, timestamps, refundable coin count, and refund status.

- [ ] **Step 6: Implement webhook reconciliation**

Accept only `PAYMENT_STATUS_CHANGED` and `CANCEL_STATUS_CHANGED` JSON shapes with bounded body size. Locate by `paymentKey` or `orderId`, fetch authoritative Toss state, and invoke idempotent reconciliation. Unknown orders return `200` without creating a grant; invalid JSON returns `400`.

- [ ] **Step 7: Run focused suites**

Run: `npm test -- src/lib/server/museunCoinPayments.test.ts src/app/api/v2/museun-coin-payments/orders/route.test.ts src/app/api/v2/museun-coin-payments/confirm/route.test.ts src/app/api/toss-payments/webhook/route.test.ts`

Expected: PASS.

- [ ] **Step 8: Commit Task 5**

```bash
git add src/lib/server/museunCoinPayments.ts src/lib/server/museunCoinPayments.test.ts src/app/api/v2/museun-coin-payments src/app/api/toss-payments/webhook
git commit -m "feat: add idempotent web payment flow"
```

### Task 6: Refund service and user/admin APIs

**Files:**
- Create: `src/lib/server/museunCoinRefunds.ts`
- Create: `src/lib/server/museunCoinRefunds.test.ts`
- Create: `src/app/api/v2/museun-coin-payments/refunds/route.ts`
- Create: `src/app/api/v2/museun-coin-payments/refunds/route.test.ts`
- Create: `src/app/api/admin/museun-coin-payments/route.ts`
- Create: `src/app/api/admin/museun-coin-payments/route.test.ts`

**Interfaces:**
- Produces `requestMuseunCoinRefund`, `approveMuseunCoinRefund`, `rejectMuseunCoinRefund`, and `reconcileMuseunCoinRefund`.
- Uses `requireAdminRole("super")` for cancellation mutations and `logAdminAction` for every admin decision.

- [ ] **Step 1: Write failing refund tests**

Cover owner validation, duplicate request replay, untouched-lot immediate full cancellation, partially used lot as `review_required`, hold preventing spend, Toss cancel success, cancel failure releasing the hold, ambiguous cancel retaining the hold, admin partial amount bounded by available coins, and audit logging without secrets.

- [ ] **Step 2: Run refund tests and verify RED**

Run: `npm test -- src/lib/server/museunCoinRefunds.test.ts src/app/api/v2/museun-coin-payments/refunds/route.test.ts src/app/api/admin/museun-coin-payments/route.test.ts`

Expected: FAIL because refund modules are absent.

- [ ] **Step 3: Implement user refund requests**

Accept `{ orderId, reason }`. For an untouched lot, create a request, hold all available coins, call Toss full cancel with a stable idempotency key, and finalize or reconcile. For a partially used lot, create a pending request without calling Toss and return `review_required`.

- [ ] **Step 4: Implement super-admin review and reconciliation**

Support exact actions `{ action: "approve_refund", refundId, coins, reason }`, `{ action: "reject_refund", refundId, reason }`, and `{ action: "reconcile_order", orderId, reason }`. Convert coins to KRW using the order snapshot ratio and reject non-integral or excessive amounts.

- [ ] **Step 5: Run refund suites**

Run: `npm test -- src/lib/server/museunCoinRefunds.test.ts src/app/api/v2/museun-coin-payments/refunds/route.test.ts src/app/api/admin/museun-coin-payments/route.test.ts`

Expected: PASS.

- [ ] **Step 6: Commit Task 6**

```bash
git add src/lib/server/museunCoinRefunds.ts src/lib/server/museunCoinRefunds.test.ts src/app/api/v2/museun-coin-payments/refunds src/app/api/admin/museun-coin-payments
git commit -m "feat: add Museun Coin refund workflow"
```

### Task 7: User checkout, callback, history, and refund UI

**Files:**
- Create: `src/adventure/v2/MuseunCoinCheckout.tsx`
- Create: `src/adventure/v2/MuseunCoinCheckout.test.tsx`
- Modify: `src/adventure/v2/MuseunCoinShopView.tsx`
- Modify: `src/adventure/v2/MuseunCoinShopView.test.tsx`
- Create: `src/app/(game)/settings/coin-shop/payment/success/page.tsx`
- Create: `src/app/(game)/settings/coin-shop/payment/fail/page.tsx`
- Create: `src/app/(game)/settings/coin-shop/payment/PaymentResultView.tsx`
- Create: `src/app/(game)/settings/coin-shop/payment/PaymentResultView.test.tsx`

**Interfaces:**
- Consumes Task 5 order DTO and `@tosspayments/tosspayments-sdk` V2.
- Uses `TossPayments(clientKey).widgets({ customerKey })`, `setAmount`, `renderPaymentWindow`, and redirect-mode `requestPayment`.

- [ ] **Step 1: Write failing component tests**

Assert package buttons show KRW prices, disabled mode keeps `결제 준비 중`, test mode creates a server order before loading Toss, rapid double click creates one order, SDK errors restore the button, callbacks never show success before server confirmation, pending status polls safely, and history/refund controls are keyboard accessible.

- [ ] **Step 2: Run UI tests and verify RED**

Run: `npm test -- src/adventure/v2/MuseunCoinCheckout.test.tsx src/adventure/v2/MuseunCoinShopView.test.tsx src/app/\(game\)/settings/coin-shop/payment/PaymentResultView.test.tsx`

Expected: FAIL because checkout components are absent.

- [ ] **Step 3: Implement the checkout component**

Keep the existing opaque modal surfaces. Create the server order, initialize the V2 SDK client-side, set `{ value: amountKrw, currency: "KRW" }`, open the payment-window variant, and request payment with absolute same-origin success/fail URLs. Send only server-returned order data to the SDK.

- [ ] **Step 4: Implement callback result pages**

The success client reads `paymentKey`, `orderId`, and `amount`, posts them to the confirm route once, and renders success only for `paid`. `confirming` and `review_required` show a pending recovery state with order lookup. The fail page maps known SDK codes to safe Korean messages and does not echo arbitrary query text.

- [ ] **Step 5: Add history and refund requests**

Load up to 50 safe order DTOs when the charge modal opens. Show receipt status, package, amount, date, refundable coins, and a refund request form. Keep cards and panels on `SURFACE_CARD` or `SURFACE_INSET` and verify light/dark opacity rules.

- [ ] **Step 6: Run UI suites**

Run: `npm test -- src/adventure/v2/MuseunCoinCheckout.test.tsx src/adventure/v2/MuseunCoinShopView.test.tsx src/app/\(game\)/settings/coin-shop/payment/PaymentResultView.test.tsx`

Expected: PASS.

- [ ] **Step 7: Commit Task 7**

```bash
git add src/adventure/v2/MuseunCoinCheckout.tsx src/adventure/v2/MuseunCoinCheckout.test.tsx src/adventure/v2/MuseunCoinShopView.tsx src/adventure/v2/MuseunCoinShopView.test.tsx 'src/app/(game)/settings/coin-shop/payment'
git commit -m "feat: add Museun Coin web checkout UI"
```

### Task 8: Standalone payment operations page

**Files:**
- Create: `src/app/admin/payments/page.tsx`
- Create: `src/admin/MuseunCoinPaymentsAdmin.tsx`
- Create: `src/admin/MuseunCoinPaymentsAdmin.test.tsx`

**Interfaces:**
- Consumes Task 6 admin API.
- Does not modify the currently dirty `src/admin/AdminShell.tsx`; the page is available at `/admin/payments` and uses the same server-side admin gate.

- [ ] **Step 1: Write failing admin component tests**

Cover search by order/user/status, status and paid-lot summaries, safe reconciliation, refund approve/reject dialogs requiring a reason, destructive-action confirmation, read-only loading/error states, and accessible table/card alternatives on narrow screens.

- [ ] **Step 2: Run the component test and verify RED**

Run: `npm test -- src/admin/MuseunCoinPaymentsAdmin.test.tsx`

Expected: FAIL because the page is absent.

- [ ] **Step 3: Implement the protected page and client**

Mirror `src/app/admin/page.tsx`: call `isCurrentUserAdmin()`, return `notFound()` when false, and render `MuseunCoinPaymentsAdmin`. The client calls only the admin API, never accepts a secret key, and renders operation results with order IDs suitable for support lookup.

- [ ] **Step 4: Run the admin component and API tests**

Run: `npm test -- src/admin/MuseunCoinPaymentsAdmin.test.tsx src/app/api/admin/museun-coin-payments/route.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit Task 8**

```bash
git add src/app/admin/payments/page.tsx src/admin/MuseunCoinPaymentsAdmin.tsx src/admin/MuseunCoinPaymentsAdmin.test.tsx
git commit -m "feat: add payment operations console"
```

### Task 9: Security headers, policy copy, and release gates

**Files:**
- Modify: `next.config.ts`
- Modify: `src/productionSecuritySurface.test.ts`
- Modify: `src/app/terms/page.tsx`
- Modify: `src/app/privacy/page.tsx`
- Modify: `src/app/policy-pages.test.tsx`
- Modify: `docs/release-readiness.md`
- Create: `docs/museun-coin-payment-operations.md`

**Interfaces:**
- Adds only Toss-documented origins required by SDK/API behavior.
- Keeps tracked production payment mode disabled and shop closed.

- [ ] **Step 1: Update security and policy tests first**

Require production to fail closed when payment variables are absent, reject test keys in live mode, preserve hidden shop behavior, and require terms/privacy pages to disclose paid coins, payment processor handling, refund rules, and support contact without claiming live availability.

- [ ] **Step 2: Run focused tests and verify RED**

Run: `npm test -- src/productionSecuritySurface.test.ts src/app/policy-pages.test.tsx`

Expected: FAIL on the old no-payment copy and missing payment assertions.

- [ ] **Step 3: Apply minimum CSP and policy changes**

Prefer the npm SDK so `script-src` does not require a third-party loader. Add `https://*.tosspayments.com` to `frame-src` and `connect-src`; server Core API requests are not governed by browser CSP. Update terms and privacy copy as a pre-release draft, with effective date tied to a future explicit live activation rather than this code commit.

- [ ] **Step 4: Write the operations runbook**

Document disabled/test/live variables, test-key setup, Toss webhook URL `/api/toss-payments/webhook`, order reconciliation, full/partial refunds, five-year retention, PG/card review checklist, grade-content modification review, rollback behavior, and the rule that payment mode and shop gate remain off until explicit approval.

- [ ] **Step 5: Run focused security and policy tests**

Run: `npm test -- src/productionSecuritySurface.test.ts src/app/policy-pages.test.tsx`

Expected: PASS.

- [ ] **Step 6: Commit Task 9**

```bash
git add next.config.ts src/productionSecuritySurface.test.ts src/app/terms/page.tsx src/app/privacy/page.tsx src/app/policy-pages.test.tsx docs/release-readiness.md docs/museun-coin-payment-operations.md
git commit -m "docs: prepare paid coin policies and controls"
```

### Task 10: End-to-end verification without deployment

**Files:**
- Modify: `e2e/public-surface.spec.ts`
- Create: `e2e/museun-coin-payment.spec.ts`
- Modify: `docs/museun-coin-payment-operations.md`

**Interfaces:**
- Verifies closed production and authenticated test-mode surfaces without making a live charge.

- [ ] **Step 1: Add E2E coverage**

Test closed-mode 404 behavior, test-authorized charge modal, server-owned package prices, safe fail callback rendering, order history isolation, and admin page authorization. Mock Toss only at the browser/network boundary; keep service/route tests responsible for Core API contract behavior.

- [ ] **Step 2: Run targeted unit and E2E tests**

Run: `npm test -- src/lib/server/museunCoin src/app/api/v2/museun-coin-payments src/app/api/toss-payments src/app/api/admin/museun-coin-payments src/adventure/v2/MuseunCoin src/admin/MuseunCoinPaymentsAdmin.test.tsx`

Run: `npx playwright test e2e/museun-coin-payment.spec.ts e2e/public-surface.spec.ts`

Expected: all selected tests PASS; no request reaches a live Toss key.

- [ ] **Step 3: Run repository verification**

Run: `npm run lint`

Run: `npx tsc --noEmit`

Run: `npm test`

Run: `npm run build`

Expected: all commands exit 0. If unrelated pre-existing work fails, record the exact failing command and prove all payment-focused tests still pass.

- [ ] **Step 4: Verify release gates and secrets**

Run: `rg -n "MUSEUN_COIN_PAYMENTS_MODE|NEXT_PUBLIC_MUSEUN_COIN_SHOP_OPEN|TOSS_PAYMENTS_(CLIENT|SECRET)_KEY" .env.production .env.example`

Expected: production mode is `disabled`, production shop is `false`, example keys are empty, and no real key is committed.

Run: `git grep -nE "(live|test)_(ck|sk)_[A-Za-z0-9]" -- ':!docs/superpowers/plans/2026-09-04-web-card-payment.md'`

Expected: no credential-like value is present.

- [ ] **Step 5: Update runbook verification evidence and commit**

Record commands and outcomes without secrets in `docs/museun-coin-payment-operations.md`.

```bash
git add e2e/museun-coin-payment.spec.ts e2e/public-surface.spec.ts docs/museun-coin-payment-operations.md
git commit -m "test: verify web card payment integration"
```

- [ ] **Step 6: Confirm no deployment or activation occurred**

Run: `git status --short && git log --oneline -12`

Expected: payment work is committed locally, unrelated user changes remain untouched, no deployment command was run, and tracked production gates remain closed.
