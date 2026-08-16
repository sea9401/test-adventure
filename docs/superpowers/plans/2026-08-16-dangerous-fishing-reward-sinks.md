# Dangerous Fishing Reward Sinks Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 위험 해역 어획물과 거대어 증표를 특수 미끼, 최상급 장비, 칭호, 영구 프로필 테두리로 원자적으로 교환할 수 있게 한다.

**Architecture:** 교환 가격과 자동 재료 선택은 클라이언트와 서버가 공유하는 순수 카탈로그 모듈에 둔다. 별도 Route Handler와 서버 서비스가 기존 KV 저장값을 잠가 차감·지급·24시간 멱등성을 한 트랜잭션에서 처리하고, 낚시 상점의 전용 훅과 컴포넌트가 조회·확인·교환 흐름을 담당한다.

**Tech Stack:** Next.js 16 App Router Route Handlers, React 19, TypeScript, Drizzle transaction/KV saves, Vitest, Tailwind CSS 4.

## Global Constraints

- 코드 작성 전 `node_modules/next/dist/docs/01-app/01-getting-started/15-route-handlers.md`와 `node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/route.md`를 읽고 현재 Next.js 16.2.11 규칙을 따른다.
- 새 화폐, NPC 골드 판매, 전투 능력치·SP 보상, 위험 해역 장비 강화 단계는 추가하지 않는다.
- 기존 코인 단독 장비 구매 가격과 경로, 기존 보유 장비·재료·증표를 변경하거나 소급 환불하지 않는다.
- 어획물과 증표의 거래소 등록·구매·취소·만료 반환을 유지한다.
- 관계형 DB 스키마와 Drizzle 마이그레이션을 추가하지 않는다.
- 장면 배경 위 최상위 래퍼와 카드는 `SURFACE_CARD`·`SURFACE_INSET`을 사용하고 컨테이너 전체 투명도를 사용하지 않는다.
- 새 이미지 자산을 추가하지 않는다. `심해의 지배자` 테두리는 코드/CSS 스타일로 구현한다.
- 배포와 점검 모드 변경은 하지 않는다.
- 현재 작업 트리의 PvP·농장 변경, `NUL`, `_workspace/`, 다른 설계·계획 파일은 수정하거나 커밋하지 않는다.

---

## File Map

- Create `src/adventure/v2/dangerousFishingExchange.ts`: 교환 항목, 비용, 출력, 등급별 자동 선택과 선택 검증.
- Create `src/adventure/v2/dangerousFishingExchange.test.ts`: 카탈로그와 혼합 납품 순수 함수 테스트.
- Modify `src/adventure/data/v2/dangerousFishing.ts`: 어획물·증표 설명을 실제 사용처와 맞춘다.
- Modify `src/adventure/data/titles.ts`: 위험 해역 전용 칭호 두 종.
- Modify `src/adventure/data/v2/museunCashItems.ts`: 상점·상자 비노출 영구 테두리 아이템 정의.
- Modify `src/adventure/data/v2/museunCosmetics.ts`: `permanentOwned` 파싱·해금·활성 판정과 새 테두리 스타일.
- Modify `src/adventure/data/v2/museunCosmetics.test.ts`: 영구 보유와 기존 기간제 회귀 테스트.
- Modify `src/app/globals.css`: `abyssal_master` 프로필 테두리의 코드 기반 스타일.
- Create `src/lib/server/dangerousFishingExchange.ts`: 조회 모델, 트랜잭션 교환, 요청 ID 보관.
- Create `src/app/api/v2/dangerous-fishing/exchange/route.ts`: GET/POST 인증·속도 제한·입력 검증.
- Create `src/lib/server/dangerousFishingExchangeRoute.test.ts`: 실제 Route Handler 저장·동시성·멱등성 테스트.
- Create `src/adventure/v2/useDangerousFishingExchange.ts`: 교환 조회·mutation 상태와 사용자 메시지.
- Create `src/adventure/v2/DangerousFishingExchangeSection.tsx`: 어획물·장비·수집·반복 교환 UI와 확인창.
- Create `src/adventure/v2/DangerousFishingExchangeSection.test.tsx`: 표시·표면·확인·버튼 상태 테스트.
- Modify `src/adventure/v2/DangerousFishingShopSection.tsx`: 교환 섹션을 전용 상점 하단에 합성.
- Modify `src/adventure/v2/DangerousFishingShopSection.test.tsx`: 낚시 상점 통합 회귀.
- Modify `src/adventure/v2/useDangerousFishingShop.ts`: 상점 구매 후 교환 잔액과 코인 동기화 연결.
- Modify `src/adventure/v2/FishingShopPanel.tsx`: 교환 훅을 상점 화면에 주입.
- Modify `src/adventure/v2/DangerousFishingCargoPanel.tsx`: 안전 귀환 뒤 사용처 안내.
- Modify `src/adventure/v2/DangerousFishingBossPanel.tsx`: 증표 대표 사용처 안내.
- Modify `src/adventure/v2/DangerousFishingView.test.tsx`: 귀환·거대어 안내 회귀.
- Modify `src/app/manual/content/pastimes.tsx`: 전체 교환표와 거래/NPC 판매 안내.
- Modify `src/app/manual/current-content.test.tsx`: 매뉴얼 렌더 회귀.

