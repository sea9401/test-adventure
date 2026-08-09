# Admin Mail Consumable Attachments Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 관리자 대량 우편의 소비 아이템 목록에서 스태미나 회복약, 수행 초기화 물약, 100레벨 달성의 비약을 선택하고 정상 지급할 수 있게 한다.

**Architecture:** 별도 브랜치에 완성된 100레벨 비약 구현을 현재 브랜치에 통합한 뒤, 관리자 우편 전용 순수 헬퍼가 UI 분류와 payload 변환을 담당한다. 서버는 기존 `staminaPotions`와 `cashItems` 계약을 그대로 사용한다.

**Tech Stack:** TypeScript, React Client Components, Next.js App Router, Vitest

## Global Constraints

- 수행 초기화 물약과 100레벨 달성의 비약은 소비 아이템 목록에만 노출하고 코인샵 목록에서는 제외한다.
- 서버 우편·수령 계약과 아이템 효과는 변경하지 않는다.
- 배포하지 않는다.
- 서브에이전트를 사용하지 않는다.

---

### Task 1: 100레벨 달성의 비약 구현 통합

**Files:**
- Integrate existing commits affecting: `src/adventure/data/v2/museunCashItems.ts`, `src/lib/server/expTomeGrant.ts`, `src/app/api/v2/me/use-cash-item/route.ts`, `src/adventure/v2/V2InventoryView.tsx`, `src/adventure/v2/inventory/RareMapsTab.tsx` and their tests

**Interfaces:**
- Produces: `LEVEL_100_ELIXIR_ITEM_ID`, `MUSEUN_CASH_ITEMS.level_100_elixir`, and the existing cash-item use path

- [ ] **Step 1: Integrate the completed feature commit series**

```bash
git cherry-pick 8a3cee2a4 7cd726da7 537d1ba0e d578bee69 faae811d7
```

- [ ] **Step 2: Run the existing feature tests**

Run:

```bash
npm test -- --run src/adventure/data/v2/museunCashItems.test.ts src/lib/server/expTomeGrant.test.ts src/app/api/v2/me/use-cash-item/route.test.ts src/adventure/v2/inventory/RareMapsTab.test.tsx
```

Expected: all selected tests pass.

### Task 2: 관리자 우편 첨부 분류와 전송 변환

**Files:**
- Create: `src/admin/broadcastMailAttachments.ts`
- Create: `src/admin/broadcastMailAttachments.test.ts`

**Interfaces:**
- Consumes: `CatalogOption`, `AttachmentEntry`, `MUSEUN_ADMIN_GIFT_ITEM_IDS`, `CULTIVATION_RESET_POTION_ITEM_ID`, `LEVEL_100_ELIXIR_ITEM_ID`
- Produces: `adminMailConsumableOptions(): CatalogOption[]`, `adminMailCashItemOptions(): CatalogOption[]`, `splitAdminMailConsumables(entries: readonly AttachmentEntry[]): { staminaPotions: number; cashItems: { itemId: string; count: number }[] }`

- [ ] **Step 1: Write failing option and payload tests**

```ts
expect(adminMailConsumableOptions().map((option) => option.id)).toEqual([
  "stamina_potion",
  "cultivation_reset_potion",
  "level_100_elixir",
]);
expect(adminMailCashItemOptions().map((option) => option.id)).not.toContain(
  "cultivation_reset_potion",
);
expect(adminMailCashItemOptions().map((option) => option.id)).not.toContain(
  "level_100_elixir",
);
expect(
  splitAdminMailConsumables([
    { id: "stamina_potion", count: 3 },
    { id: "cultivation_reset_potion", count: 2 },
    { id: "level_100_elixir", count: 1 },
  ]),
).toEqual({
  staminaPotions: 3,
  cashItems: [
    { itemId: "cultivation_reset_potion", count: 2 },
    { itemId: "level_100_elixir", count: 1 },
  ],
});
```

- [ ] **Step 2: Run the new test and verify RED**

Run: `npm test -- --run src/admin/broadcastMailAttachments.test.ts`

Expected: FAIL because the helper module does not exist.

- [ ] **Step 3: Implement the pure helper**

Create catalog-derived options. Filter the two utility item IDs out of the coin-shop options. Split stamina into `staminaPotions` and map the other two entries into `cashItems`; ignore unknown IDs.

- [ ] **Step 4: Run the helper test and verify GREEN**

Run: `npm test -- --run src/admin/broadcastMailAttachments.test.ts`

Expected: PASS.

### Task 3: 관리자 대량 우편 화면 연결

**Files:**
- Modify: `src/admin/tabs/BroadcastTab.tsx`
- Modify: `src/admin/tabs/BroadcastTab.test.tsx`

**Interfaces:**
- Consumes: the three helper functions from Task 2
- Produces: UI options and existing `/api/admin/mail` request body

- [ ] **Step 1: Extend the component regression test**

```ts
const consumableStart = html.indexOf(">소비 아이템 첨부<");
const cashItemStart = html.indexOf(">무슨 코인샵 아이템 첨부<");
const consumableSection = html.slice(consumableStart, cashItemStart);
const cashItemSection = html.slice(cashItemStart);

expect(consumableSection).toContain("스태미나 회복약");
expect(consumableSection).toContain("수행 초기화 물약");
expect(consumableSection).toContain("100레벨 달성의 비약");
expect(cashItemSection).not.toContain("수행 초기화 물약");
expect(cashItemSection).not.toContain("100레벨 달성의 비약");
```

- [ ] **Step 2: Run the component test and verify RED**

Run: `npm test -- --run src/admin/tabs/BroadcastTab.test.tsx`

Expected: FAIL because the current branch does not expose all three items in the consumer picker behavior.

- [ ] **Step 3: Connect options and payload conversion**

Replace the hard-coded consumer option and direct cash-item map with the Task 2 helpers. Send:

```ts
const consumables = splitAdminMailConsumables(attachConsumables);
staminaPotions: consumables.staminaPotions,
cashItems: [
  ...attachCashItems.map(({ id, count }) => ({ itemId: id, count })),
  ...consumables.cashItems,
],
```

- [ ] **Step 4: Run administrator mail tests and typecheck**

Run:

```bash
npm test -- --run src/admin/broadcastMailAttachments.test.ts src/admin/tabs/BroadcastTab.test.tsx
npx tsc --noEmit
```

Expected: all tests and typecheck pass.

- [ ] **Step 5: Commit the administrator mail change**

```bash
git add src/admin/broadcastMailAttachments.ts src/admin/broadcastMailAttachments.test.ts src/admin/tabs/BroadcastTab.tsx src/admin/tabs/BroadcastTab.test.tsx
git commit -m "feat: add utility items to admin bulk mail"
```
