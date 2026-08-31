# Farm Endgame Token Shop Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 밭 6칸과 유료 축사 4칸을 모두 연 플레이어에게 농장 증표로 사료·거름을 반복 구매하고 전용 칭호 2종을 수집할 수 있는 `농장주의 교환소`를 제공한다.

**Architecture:** 가격·보상·해금 진행도는 클라이언트와 서버가 공유하는 순수 `farmEndgameShop` 모듈에 둔다. 전용 Next.js Route Handler가 `farm.v2`를 먼저 잠근 뒤 상품 종류에 따라 농장, 생활 제작 또는 모험의 서 저장을 한 트랜잭션에서 갱신하고, 기존 `useFarm` 흐름과 독립 UI 컴포넌트가 농장 화면과 통합 교환소에 같은 상태를 보여 준다.

**Tech Stack:** Next.js 16.2.11 App Router Route Handlers, React 19.2.4, TypeScript 5, Drizzle transaction/KV saves, Vitest 4, Testing Library, Tailwind CSS 4.

## Global Constraints

- Route Handler 작성 전 `node_modules/next/dist/docs/01-app/01-getting-started/15-route-handlers.md`와 `node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/route.md`를 끝까지 읽는다.
- 해금 조건은 밭 `6/6`과 비용이 있는 축사 `4/4`다. 별도 해금 플래그는 저장하지 않는다.
- `ranch-feed-bundle`: 증표 20개 → 배합 사료 5개, 무제한.
- `fertilizer-bundle`: 증표 24개 → 유기질 거름 3개, 무제한.
- `title-bountiful-hand`: 증표 1,000개 → `farm_bountiful_hand`, 1회.
- `title-golden-fields-owner`: 증표 5,000개 → `farm_golden_fields_owner`, 1회.
- 기존 씨앗 상자, 밭 확장, 축사 확장 가격과 동작은 변경하지 않는다.
- 신규 능력치, 신규 이미지, 프로필 꾸미기 상자, DB 마이그레이션은 추가하지 않는다.
- 새 패널과 카드는 `SURFACE_CARD`와 `SURFACE_INSET`을 사용한다. 반투명 카드와 컨테이너 전체 `opacity-*`는 사용하지 않는다.
- 기존 사료·거름 이미지를 재사용하고 이미지 파일은 추가하지 않는다.
- 현재 작업 트리의 다른 변경은 수정·스테이징·커밋하지 않는다.
- 배포하거나 점검 모드를 변경하지 않는다.

---

## File Map

- Create `src/adventure/v2/farmEndgameShop.ts`: 상품, 타입, 해금 진행도와 뷰 생성.
- Create `src/adventure/v2/farmEndgameShop.test.ts`: 상품 수치와 해금 순수 테스트.
- Modify `src/adventure/data/titles.ts`: 전용 칭호 2종과 ID 상수.
- Create `src/app/api/v2/farm/endgame-shop/route.ts`: 원자적 구매 Route Handler.
- Create `src/lib/server/farmEndgameShopRoute.test.ts`: GET/POST 저장 및 실패 회귀.
- Modify `src/app/api/v2/farm/route.ts`: 초기 응답에 후반 교환소 뷰 추가.
- Modify `src/adventure/v2/useFarm.ts`: 교환소 상태와 구매 mutation.
- Create `src/adventure/v2/FarmEndgameShopPanel.tsx`: 잠금·상품·칭호 UI.
- Create `src/adventure/v2/FarmEndgameShopPanel.test.tsx`: 표시·표면·확인창 테스트.
- Modify `src/adventure/v2/AdventurerFarmPanel.tsx`: 두 상점 진입점에 패널 합성.
- Modify `src/adventure/v2/AdventurerFarmPanel.test.tsx`: 통합 회귀.
- Modify `src/app/manual/content/pastimes.tsx`: 플레이어 안내.
- Modify `src/app/manual/current-content.test.tsx`: 매뉴얼 렌더 회귀.

---

### Task 1: Catalog, unlock model, and titles

**Files:**
- Create: `src/adventure/v2/farmEndgameShop.ts`
- Create: `src/adventure/v2/farmEndgameShop.test.ts`
- Modify: `src/adventure/data/titles.ts`