---

### Task 1: Exchange catalog and material/title definitions

**Files:**
- Create: `src/adventure/v2/dangerousFishingExchange.ts`
- Create: `src/adventure/v2/dangerousFishingExchange.test.ts`
- Modify: `src/adventure/data/v2/dangerousFishing.ts:536-566`
- Modify: `src/adventure/data/titles.ts:820-860`

**Interfaces:**
- Consumes: `DANGEROUS_FISH`, `DANGEROUS_BAITS`, `dangerousCatchMaterialId`, `dangerousBossMaterialId`, 위험 해역 장비 ID.
- Produces: `DANGEROUS_FISHING_EXCHANGE_ENTRIES`, `DANGEROUS_FISHING_EXCHANGE_ENTRY_BY_ID`, `eligibleCatchMaterialIds`, `selectCatchMaterials`, `validateCatchSelection`, `DangerousFishingExchangeEntry`.

- [ ] **Step 1: Write failing catalog and selection tests**

```ts
it("위험 어획물 등급마다 승인된 미끼 교환을 정의한다", () => {
  expect(DANGEROUS_FISHING_EXCHANGE_ENTRY_BY_ID.get("catch_common_to_reef_bait"))
    .toMatchObject({ cost: { catchRarity: "common", count: 4 }, output: { baitId: "reef_bait", count: 5 } });
  expect(DANGEROUS_FISHING_EXCHANGE_ENTRY_BY_ID.get("catch_legendary_to_abyss_bait"))
    .toMatchObject({ cost: { catchRarity: "legendary", count: 2 }, output: { baitId: "abyss_bait", count: 5 } });
});

it("혼합 납품은 보유량, 가치, 카탈로그 순으로 선택한다", () => {
  expect(selectCatchMaterials("rare", {
    danger_catch_ironjaw_tuna: 2,
    danger_catch_thunder_ray: 5,
    danger_catch_lantern_eel: 5,
  }, 4)).toEqual({ danger_catch_thunder_ray: 4 });
});

it("다른 등급과 합계가 다른 선택을 거부한다", () => {
  expect(validateCatchSelection("rare", 4, { danger_catch_razor_sardine: 4 })).toBe(false);
  expect(validateCatchSelection("rare", 4, { danger_catch_ironjaw_tuna: 3 })).toBe(false);
});
```

- [ ] **Step 2: Run the catalog test and verify RED**

Run: `npm test -- src/adventure/v2/dangerousFishingExchange.test.ts`

Expected: FAIL because `dangerousFishingExchange.ts` and its exports do not exist.

- [ ] **Step 3: Implement the typed exchange catalog and deterministic selection**