**Interfaces:**
- Consumes: `FarmState`, `RANCH_PEN_DEFINITIONS`, `TITLES`.
- Produces: `FARM_ENDGAME_SHOP_ITEMS`, `FARM_ENDGAME_SHOP_TITLE_IDS`, `farmEndgameShopItem`, `farmEndgameShopProgress`, `farmEndgameShopView`, `FarmEndgameShopView`, `FarmEndgameShopPurchaseResult`.

- [ ] **Step 1: Write failing catalog and unlock tests**

```ts
it("승인된 상품과 가격을 정의한다", () => {
  expect(FARM_ENDGAME_SHOP_ITEMS).toMatchObject([
    { id: "ranch-feed-bundle", costReputation: 20, reward: { kind: "farmItem", itemId: "compound_feed", quantity: 5 } },
    { id: "fertilizer-bundle", costReputation: 24, reward: { kind: "finishedItem", itemId: "organic_fertilizer", quantity: 3 } },
    { id: "title-bountiful-hand", costReputation: 1_000, reward: { kind: "title", titleId: "farm_bountiful_hand" } },
    { id: "title-golden-fields-owner", costReputation: 5_000, reward: { kind: "title", titleId: "farm_golden_fields_owner" } },
  ]);
});

it("밭 6칸과 유료 축사 4칸을 모두 열어야 해금한다", () => {
  expect(farmEndgameShopProgress(emptyFarmState(1_000))).toEqual({
    unlocked: false, plots: 2, requiredPlots: 6, pens: 0, requiredPens: 4,
  });
  expect(farmEndgameShopProgress(completedFarm()).unlocked).toBe(true);
});

it("교환소 칭호만 보유 목록에 포함한다", () => {
  expect(farmEndgameShopView(completedFarm(), ["first_blood", "farm_bountiful_hand"]).ownedTitleIds)
    .toEqual(["farm_bountiful_hand"]);
});
```

`completedFarm()`은 `emptyFarmState()`를 바탕으로 빈 밭 6개와 모든 ranch pen의 `unlocked: true`를 만든다.

- [ ] **Step 2: Run tests and verify RED**

Run: `npm test -- src/adventure/v2/farmEndgameShop.test.ts`

Expected: FAIL because `farmEndgameShop.ts` does not exist.

- [ ] **Step 3: Add title constants and definitions**

```ts
export const FARM_BOUNTIFUL_HAND_TITLE_ID = "farm_bountiful_hand";
export const FARM_GOLDEN_FIELDS_OWNER_TITLE_ID = "farm_golden_fields_owner";

[FARM_BOUNTIFUL_HAND_TITLE_ID]: {
  id: FARM_BOUNTIFUL_HAND_TITLE_ID,
  name: "풍요의 손",
  description: "오랜 수확으로 마을의 풍요를 일군 농장주.",
  condition: "농장주의 교환소에서 농장 증표 1,000개로 구매",
  category: "collection",
},
[FARM_GOLDEN_FIELDS_OWNER_TITLE_ID]: {
  id: FARM_GOLDEN_FIELDS_OWNER_TITLE_ID,
  name: "황금 들판의 주인",
  description: "끝없이 이어진 황금빛 들판을 가꾼 대농장주.",
  condition: "농장주의 교환소에서 농장 증표 5,000개로 구매",
  category: "collection",
},
```

- [ ] **Step 4: Implement the catalog and view types**