```ts
export const DANGEROUS_FISHING_EXCHANGE_ENTRIES = [
  catchExchange("catch_common_to_reef_bait", "common", 4, "reef_bait", 5),
  catchExchange("catch_rare_to_blood_bait", "rare", 4, "blood_bait", 5),
  catchExchange("catch_epic_to_luminous_bait", "epic", 3, "luminous_bait", 5),
  catchExchange("catch_legendary_to_abyss_bait", "legendary", 2, "abyss_bait", 5),
  gearExchange("token_maelstrom_reel", { danger_boss_tidal_colossus: 8 }, 20_000, "reel", "maelstrom_reel"),
  gearExchange("token_abyss_chain_line", { danger_boss_abyss_kraken: 8 }, 35_000, "line", "abyss_chain_line"),
  gearExchange("token_leviathan_rod", { danger_boss_tidal_colossus: 8, danger_boss_abyss_kraken: 4 }, 40_000, "rod", "leviathan_rod"),
  titleExchange("token_tidal_title", { danger_boss_tidal_colossus: 10 }, "dangerous_tidal_conqueror"),
  titleExchange("token_abyss_title", { danger_boss_abyss_kraken: 10 }, "dangerous_abyss_conqueror"),
  cosmeticExchange("token_abyssal_border", { danger_boss_tidal_colossus: 15, danger_boss_abyss_kraken: 15 }, "dangerous_abyssal_profile_border"),
  baitExchange("token_tidal_to_luminous_bait", { danger_boss_tidal_colossus: 1 }, "luminous_bait", 5),
  baitExchange("token_abyss_to_abyss_bait", { danger_boss_abyss_kraken: 1 }, "abyss_bait", 5),
] as const;
```

Implement `selectCatchMaterials` with descending owned quantity, ascending `cargoValue`, then `Object.values(DANGEROUS_FISH)` order. Ignore zero, negative, non-integer, unknown, or wrong-rarity quantities. Implement `validateCatchSelection` by checking every material and the exact positive-integer total.

- [ ] **Step 4: Add titles and update material copy**

Add `dangerous_tidal_conqueror` and `dangerous_abyss_conqueror` with category `fishing` and conditions matching the 10-token exchanges. Change catch descriptions to mention `위험 해역 교환 또는 거래소`, and boss-token descriptions to mention `최상급 전용 장비와 한정 꾸미기 교환 또는 거래소`.

- [ ] **Step 5: Run focused tests and verify GREEN**

Run: `npm test -- src/adventure/v2/dangerousFishingExchange.test.ts src/adventure/data/v2/dangerousFishing.test.ts`

Expected: PASS.

- [ ] **Step 6: Commit Task 1**

```bash
git add src/adventure/v2/dangerousFishingExchange.ts src/adventure/v2/dangerousFishingExchange.test.ts src/adventure/data/v2/dangerousFishing.ts src/adventure/data/titles.ts
git commit -m "feat: define dangerous fishing exchanges"
```

---

### Task 2: Permanent dangerous-fishing cosmetic entitlement

**Files:**
- Modify: `src/adventure/data/v2/museunCashItems.ts`
- Modify: `src/adventure/data/v2/museunCosmetics.ts`
- Modify: `src/adventure/data/v2/museunCosmetics.test.ts`
- Modify: `src/app/globals.css`

**Interfaces:**
- Consumes: `MuseunCosmeticsState`, profile border catalog and appearance renderer.
- Produces: `DANGEROUS_ABYSSAL_PROFILE_BORDER_ITEM_ID`, `unlockPermanentMuseunCosmetic`, permanent-aware `museunCosmeticAccessActive` and equipment behavior.

- [ ] **Step 1: Write failing permanent-entitlement tests**

```ts
it("영구 꾸미기는 만료 시각 없이 활성 상태를 유지한다", () => {
  const granted = unlockPermanentMuseunCosmetic({}, "dangerous_abyssal_profile_border");
  expect(granted.state.permanentOwned).toEqual(["dangerous_abyssal_profile_border"]);
  expect(museunCosmeticAccessActive(granted.state, "dangerous_abyssal_profile_border", Number.MAX_SAFE_INTEGER)).toBe(true);
});

it("기존 기간제 꾸미기의 30일 만료는 유지한다", () => {
  const granted = unlockMuseunCosmetic({}, "oceanic_profile_border", 1_000);
  expect(museunCosmeticAccessActive(granted.state, "oceanic_profile_border", 1_000 + MUSEUN_COSMETIC_ACCESS_MS + 1)).toBe(false);
});
```

- [ ] **Step 2: Run the cosmetics test and verify RED**

Run: `npm test -- src/adventure/data/v2/museunCosmetics.test.ts`