```ts
export type FarmEndgameShopReward =
  | { kind: "farmItem"; itemId: "compound_feed"; quantity: 5 }
  | { kind: "finishedItem"; itemId: "organic_fertilizer"; quantity: 3 }
  | { kind: "title"; titleId: string };

export type FarmEndgameShopItem = {
  id: string;
  title: string;
  note: string;
  rewardText: string;
  imageSrc?: string;
  costReputation: number;
  reward: FarmEndgameShopReward;
};

export type FarmEndgameShopView = {
  unlocked: boolean;
  plots: number;
  requiredPlots: 6;
  pens: number;
  requiredPens: 4;
  items: FarmEndgameShopItem[];
  ownedTitleIds: string[];
};

export type FarmEndgameShopPurchaseResult = {
  itemId: string;
  title: string;
  rewardText: string;
  costReputation: number;
};

export const FARM_ENDGAME_SHOP_ITEMS: readonly FarmEndgameShopItem[] = [
  { id: "ranch-feed-bundle", title: "목장 사료 꾸러미", note: "목장 운영에 필요한 배합 사료를 보충합니다.", rewardText: "배합 사료 5개", imageSrc: "/images/items/farm/compound_feed.webp", costReputation: 20, reward: { kind: "farmItem", itemId: "compound_feed", quantity: 5 } },
  { id: "fertilizer-bundle", title: "영농 거름 꾸러미", note: "재배 시간을 줄이는 유기질 거름을 보충합니다.", rewardText: "유기질 거름 3개", imageSrc: "/images/items/life-aids/organic_fertilizer.webp", costReputation: 24, reward: { kind: "finishedItem", itemId: "organic_fertilizer", quantity: 3 } },
  { id: "title-bountiful-hand", title: "풍요의 손", note: TITLES[FARM_BOUNTIFUL_HAND_TITLE_ID].description, rewardText: "칭호 ‘풍요의 손’", costReputation: 1_000, reward: { kind: "title", titleId: FARM_BOUNTIFUL_HAND_TITLE_ID } },
  { id: "title-golden-fields-owner", title: "황금 들판의 주인", note: TITLES[FARM_GOLDEN_FIELDS_OWNER_TITLE_ID].description, rewardText: "칭호 ‘황금 들판의 주인’", costReputation: 5_000, reward: { kind: "title", titleId: FARM_GOLDEN_FIELDS_OWNER_TITLE_ID } },
];
```

`farmEndgameShopProgress` counts only `RANCH_PEN_DEFINITIONS` with `costReputation > 0`. `farmEndgameShopView` returns a copied item array and filters owned IDs to the two shop titles.

- [ ] **Step 5: Run tests and verify GREEN**

Run: `npm test -- src/adventure/v2/farmEndgameShop.test.ts src/adventure/data/titles.hidden.test.ts`

Expected: PASS.

- [ ] **Step 6: Commit Task 1**

```bash
git add src/adventure/v2/farmEndgameShop.ts src/adventure/v2/farmEndgameShop.test.ts src/adventure/data/titles.ts
git commit -m "feat: define farm endgame token shop"
```

---

### Task 2: Atomic purchase Route Handler

**Files:**
- Create: `src/app/api/v2/farm/endgame-shop/route.ts`
- Create: `src/lib/server/farmEndgameShopRoute.test.ts`

**Interfaces:**
- Consumes: Task 1 catalog/view APIs, `farmAvailableReputation`, `grantTitleIfMissingInTx`, KV save helpers.
- Produces: `POST /api/v2/farm/endgame-shop` with standard farm payload plus `endgameShop`, `endgameShopResult`, `fertilizerBalance`.

- [ ] **Step 1: Read installed Next.js docs**

Run: `sed -n '1,240p' node_modules/next/dist/docs/01-app/01-getting-started/15-route-handlers.md && sed -n '1,720p' node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/route.md`

Expected: both guides read through EOF; implementation uses native `Request` and `Response.json`.

- [ ] **Step 2: Write failing route tests**

Reuse the in-memory `lockSaveForUpdate`/`upsertSave` pattern from `src/lib/server/ranchRoutes.test.ts`. Mock `grantTitleIfMissingInTx` so it writes `adventure-log.v2` once and returns `false` on duplicates.

Copy the Task 1 `completedFarm()` fixture into this test file and add the request helper:

```ts
function buy(itemId: string) {
  return POST(new Request("http://test.local/api/v2/farm/endgame-shop", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ itemId }),
  }));
}
```

```ts
it("사료와 거름을 각각 지급하고 정확한 증표를 사용한다", async () => {
  store.set(FARM_SAVE_KEY, completedFarm(100));
  expect((await buy("ranch-feed-bundle")).status).toBe(200);
  expect((store.get(FARM_SAVE_KEY) as FarmState).inventory.compound_feed).toBe(5);
  expect((store.get(FARM_SAVE_KEY) as FarmState).stats.reputationSpent).toBe(20);

  store.set(FARM_SAVE_KEY, completedFarm(100));
  store.set(LIFE_WORKSHOP_SAVE_KEY, emptyLifeWorkshopState());
  expect((await buy("fertilizer-bundle")).status).toBe(200);
  expect((store.get(LIFE_WORKSHOP_SAVE_KEY) as LifeWorkshopState).crafting.balances.organic_fertilizer).toBe(3);
  expect((store.get(FARM_SAVE_KEY) as FarmState).stats.reputationSpent).toBe(24);
});

it("칭호를 한 번만 지급하고 중복 요청에서는 증표를 보존한다", async () => {
  store.set(FARM_SAVE_KEY, completedFarm(2_000));
  expect((await buy("title-bountiful-hand")).status).toBe(200);
  const spent = (store.get(FARM_SAVE_KEY) as FarmState).stats.reputationSpent;
  const duplicate = await buy("title-bountiful-hand");
  expect(duplicate.status).toBe(409);
  expect(await duplicate.json()).toMatchObject({ error: "already_owned" });
  expect((store.get(FARM_SAVE_KEY) as FarmState).stats.reputationSpent).toBe(spent);
});
```

Add a table test asserting no save change for:

```ts
[
  { farm: emptyFarmState(NOW), itemId: "ranch-feed-bundle", status: 409, error: "endgame_shop_locked" },
  { farm: completedFarm(19), itemId: "ranch-feed-bundle", status: 409, error: "not_enough_reputation" },
  { farm: completedFarm(10_000), itemId: "missing", status: 400, error: "shop_item_not_found" },
]
```

- [ ] **Step 3: Run tests and verify RED**

Run: `npm test -- src/lib/server/farmEndgameShopRoute.test.ts`

Expected: FAIL because the route does not exist.

- [ ] **Step 4: Implement validation and transaction ordering**

Authenticate with `ensureUser`, apply `enforceFarmingRateLimit`, parse `{ itemId }`, and resolve the catalog entry before the transaction. Inside the transaction:

```ts
const farm = normalizeFarmForDay(
  parseFarmState(await lockSaveForUpdate(tx, userId, FARM_SAVE_KEY, emptyFarmState(now)), now),
  now,
);
if (!farmEndgameShopProgress(farm).unlocked) return { error: "endgame_shop_locked" as const };
if (farmAvailableReputation(farm) < item.costReputation) return { error: "not_enough_reputation" as const };

let nextFarm = farm;
if (item.reward.kind === "farmItem") {
  nextFarm = {
    ...nextFarm,
    inventory: {
      ...nextFarm.inventory,
      compound_feed: (nextFarm.inventory.compound_feed ?? 0) + item.reward.quantity,
    },
  };
} else if (item.reward.kind === "finishedItem") {
  const workshop = parseLifeWorkshopState(
    await lockSaveForUpdate(tx, userId, LIFE_WORKSHOP_SAVE_KEY, emptyLifeWorkshopState()),
  );
  const nextWorkshop = {
    ...workshop,
    crafting: {
      ...workshop.crafting,
      balances: {
        ...workshop.crafting.balances,
        organic_fertilizer: (workshop.crafting.balances.organic_fertilizer ?? 0) + item.reward.quantity,
      },
    },
  };
  await upsertSave(tx, userId, LIFE_WORKSHOP_SAVE_KEY, nextWorkshop);
} else if (!(await grantTitleIfMissingInTx(tx, userId, item.reward.titleId, now))) {
  return { error: "already_owned" as const };
}

nextFarm = {
  ...nextFarm,
  stats: { ...nextFarm.stats, reputationSpent: nextFarm.stats.reputationSpent + item.costReputation },
};
await upsertSave(tx, userId, FARM_SAVE_KEY, nextFarm);
```

After reward writes, read the current workshop and `adventure-log.v2` inside the same transaction. Return the updated farm, `fertilizerBalance`, `farmEndgameShopView(nextFarm, ownedTitleIdsOf(log))`, and this authoritative result:

```ts
const endgameShopResult: FarmEndgameShopPurchaseResult = {
  itemId: item.id,
  title: item.title,
  rewardText: item.rewardText,
  costReputation: item.costReputation,
};
```

Include `FARM_CROP_LIST`, all delivery lists, `getFarmShopItems()`, and `now` in successful JSON so `useFarm.apply` needs no second fetch. Unknown/malformed requests use 400; locked, insufficient, and duplicate outcomes use 409.

- [ ] **Step 5: Run focused regression tests**

Run: `npm test -- src/lib/server/farmEndgameShopRoute.test.ts src/lib/server/ranchRoutes.test.ts src/adventure/v2/farm.test.ts`

Expected: PASS.

- [ ] **Step 6: Commit Task 2**