Expected: FAIL because the new item and permanent ownership API do not exist.

- [ ] **Step 3: Add the non-store cosmetic definition and backward-compatible parser**

Add a `dangerous_abyssal_profile_border` entitlement item with effect `{ kind: "cosmetic", slot: "profile_border", style: "abyssal_master" }`. Keep it out of purchase group arrays and cosmetic box pools.

Extend state and parser:

```ts
export type MuseunCosmeticsState = {
  owned: MuseunCosmeticItemId[];
  permanentOwned: MuseunCosmeticItemId[];
  // existing fields unchanged
};

export function unlockPermanentMuseunCosmetic(value: unknown, itemId: MuseunCosmeticItemId) {
  const state = parseMuseunCosmetics(value);
  if (state.permanentOwned.includes(itemId)) return { state, alreadyOwned: true };
  return {
    alreadyOwned: false,
    state: {
      ...state,
      owned: state.owned.includes(itemId) ? state.owned : [...state.owned, itemId],
      permanentOwned: [...state.permanentOwned, itemId],
    },
  };
}
```

Make `museunCosmeticAccessActive` return true for `permanentOwned`, make the equip helpers accept it, and make extension reject permanent items. Do not auto-equip on grant.

- [ ] **Step 4: Add the `abyssal_master` profile renderer style**

Register the profile variant as `rarity: "legendary"`, `motion: "animated"`, `interior: "animated"`, feature `심해 파문과 거대어의 잔광`. Add CSS using opaque/gradient layers, pseudo-elements, and existing keyframes only; do not reference a new raster or SVG.

- [ ] **Step 5: Run cosmetic and profile rendering regressions**

Run: `npm test -- src/adventure/data/v2/museunCosmetics.test.ts src/adventure/v2/V2CosmeticsView.test.tsx src/adventure/v2/V2CharacterCard.test.tsx src/lib/server/profileShowcaseRoute.test.ts`

Expected: PASS, including the existing 30-day access tests.

- [ ] **Step 6: Commit Task 2**

```bash
git add src/adventure/data/v2/museunCashItems.ts src/adventure/data/v2/museunCosmetics.ts src/adventure/data/v2/museunCosmetics.test.ts src/app/globals.css
git commit -m "feat: add permanent dangerous fishing cosmetic"
```

---

### Task 3: Atomic exchange service and Route Handler

**Files:**
- Create: `src/lib/server/dangerousFishingExchange.ts`
- Create: `src/app/api/v2/dangerous-fishing/exchange/route.ts`
- Create: `src/lib/server/dangerousFishingExchangeRoute.test.ts`

**Interfaces:**
- Consumes: Task 1 catalog/selectors, Task 2 permanent unlock, `FISHING_PROGRESS_KEY`, `FISHING_WALLET_KEY`, `DANGEROUS_FISHING_SAVE_KEY`, `grantTitleIfMissingInTx`.
- Produces: `readDangerousFishingExchangeView`, `exchangeDangerousFishingInTx`, GET response `{ ok, unlocked, materials, fishingCoins, state, ownedTitleIds, ownedCosmeticIds, entries }`, POST success response with refreshed view.

- [ ] **Step 1: Write failing Route Handler tests**

Use the existing in-memory `savesKv` mock pattern from `dangerousFishingRoute.test.ts`. Cover:

```ts
it("혼합 희귀 어획물 4개를 핏빛 미끼 5개로 원자 교환한다", async () => {
  seed({ materials: { danger_catch_ironjaw_tuna: 2, danger_catch_thunder_ray: 2 } });
  const response = await POST(exchangeRequest({
    operationId: crypto.randomUUID(),
    entryId: "catch_rare_to_blood_bait",
    batches: 1,
    selectedMaterials: { danger_catch_ironjaw_tuna: 2, danger_catch_thunder_ray: 2 },
  }));
  expect(response.status).toBe(200);
  expect(savedCharacter().materials).not.toHaveProperty("danger_catch_ironjaw_tuna");
  expect(savedDangerous().baitCounts.blood_bait).toBe(5);
});

it("같은 operationId 재전송은 한 번만 차감하고 지급한다", async () => {
  const operationId = crypto.randomUUID();
  await POST(exchangeRequest({ operationId, entryId: "token_tidal_to_luminous_bait", batches: 1 }));
  const replay = await POST(exchangeRequest({ operationId, entryId: "token_tidal_to_luminous_bait", batches: 1 }));
  expect(await replay.json()).toMatchObject({ ok: true, alreadyProcessed: true });
  expect(savedDangerous().baitCounts.luminous_bait).toBe(5);
});
```