```bash
git add src/app/api/v2/farm/endgame-shop/route.ts src/lib/server/farmEndgameShopRoute.test.ts
git commit -m "feat: add atomic farm endgame purchases"
```

---

### Task 3: Initial query and `useFarm` integration

**Files:**
- Modify: `src/app/api/v2/farm/route.ts`
- Modify: `src/lib/server/farmEndgameShopRoute.test.ts`
- Modify: `src/adventure/v2/useFarm.ts`

**Interfaces:**
- Consumes: Task 1 view/result types and Task 2 response.
- Produces: `endgameShop`, `busyEndgameShopItemId`, `lastEndgameShopResult`, `buyEndgameShopItem`, `FarmNotice` kind `endgameShop`.

- [ ] **Step 1: Add a failing GET response test**

```ts
it("농장 조회가 후반 교환소 진행도와 보유 칭호를 반환한다", async () => {
  store.set(FARM_SAVE_KEY, completedFarm(10_000));
  store.set("adventure-log.v2", { titles: { farm_bountiful_hand: { obtainedAt: NOW } } });
  const response = await GET();
  expect(await response.json()).toMatchObject({
    endgameShop: { unlocked: true, plots: 6, pens: 4, ownedTitleIds: ["farm_bountiful_hand"] },
  });
});
```

- [ ] **Step 2: Run test and verify RED**

Run: `npm test -- src/lib/server/farmEndgameShopRoute.test.ts`

Expected: FAIL because GET has no `endgameShop`.

- [ ] **Step 3: Extend GET**

Read `adventure-log.v2` in the existing `Promise.all` and return:

```ts
endgameShop: farmEndgameShopView(farm, ownedTitleIdsOf(adventureLogRaw)),
```

Keep the authenticated GET request-time and uncached.

- [ ] **Step 4: Extend `useFarm` state and mutation**

Add optional `endgameShop` and `endgameShopResult` to `FarmResponse`; add the produced fields above to `FarmClientState`; add:

```ts
| { id: number; kind: "endgameShop"; result: FarmEndgameShopPurchaseResult }
```

In `apply`, preserve immediate unlock after the final old-style plot/ranch response:

```ts
setEndgameShop((current) =>
  data.endgameShop ?? (current ? farmEndgameShopView(data.farm!, current.ownedTitleIds) : null),
);
if (data.endgameShopResult) {
  setLastEndgameShopResult(data.endgameShopResult);
  setNotice({ id: Date.now(), kind: "endgameShop", result: data.endgameShopResult });
}
```

Add the purchase call:

```ts
const buyEndgameShopItem = useCallback(async (itemId: string) => {
  setBusyEndgameShopItemId(itemId);
  setError(null);
  try {
    const res = await fetch("/api/v2/farm/endgame-shop", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ itemId }),
    });
    apply((await res.json()) as FarmResponse);
  } catch (error) {
    reportError(error);
  } finally {
    setBusyEndgameShopItemId(null);
  }
}, [apply, reportError]);
```

Map `endgame_shop_locked`, `already_owned`, and `shop_item_not_found` to Korean messages. Keep the existing `not_enough_reputation` message.

- [ ] **Step 5: Verify route and types**

Run: `npm test -- src/lib/server/farmEndgameShopRoute.test.ts && npx tsc --noEmit`

Expected: PASS and TypeScript exits 0.

- [ ] **Step 6: Commit Task 3**

```bash
git add src/app/api/v2/farm/route.ts src/lib/server/farmEndgameShopRoute.test.ts src/adventure/v2/useFarm.ts
git commit -m "feat: expose farm endgame shop state"
```

---

### Task 4: Shared endgame shop UI

**Files:**
- Create: `src/adventure/v2/FarmEndgameShopPanel.tsx`
- Create: `src/adventure/v2/FarmEndgameShopPanel.test.tsx`
- Modify: `src/adventure/v2/AdventurerFarmPanel.tsx`
- Modify: `src/adventure/v2/AdventurerFarmPanel.test.tsx`

**Interfaces:**
- Consumes: `FarmEndgameShopView`, Task 3 client fields, surface constants.
- Produces: `FarmEndgameShopPanel` reused in the farm shop tab and `FarmExchangeShopPanel`.

- [ ] **Step 1: Write failing component tests**

```tsx
it("잠긴 교환소는 시설 진행도만 표시한다", () => {
  const html = renderToStaticMarkup(<FarmEndgameShopPanel
    view={{ unlocked: false, plots: 6, requiredPlots: 6, pens: 3, requiredPens: 4, items: [...FARM_ENDGAME_SHOP_ITEMS], ownedTitleIds: [] }}
    availableReputation={10_000} busyItemId={null} onBuy={vi.fn()} />);
  expect(html).toContain("농장주의 교환소");
  expect(html).toContain("밭 6/6");
  expect(html).toContain("축사 3/4");
  expect(html).not.toContain("목장 사료 꾸러미");
  expect(html).toContain("bg-white");
  expect(html).toContain("dark:bg-zinc-900");
});

it("해금 후 반복 상품과 보유·부족 상태를 표시한다", () => {
  const html = renderToStaticMarkup(<FarmEndgameShopPanel
    view={{ unlocked: true, plots: 6, requiredPlots: 6, pens: 4, requiredPens: 4, items: [...FARM_ENDGAME_SHOP_ITEMS], ownedTitleIds: ["farm_bountiful_hand"] }}
    availableReputation={100} busyItemId={null} onBuy={vi.fn()} />);
  expect(html).toContain("목장 사료 꾸러미");
  expect(html).toContain("영농 거름 꾸러미");
  expect(html).toContain("보유 중");
  expect(html).toContain("증표 부족");
});

it("칭호는 이름과 가격을 확인한 뒤 구매한다", () => {
  const unlockedView: FarmEndgameShopView = {
    unlocked: true,
    plots: 6,
    requiredPlots: 6,
    pens: 4,
    requiredPens: 4,
    items: [...FARM_ENDGAME_SHOP_ITEMS],
    ownedTitleIds: [],
  };
  const onBuy = vi.fn();
  const confirm = vi.spyOn(window, "confirm").mockReturnValue(true);
  const screen = render(<FarmEndgameShopPanel view={unlockedView} availableReputation={10_000} busyItemId={null} onBuy={onBuy} />);
  fireEvent.click(screen.getByRole("button", { name: "풍요의 손 구매" }));
  expect(confirm).toHaveBeenCalledWith(expect.stringContaining("농장 증표 1,000개"));
  expect(onBuy).toHaveBeenCalledWith("title-bountiful-hand");
});
```

- [ ] **Step 2: Run tests and verify RED**

Run: `npm test -- src/adventure/v2/FarmEndgameShopPanel.test.tsx`

Expected: FAIL because the component does not exist.

- [ ] **Step 3: Implement the panel**

```ts
export function FarmEndgameShopPanel({ view, availableReputation, busyItemId, onBuy }: {
  view: FarmEndgameShopView;
  availableReputation: number;
  busyItemId: string | null;
  onBuy: (itemId: string) => void;
})
```

Use `${SURFACE_CARD} p-3` outside and `${SURFACE_INSET} p-3` for progress/product cards. Use `next/image` for existing product images and `Sparkle` for titles. Buttons compute:

```ts
const titleId = item.reward.kind === "title" ? item.reward.titleId : null;
const owned = titleId ? view.ownedTitleIds.includes(titleId) : false;
const affordable = availableReputation >= item.costReputation;
const busy = busyItemId === item.id;
const buttonText = busy ? "구매 중..." : owned ? "보유 중" : affordable ? "구매하기" : "증표 부족";
```

Only titles call `window.confirm` with `${item.title} 칭호를 구매할까요?\n농장 증표 ${item.costReputation.toLocaleString("ko-KR")}개가 사용됩니다.`. Button accessible name is `${item.title} 구매`.

- [ ] **Step 4: Integrate both entry points and toast**

After both existing `FarmShopPanel` render sites, add:

```tsx
{endgameShop ? <FarmEndgameShopPanel
  view={endgameShop}
  availableReputation={availableReputation}
  busyItemId={busyEndgameShopItemId}
  onBuy={(itemId) => void buyEndgameShopItem(itemId)}
/> : null}
```

Handle the notice in both toast paths:

```ts
`${result.title} 구매 완료. 농장 증표 ${result.costReputation.toLocaleString("ko-KR")}개를 사용해 ${result.rewardText}를 받았습니다.`
```

Update the `useFarm` mock with every new Task 3 field. Assert both `AdventurerFarmPanel` and `FarmExchangeShopPanel` contain `농장주의 교환소` while retaining `농장 증표 상점`.

- [ ] **Step 5: Run UI tests and verify GREEN**