Also test 401, rate-limit passthrough, level 14, invalid UUID, batches 0/101, wrong-rarity selection, insufficient materials, insufficient coins, existing gear/title/cosmetic, gear reward, title reward, permanent cosmetic reward, and two concurrent same-ID calls.

- [ ] **Step 2: Run the Route Handler test and verify RED**

Run: `npm test -- src/lib/server/dangerousFishingExchangeRoute.test.ts`

Expected: FAIL because the route and service do not exist.

- [ ] **Step 3: Implement view parsing and 24-hour idempotency state**

```ts
export const DANGEROUS_FISHING_EXCHANGE_STATE_KEY = "dangerous-fishing-exchange.v1";
const IDEMPOTENCY_WINDOW_MS = 24 * 60 * 60 * 1_000;
const MAX_OPERATION_IDS = 128;

type ExchangeState = {
  version: 1;
  operations: Array<{ id: string; completedAt: number }>;
};
```

Parse invalid saves defensively, prune entries older than 24 hours, deduplicate by ID, sort newest first, and cap at 128. Build the GET view only from catalog-backed material IDs and existing ownership states.

- [ ] **Step 4: Implement transactional validation, spending, and rewards**

Lock `character.v2`, `fishing-wallet.v1`, `dangerous-fishing.v1`, `adventure-log.v2` when needed, and the exchange state in a consistent order. Validate level, entry, batches, selection, balances, and ownership before any upsert.

Apply outputs as follows:

```ts
switch (entry.output.kind) {
  case "bait": nextDangerous.baitCounts[entry.output.baitId] += entry.output.count * batches; break;
  case "gear": nextDangerous.ownedGear[entry.output.gearKind].push(entry.output.gearId); break;
  case "title": await grantTitleIfMissingInTx(tx, userId, entry.output.titleId, now); break;
  case "cosmetic": nextCharacter.museunCosmetics = unlockPermanentMuseunCosmetic(nextCharacter.museunCosmetics, entry.output.itemId).state; break;
}
```

For one-time outputs require `batches === 1`. Record `operationId` only after all validation passes. Return status 403 for `fishing_level_locked`, 400 for invalid entry/quantity/selection, 402 for insufficient balances, and 409 for `already_owned`.

- [ ] **Step 5: Implement the Next.js Route Handler**

Read the required Next.js docs first. Implement GET/POST named exports, `ensureUser`, `enforceUserAndIpRateLimit` with action `v2:dangerous-fishing:exchange`, safe JSON parsing, UUID validation, and `Response.json` status propagation.

- [ ] **Step 6: Run service, route, shop, and marketplace regressions**

Run: `npm test -- src/lib/server/dangerousFishingExchangeRoute.test.ts src/lib/server/dangerousFishingRoute.test.ts src/lib/server/marketplaceV2.test.ts src/lib/server/marketplaceListRoute.test.ts src/lib/server/marketplaceV2Fulfillment.test.ts src/lib/server/marketplaceBuyOrdersV2.test.ts`

Expected: PASS.

- [ ] **Step 7: Commit Task 3**

```bash
git add src/lib/server/dangerousFishingExchange.ts src/app/api/v2/dangerous-fishing/exchange/route.ts src/lib/server/dangerousFishingExchangeRoute.test.ts
git commit -m "feat: exchange dangerous fishing rewards"
```

---

### Task 4: Fishing-shop exchange UI

**Files:**
- Create: `src/adventure/v2/useDangerousFishingExchange.ts`
- Create: `src/adventure/v2/DangerousFishingExchangeSection.tsx`
- Create: `src/adventure/v2/DangerousFishingExchangeSection.test.tsx`
- Modify: `src/adventure/v2/DangerousFishingShopSection.tsx`
- Modify: `src/adventure/v2/DangerousFishingShopSection.test.tsx`
- Modify: `src/adventure/v2/useDangerousFishingShop.ts`
- Modify: `src/adventure/v2/FishingShopPanel.tsx`