Run: `npm test -- src/adventure/v2/FarmEndgameShopPanel.test.tsx src/adventure/v2/AdventurerFarmPanel.test.tsx`

Expected: PASS.

- [ ] **Step 6: Commit Task 4**

```bash
git add src/adventure/v2/FarmEndgameShopPanel.tsx src/adventure/v2/FarmEndgameShopPanel.test.tsx src/adventure/v2/AdventurerFarmPanel.tsx src/adventure/v2/AdventurerFarmPanel.test.tsx
git commit -m "feat: show farm endgame token exchange"
```

---

### Task 5: Manual and completion verification

**Files:**
- Modify: `src/app/manual/content/pastimes.tsx`
- Modify: `src/app/manual/current-content.test.tsx`

**Interfaces:**
- Consumes: approved unlock and product values.
- Produces: player-facing manual copy matching the catalog.

- [ ] **Step 1: Write failing manual test**

```tsx
it("농장 후반 교환소의 해금과 반복 상품을 안내한다", () => {
  const html = renderToStaticMarkup(<PastimesContent />);
  expect(html).toContain("농장주의 교환소");
  expect(html).toContain("밭 6칸과 모든 유료 축사");
  expect(html).toContain("배합 사료 5개");
  expect(html).toContain("유기질 거름 3개");
});
```

- [ ] **Step 2: Run test and verify RED**

Run: `npm test -- src/app/manual/current-content.test.tsx`

Expected: FAIL because the manual lacks the exchange.

- [ ] **Step 3: Add manual copy**

```tsx
<li>
  밭 6칸과 모든 유료 축사를 열면 <Em>농장주의 교환소</Em>가 열립니다. 이곳에서
  농장 증표 20개로 배합 사료 5개, 증표 24개로 유기질 거름 3개를 제한 없이
  교환하고 전용 칭호를 구매할 수 있습니다.
</li>
```

- [ ] **Step 4: Run focused regressions**

Run: `npm test -- src/adventure/v2/farmEndgameShop.test.ts src/lib/server/farmEndgameShopRoute.test.ts src/adventure/v2/FarmEndgameShopPanel.test.tsx src/adventure/v2/AdventurerFarmPanel.test.tsx src/adventure/v2/farm.test.ts src/lib/server/ranchRoutes.test.ts src/app/manual/current-content.test.tsx`

Expected: all listed files pass with zero failed tests.

- [ ] **Step 5: Run static, asset, and production verification**

Run:

```bash
npx eslint src/adventure/v2/farmEndgameShop.ts src/adventure/v2/farmEndgameShop.test.ts src/adventure/data/titles.ts src/app/api/v2/farm/endgame-shop/route.ts src/lib/server/farmEndgameShopRoute.test.ts src/app/api/v2/farm/route.ts src/adventure/v2/useFarm.ts src/adventure/v2/FarmEndgameShopPanel.tsx src/adventure/v2/FarmEndgameShopPanel.test.tsx src/adventure/v2/AdventurerFarmPanel.tsx src/adventure/v2/AdventurerFarmPanel.test.tsx src/app/manual/content/pastimes.tsx src/app/manual/current-content.test.tsx
npx tsc --noEmit
npm run check-images
npm run build
```

Expected: every command exits 0. Do not run deploy or maintenance commands.

- [ ] **Step 6: Review the diff against the design**

Run: `git diff --check && git status --short && git diff --stat`

Confirm exact prices and quantities, server-side `6/6` and `4/4` checks, failure-state immutability, shared UI reuse, opaque surface tokens, and exclusion of unrelated dirty files.

- [ ] **Step 7: Commit manual changes**

```bash
git add src/app/manual/content/pastimes.tsx src/app/manual/current-content.test.tsx
git commit -m "docs: explain farm endgame token exchange"
```

- [ ] **Step 8: Run fresh completion verification**

Run: `npm test -- src/adventure/v2/farmEndgameShop.test.ts src/lib/server/farmEndgameShopRoute.test.ts src/adventure/v2/FarmEndgameShopPanel.test.tsx src/adventure/v2/AdventurerFarmPanel.test.tsx src/app/manual/current-content.test.tsx && npx tsc --noEmit && git status --short`

Expected: tests and TypeScript pass. Status may show only pre-existing unrelated user changes; no plan-owned file remains modified or untracked.