**Interfaces:**
- Consumes: Task 1 selectors/catalog types and Task 3 GET/POST response.
- Produces: `useDangerousFishingExchange`, `DangerousFishingExchangeSection`, and refreshed balances/state after every mutation.

- [ ] **Step 1: Write failing component and message tests**

```tsx
it("등급별 어획물, 장비 할인, 수집, 반복 교환을 불투명 카드로 표시한다", () => {
  const html = renderToStaticMarkup(<DangerousFishingExchangeSection model={model} busy={null} onExchange={vi.fn()} />);
  expect(html).toContain("위험 해역 교환");
  expect(html).toContain("일반 어획물 4개");
  expect(html).toContain("증표 할인 교환");
  expect(html).toContain("심해의 지배자");
  expect(html).not.toMatch(/bg-[^\" ]+\/(40|70)/);
});

it("최대 교환 확인에는 어종별 소모량과 교환 후 잔량을 표시한다", () => {
  const html = renderToStaticMarkup(<DangerousFishingExchangeConfirmDialog pending={pending} onCancel={vi.fn()} onConfirm={vi.fn()} />);
  expect(html).toContain("철턱 참치 2개");
  expect(html).toContain("교환 후 0개");
});
```

Test locked level, insufficient balances, owned one-time rewards, one exchange, max exchange, busy state, and Korean messages for every server error code.

- [ ] **Step 2: Run UI tests and verify RED**

Run: `npm test -- src/adventure/v2/DangerousFishingExchangeSection.test.tsx src/adventure/v2/DangerousFishingShopSection.test.tsx`

Expected: FAIL because the new hook and section do not exist.

- [ ] **Step 3: Implement exchange hook and response synchronization**

The hook fetches GET on mount and exposes:

```ts
type ExchangeMutation = {
  entryId: DangerousFishingExchangeEntryId;
  batches: number;
  selectedMaterials?: Record<string, number>;
};

return { model, loading, error, exchanging, refresh, exchange };
```

Create one `crypto.randomUUID()` per confirmed action, reuse it for a retry of that action, and clear it after a definitive response. On success replace the exchange model with the server response. Return `fishingCoins`, dangerous fishing state, and a user-facing message so `FishingShopPanel` can synchronize the existing coin and gear/m끼 views.

- [ ] **Step 4: Implement exchange cards and confirmation dialog**

Use `SURFACE_CARD`, `SURFACE_INSET`, existing `Button`, `CoinAmount`, and the established confirmation-dialog structure from `SurplusExchangePanel`. For catch entries compute 1회 and 최대 selections with Task 1 helpers. Display material names from `DANGEROUS_FISHING_MATERIALS`. Disable one-time cards when owned and all cards while any purchase/exchange is active.

- [ ] **Step 5: Compose the section into the dangerous shop**

Extend `DangerousFishingShopSection` props with the exchange model/action and render the section after `특수 미끼`. Wire `FishingShopPanel` to both hooks. After an existing dangerous-gear/bait coin purchase, refresh the exchange view; after an exchange, update the dangerous model and regular fishing coin state without a full page reload.

- [ ] **Step 6: Run shop UI regressions**

Run: `npm test -- src/adventure/v2/DangerousFishingExchangeSection.test.tsx src/adventure/v2/DangerousFishingShopSection.test.tsx 'src/app/(game)/town/fishing/shop/page.test.tsx'`

Expected: PASS.

- [ ] **Step 7: Commit Task 4**

```bash
git add src/adventure/v2/useDangerousFishingExchange.ts src/adventure/v2/DangerousFishingExchangeSection.tsx src/adventure/v2/DangerousFishingExchangeSection.test.tsx src/adventure/v2/DangerousFishingShopSection.tsx src/adventure/v2/DangerousFishingShopSection.test.tsx src/adventure/v2/useDangerousFishingShop.ts src/adventure/v2/FishingShopPanel.tsx
git commit -m "feat: add dangerous fishing exchange UI"
```

---

### Task 5: Discoverability copy, manual, and full verification

**Files:**
- Modify: `src/adventure/v2/DangerousFishingCargoPanel.tsx`
- Modify: `src/adventure/v2/DangerousFishingBossPanel.tsx`
- Modify: `src/adventure/v2/DangerousFishingView.test.tsx`
- Modify: `src/app/manual/content/pastimes.tsx`
- Modify: `src/app/manual/current-content.test.tsx`

**Interfaces:**
- Consumes: Task 1 exchange costs and material descriptions.
- Produces: consistent in-game and manual guidance for every reward path.

- [ ] **Step 1: Write failing guidance tests**

Assert that the cargo panel contains `안전 귀환 후 낚시 상점에서 특수 미끼로 교환하거나 거래소에 등록할 수 있습니다`, the boss panel contains `증표는 최상급 장비와 한정 꾸미기 교환에 사용`, and the manual contains all four catch rates, three gear rates, two title rates, border rate, repeat exchanges, 거래 가능, and NPC 판매 불가.

- [ ] **Step 2: Run guidance tests and verify RED**

Run: `npm test -- src/adventure/v2/DangerousFishingView.test.tsx src/app/manual/current-content.test.tsx`

Expected: FAIL on the new guidance text.

- [ ] **Step 3: Implement guidance and manual tables**

Import exchange catalog constants rather than duplicating costs where practical. Add the approved copy to cargo and boss panels and render the exact exchange tables under the manual's 위험 해역 section.

- [ ] **Step 4: Run focused feature tests**

Run: `npm test -- src/adventure/v2/dangerousFishingExchange.test.ts src/adventure/data/v2/museunCosmetics.test.ts src/lib/server/dangerousFishingExchangeRoute.test.ts src/adventure/v2/DangerousFishingExchangeSection.test.tsx src/adventure/v2/DangerousFishingShopSection.test.tsx src/adventure/v2/DangerousFishingView.test.tsx src/app/manual/current-content.test.tsx src/lib/server/dangerousFishingRoute.test.ts src/lib/server/marketplaceV2.test.ts src/lib/server/marketplaceListRoute.test.ts src/lib/server/marketplaceV2Fulfillment.test.ts src/lib/server/marketplaceBuyOrdersV2.test.ts`

Expected: PASS.

- [ ] **Step 5: Run static and asset verification**

Run: `npx tsc --noEmit`

Run: `npx eslint src/adventure/v2/dangerousFishingExchange.ts src/adventure/v2/dangerousFishingExchange.test.ts src/adventure/data/v2/dangerousFishing.ts src/adventure/data/titles.ts src/adventure/data/v2/museunCashItems.ts src/adventure/data/v2/museunCosmetics.ts src/adventure/data/v2/museunCosmetics.test.ts src/lib/server/dangerousFishingExchange.ts src/app/api/v2/dangerous-fishing/exchange/route.ts src/lib/server/dangerousFishingExchangeRoute.test.ts src/adventure/v2/useDangerousFishingExchange.ts src/adventure/v2/DangerousFishingExchangeSection.tsx src/adventure/v2/DangerousFishingExchangeSection.test.tsx src/adventure/v2/DangerousFishingShopSection.tsx src/adventure/v2/DangerousFishingShopSection.test.tsx src/adventure/v2/useDangerousFishingShop.ts src/adventure/v2/FishingShopPanel.tsx src/adventure/v2/DangerousFishingCargoPanel.tsx src/adventure/v2/DangerousFishingBossPanel.tsx src/adventure/v2/DangerousFishingView.test.tsx src/app/manual/content/pastimes.tsx src/app/manual/current-content.test.tsx`

Run: `npm run check-images`

Expected: all commands exit 0. Existing unrelated dirty files are not staged.

- [ ] **Step 6: Commit Task 5**

```bash
git add src/adventure/v2/DangerousFishingCargoPanel.tsx src/adventure/v2/DangerousFishingBossPanel.tsx src/adventure/v2/DangerousFishingView.test.tsx src/app/manual/content/pastimes.tsx src/app/manual/current-content.test.tsx
git commit -m "docs: explain dangerous fishing exchanges"
```

- [ ] **Step 7: Verify commit scope**

Run: `git status --short`

Run: `git log -6 --oneline --decorate`

Expected: feature files are committed; pre-existing PvP·농장 changes and unrelated untracked files remain untouched and unstaged.
