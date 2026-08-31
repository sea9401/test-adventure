# 월간 모험 지원권 프리미엄 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 일반 지원권의 잔여 기간을 보존하면서 2,500코인 프리미엄 지원권의 30일 혜택, 사용 보상, 상태 표시를 기존 게임 흐름에 완전히 통합한다.

**Architecture:** `adventureSupport.ts`가 저장 상태 파싱, 현재 등급 판정, 기간 적립, 등급별 혜택의 단일 권위가 된다. 서버 소비자는 boolean 대신 `none | standard | premium` 등급을 사용하고, 상태 API가 동일한 등급과 두 만료 시각을 클라이언트에 전달한다. 상품 사용은 기존 `character.v2` 행 잠금 트랜잭션 안에서 아이템 차감·기간 적립·스태미나 지급·꾸미기 연장권 지급을 한 번에 저장한다.

**Tech Stack:** TypeScript, Next.js App Router route handlers, React, Vitest, Testing Library, Drizzle 트랜잭션

## Global Constraints

- 상품명은 `월간 모험 지원권 프리미엄 (30일)`, 가격은 2,500 무슨 코인, 기간은 30일이다.
- 프리미엄 혜택은 최대 스태미나 +3,000, 회복 속도 +20%, 일괄 사냥 최대 100회, 거래소 등록 +20칸, 판매세 5%다.
- 일반권과 프리미엄권 혜택은 합산하지 않으며 프리미엄이 우선 적용된다.
- 프리미엄권을 사용할 때마다 현재 스태미나를 3,000 지급하되 갱신된 최대 스태미나를 넘기지 않고, 거래 가능한 `cosmetic_extension_30d` 2개를 지급한다.
- 프리미엄 이용 중 일반권 기간은 소모되지 않고 프리미엄 종료 뒤 이어진다.
- 경험치·골드·드롭률·숙련도·전투 능력치·자동 사냥·오프라인 사냥 혜택은 추가하지 않는다.
- 기존 `{ activatedAt, activeUntil }` 저장 데이터와 모든 일반권 지급 경로를 계속 지원한다.
- 상태 아이콘은 코드 기반 아이콘으로 만들고, 상점 상품 그림은 기존 SVG 상품 자산 규칙을 따른다.
- 배포·원격 통합·운영 데이터 수정은 범위가 아니다.

---

### Task 1: 지원권 등급과 기간 상태 도메인

**Files:**
- Modify: `src/adventure/data/v2/adventureSupport.ts`
- Modify: `src/adventure/data/v2/adventureSupport.test.ts`

**Interfaces:**
- Produces: `AdventureSupportTier = "none" | "standard" | "premium"`
- Produces: `PREMIUM_ADVENTURE_SUPPORT_PASS`
- Produces: `adventureSupportTier(value: unknown, now?: number): AdventureSupportTier`
- Produces: `adventureSupportBenefits(tier: AdventureSupportTier): AdventureSupportBenefits`
- Produces: `grantPremiumAdventureSupport(value: unknown, requestedDays: unknown, now?: number): AdventureSupportGrant | null`
- Preserves: `grantAdventureSupport`, `adventureSupportActive`, legacy boolean hunt helper inputs

- [ ] **Step 1: 기간 적립과 등급 경계를 잠그는 실패 테스트 작성**

```ts
it("일반 10일 앞에 프리미엄 30일을 삽입한다", () => {
  const now = Date.UTC(2026, 7, 30);
  const standard = grantAdventureSupport(null, 10, now)?.state;
  const premium = grantPremiumAdventureSupport(standard, 30, now);
  expect(premium?.state).toEqual({
    activatedAt: now,
    premiumUntil: now + 30 * DAY_MS,
    activeUntil: now + 40 * DAY_MS,
  });
  expect(adventureSupportTier(premium?.state, now + 29 * DAY_MS)).toBe("premium");
  expect(adventureSupportTier(premium?.state, now + 30 * DAY_MS)).toBe("standard");
  expect(adventureSupportTier(premium?.state, now + 40 * DAY_MS)).toBe("none");
});

it("프리미엄 재사용은 두 만료를, 일반권 지급은 최종 만료만 연장한다", () => {
  const now = Date.UTC(2026, 7, 30);
  const first = grantPremiumAdventureSupport(null, 30, now)!.state;
  const second = grantPremiumAdventureSupport(first, 30, now + DAY_MS)!.state;
  expect(second.premiumUntil).toBe(now + 60 * DAY_MS);
  expect(second.activeUntil).toBe(now + 60 * DAY_MS);
  const queued = grantAdventureSupport(second, 7, now + 2 * DAY_MS)!.state;
  expect(queued.premiumUntil).toBe(now + 60 * DAY_MS);
  expect(queued.activeUntil).toBe(now + 67 * DAY_MS);
});
```

- [ ] **Step 2: 도메인 테스트가 새 export 부재로 실패하는지 확인**

Run: `npx vitest run src/adventure/data/v2/adventureSupport.test.ts`
Expected: FAIL because premium constants/functions do not exist.

- [ ] **Step 3: 선택 필드 파싱, 등급별 설정과 두 grant 함수를 구현**

`parseAdventureSupportState`는 유효한 `premiumUntil`만 보존하고 `activeUntil`을 넘으면 `activeUntil`로 클램프한다. `grantPremiumAdventureSupport`는 남은 일반 기간을 `max(0, activeUntil - max(now, premiumUntil ?? now))`로 구한 뒤 프리미엄 종료 뒤에 붙인다. 이미 프리미엄이면 `premiumUntil`과 `activeUntil`을 같은 일수만큼 연장한다. 모든 계산은 `ADVENTURE_SUPPORT_MAX_GRANT_DAYS` 상한을 적용한다.

```ts
export const PREMIUM_ADVENTURE_SUPPORT_PASS = {
  id: "monthly_adventure_support_premium",
  name: "월간 모험 지원권 프리미엄",
  durationDays: 30,
  coinPrice: 2_500,
  staminaMaxBonus: 3_000,
  staminaActivationGrant: 3_000,
  staminaRegenBonusPct: 20,
  marketplaceSlotBonus: 20,
  marketplaceTaxRate: 0.05,
  activeMaxHuntBatch: 100,
  cosmeticExtensionGrant: 2,
} as const;
```

- [ ] **Step 4: 레거시·만료·재적립·수치 테스트 통과 확인**

Run: `npx vitest run src/adventure/data/v2/adventureSupport.test.ts`
Expected: PASS, including legacy standard state and exact premium boundary cases.

- [ ] **Step 5: 도메인 변경 커밋**

```bash
git add src/adventure/data/v2/adventureSupport.ts src/adventure/data/v2/adventureSupport.test.ts
git commit -m "feat: add premium adventure support state"
```

### Task 2: 프리미엄 상품 카탈로그와 상점 표시

**Files:**
- Modify: `src/adventure/data/v2/museunCashItems.ts`
- Modify: `src/adventure/data/v2/museunCashItems.test.ts`
- Modify: `src/adventure/v2/MuseunCoinShopView.tsx`
- Modify: `src/adventure/v2/MuseunCoinShopView.test.ts`
- Create: `public/images/items/cash/adventure_support_premium_30d.svg`

**Interfaces:**
- Consumes: `PREMIUM_ADVENTURE_SUPPORT_PASS`
- Produces: inventory/tradeable item id `adventure_support_premium_30d`
- Produces: effect `{ kind: "adventure_support_premium"; days: 30 }`
- Produces: shop order `adventure_support_premium_30d`, then `adventure_support_30d`

- [ ] **Step 1: 카탈로그·거래 가능 여부·상점 정렬 실패 테스트 작성**

```ts
expect(MUSEUN_CASH_ITEMS.adventure_support_premium_30d).toMatchObject({
  coinPrice: 2_500,
  delivery: "inventory",
  tradeable: true,
  effect: { kind: "adventure_support_premium", days: 30 },
});
expect(SHOP_ITEM_GROUPS[0].itemIds.slice(0, 2)).toEqual([
  "adventure_support_premium_30d",
  "adventure_support_30d",
]);
```

- [ ] **Step 2: 두 테스트가 상품 부재로 실패하는지 확인**

Run: `npx vitest run src/adventure/data/v2/museunCashItems.test.ts src/adventure/v2/MuseunCoinShopView.test.ts`
Expected: FAIL because the premium item id and art mapping are absent.

- [ ] **Step 3: 상품과 금색 SVG 상품 자산을 추가**

상품 설명에 거래 가능, 프리미엄 기간 우선 적용, 일반권 잔여 기간 보존, 연장권 2개 지급을 명시한다. 새 SVG는 기존 `adventure_support_30d.svg`의 크기·접근성 없는 장식 자산 구조를 따르되 금색 테두리와 `P` 표식을 사용한다.

- [ ] **Step 4: 프리미엄 상세 혜택과 일반권 상세를 분리**

`SUPPORT_BENEFITS`를 `supportBenefitsForItem(itemId)`로 바꿔 등급별 상수를 사용한다. 프리미엄 상세에는 +3,000, +20%, 100회, +20칸, 5%, 꾸미기 연장권 2개를 표시하고 일반권 상세 수치는 바꾸지 않는다.

- [ ] **Step 5: 카탈로그·상점 테스트 통과와 이미지 참조 확인**

Run: `npx vitest run src/adventure/data/v2/museunCashItems.test.ts src/adventure/v2/MuseunCoinShopView.test.ts && npm run check-images`
Expected: PASS; no missing referenced cash item SVG.

- [ ] **Step 6: 상품 변경 커밋**

```bash
git add src/adventure/data/v2/museunCashItems.ts src/adventure/data/v2/museunCashItems.test.ts src/adventure/v2/MuseunCoinShopView.tsx src/adventure/v2/MuseunCoinShopView.test.ts public/images/items/cash/adventure_support_premium_30d.svg
git commit -m "feat: add premium support pass to coin shop"
```

### Task 3: 원자적 프리미엄권 사용

**Files:**
- Modify: `src/app/api/v2/me/use-cash-item/route.ts`
- Modify: `src/app/api/v2/me/use-cash-item/route.test.ts`

**Interfaces:**
- Consumes: `grantPremiumAdventureSupport`, `PREMIUM_ADVENTURE_SUPPORT_PASS`, `addMuseunCashItem`
- Produces: 성공 응답의 `tier`, `activeUntil`, `premiumUntil`, `cashItems`, `stamina`

- [ ] **Step 1: Next.js 라우트 핸들러 가이드 확인**

Run: `sed -n '1,240p' node_modules/next/dist/docs/01-app/01-getting-started/15-route-handlers.md`
Expected: 현재 `export async function POST(req: Request)`와 `Response.json` 사용이 유효함을 확인한다.

- [ ] **Step 2: 한 번 사용 시 네 변경을 검증하는 실패 테스트 작성**

고정된 `Date.now()`와 캐릭터 `{ cashItems: { adventure_support_premium_30d: 1, cosmetic_extension_30d: 1 }, stamina: { current: 1_500, lastUpdatedAt: now } }`를 준비해 POST 후 저장값을 검증한다.

```ts
expect(saved.cashItems).toEqual({ cosmetic_extension_30d: 3 });
expect(saved.adventureSupport).toEqual({
  activatedAt: now,
  premiumUntil: now + 30 * DAY_MS,
  activeUntil: now + 30 * DAY_MS,
});
expect(saved.stamina.current).toBe(4_500);
expect(json).toMatchObject({ ok: true, tier: "premium", stamina: saved.stamina });
```

일반권 10일 잔여 상태에서는 `activeUntil = now + 40일`도 검증한다. 아이템 미보유 시 트랜잭션 콜백이 저장을 호출하지 않아 기간·스태미나·연장권 모두 바뀌지 않는 회귀도 추가한다.

- [ ] **Step 3: API 테스트가 프리미엄 effect 미처리로 실패하는지 확인**

Run: `npx vitest run src/app/api/v2/me/use-cash-item/route.test.ts`
Expected: FAIL with `use_elsewhere` or missing premium response fields.

- [ ] **Step 4: 기존 잠금 트랜잭션 안에 프리미엄 분기 구현**

일반과 프리미엄 effect를 같은 지원권 처리 구간에서 구분한다. 프리미엄이면 아이템을 먼저 차감한 결과에 `addMuseunCashItem(cashItems, "cosmetic_extension_30d", 2)`를 적용하고, 새 등급의 최대 스태미나를 구한 뒤 다음처럼 최대치에 클램프한다.

```ts
const stamina = {
  current: Math.min(
    nextConfig.max,
    current.current + PREMIUM_ADVENTURE_SUPPORT_PASS.staminaActivationGrant,
  ),
  lastUpdatedAt: current.lastUpdatedAt,
};
```

일반권의 기존 최초 활성 스태미나 지급 규칙은 유지한다.

- [ ] **Step 5: API 테스트 통과 확인**

Run: `npx vitest run src/app/api/v2/me/use-cash-item/route.test.ts`
Expected: PASS for standard and premium use, missing ownership, and queued standard time.

- [ ] **Step 6: 원자적 사용 변경 커밋**

```bash
git add src/app/api/v2/me/use-cash-item/route.ts src/app/api/v2/me/use-cash-item/route.test.ts
git commit -m "feat: activate premium support pass atomically"
```

### Task 4: 등급별 스태미나·사냥·거래소 계산

**Files:**
- Modify: `src/adventure/v2/stamina.ts`
- Modify: `src/adventure/v2/stamina.test.ts`
- Modify: `src/lib/server/marketplaceV2.ts`
- Modify: `src/lib/server/marketplaceV2.test.ts`
- Modify: `src/app/api/v2/dungeon/hunt/route.ts`
- Modify: `src/adventure/v2/V2DungeonFloorView.tsx`
- Modify: `src/adventure/v2/V2DungeonFloorView.test.tsx`
- Modify: `src/adventure/v2/GameStateProvider.tsx`
- Modify: `src/app/(game)/battle/dungeon/[floorId]/page.tsx`
- Modify: `src/adventure/v2/V2UnexploredHuntPage.tsx`

**Interfaces:**
- Consumes: `AdventureSupportTier`, `adventureSupportTier`, `adventureSupportBenefits`
- Produces: `CharacterStaminaConfig.adventureSupportTier`
- Produces: hunt helper inputs accepting `AdventureSupportTier | boolean`
- Produces: marketplace helper inputs accepting `AdventureSupportTier | boolean`
- Produces: `GameStateValue.adventureSupportTier`

- [ ] **Step 1: 등급별 계산 실패 테스트 작성**

```ts
expect(staminaConfigForCharacter({ adventureSupport: premium }, now)).toMatchObject({
  max: MAX_STAMINA + 3_000,
  regenBonusPct: 20,
  adventureSupportTier: "premium",
});
expect(huntCountsForAdventureSupport("premium")).toEqual([1, 5, 10, 50, 100]);
expect(normalizeHuntCount(100, "standard")).toBe(1);
expect(normalizeHuntCount(100, "premium")).toBe(100);
expect(marketplaceSlotLimitForAdventureSupport("premium")).toBe(30);
expect(marketplaceTaxRateForAdventureSupport("premium")).toBe(0.05);
```

- [ ] **Step 2: 계산 테스트가 boolean 전용 구현으로 실패하는지 확인**

Run: `npx vitest run src/adventure/v2/stamina.test.ts src/adventure/data/v2/adventureSupport.test.ts src/lib/server/marketplaceV2.test.ts`
Expected: FAIL on premium max, 100 batch, and 30 marketplace slots.

- [ ] **Step 3: 공용 계산과 서버 소비자를 등급 기반으로 전환**

`boolean`은 기존 테스트와 오래된 호출부 호환을 위해 `true -> standard`, `false -> none`으로 정규화한다. 실제 서버 호출부는 저장 상태에서 `adventureSupportTier(...)`를 구해 넘긴다. 던전 route는 premium만 100을 허용하며 101 및 허용 목록 밖 수치는 거부한다.

- [ ] **Step 4: GameState와 던전 화면에 등급 전달**

`GameStateProvider`는 `adventureSupportTier`를 상태로 보유하고 기존 `adventureSupportActive`는 `tier !== "none"`으로 유지한다. `V2DungeonFloorView`는 등급으로 선택 목록과 로컬 저장값을 정규화하고, 일반 50·프리미엄 100·비활성 10 상한을 표시한다.

- [ ] **Step 5: 계산·던전 회귀 테스트 통과 확인**

Run: `npx vitest run src/adventure/data/v2/adventureSupport.test.ts src/adventure/v2/stamina.test.ts src/lib/server/marketplaceV2.test.ts src/adventure/v2/V2DungeonFloorView.test.tsx`
Expected: PASS for all three tiers; standard behavior unchanged.

- [ ] **Step 6: 소비자 전환 커밋**

```bash
git add src/adventure/data/v2/adventureSupport.ts src/adventure/data/v2/adventureSupport.test.ts src/adventure/v2/stamina.ts src/adventure/v2/stamina.test.ts src/lib/server/marketplaceV2.ts src/lib/server/marketplaceV2.test.ts src/app/api/v2/dungeon/hunt/route.ts src/adventure/v2/V2DungeonFloorView.tsx src/adventure/v2/V2DungeonFloorView.test.tsx src/adventure/v2/GameStateProvider.tsx 'src/app/(game)/battle/dungeon/[floorId]/page.tsx' src/adventure/v2/V2UnexploredHuntPage.tsx
git commit -m "feat: apply premium support benefits"
```

### Task 5: 상태 API와 프리미엄 상태 표시

**Files:**
- Modify: `src/app/api/v2/me/state/route.ts`
- Modify: `src/adventure/v2/fetchGameState.ts`
- Modify: `src/adventure/v2/GameStateProvider.tsx`
- Modify: `src/adventure/v2/CompactCharacterSummary.tsx`
- Modify: `src/adventure/v2/CompactCharacterEffectCard.tsx`
- Modify: `src/adventure/v2/CompactCharacterEffectCard.test.tsx`
- Modify: `src/adventure/v2/V2CharacterCard.tsx`
- Modify: `src/adventure/v2/V2CharacterCard.test.tsx`
- Modify: `src/adventure/v2/adventureSupportDisplay.ts`
- Modify: `src/adventure/v2/adventureSupportDisplay.test.ts`

**Interfaces:**
- Produces state JSON: `{ active, tier, activeUntil, premiumUntil, regenBonusPct }`
- Produces UI summary: `{ active, tier, activeUntil, premiumUntil, regenBonusPct }`
- Produces: `queuedStandardSupportMs(state, now): number`

- [ ] **Step 1: 상태 응답·기간 표시 함수 실패 테스트 작성**

`premiumUntil = now + 30일`, `activeUntil = now + 40일`이면 프리미엄 남은 30일과 대기 일반 10일을 반환하고, `premiumUntil` 경계 이후에는 일반권 남은 10일만 반환하는 테스트를 추가한다. API 소스 회귀에는 두 응답 지점 모두 `tier`와 `premiumUntil`을 포함하는지 검증한다.

- [ ] **Step 2: 표시 테스트 실패 확인**

Run: `npx vitest run src/adventure/v2/adventureSupportDisplay.test.ts src/adventure/v2/CompactCharacterEffectCard.test.tsx src/adventure/v2/V2CharacterCard.test.tsx`
Expected: FAIL because tier/premiumUntil is absent from props and labels.

- [ ] **Step 3: 상태 API와 클라이언트 스냅샷 타입 확장**

코어 뷰와 전체 뷰 응답 모두 같은 지원권 객체를 반환한다. `fetchGameState.ts` 및 `GameStateProvider` 파서는 알 수 없는 tier를 `none`으로, 유효 숫자가 아닌 만료 시각을 `null`로 처리한다.

- [ ] **Step 4: 두 캐릭터 UI에 금색 프리미엄 표시 구현**

프리미엄이면 `Sparkle` 금색 아이콘과 `월간 모험 지원권 프리미엄 적용 중` 라벨을 사용한다. 상세에는 프리미엄 등급 상수의 +3,000·20%·100회·+20칸·5%를 표시하고 `premiumUntil`까지의 남은 기간과 `activeUntil - premiumUntil`의 대기 일반 기간을 별도 문장으로 보여준다. 표준 등급은 기존 `Ticket` 아이콘·문구와 수치를 유지한다.

- [ ] **Step 5: 상태·UI 테스트 통과 확인**

Run: `npx vitest run src/adventure/v2/adventureSupportDisplay.test.ts src/adventure/v2/CompactCharacterEffectCard.test.tsx src/adventure/v2/V2CharacterCard.test.tsx src/adventure/v2/fetchGameState.test.ts`
Expected: PASS for premium label/icon, queued standard duration, and boundary fallback to standard.

- [ ] **Step 6: 상태 표시 변경 커밋**

```bash
git add src/app/api/v2/me/state/route.ts src/adventure/v2/fetchGameState.ts src/adventure/v2/GameStateProvider.tsx src/adventure/v2/CompactCharacterSummary.tsx src/adventure/v2/CompactCharacterEffectCard.tsx src/adventure/v2/CompactCharacterEffectCard.test.tsx src/adventure/v2/V2CharacterCard.tsx src/adventure/v2/V2CharacterCard.test.tsx src/adventure/v2/adventureSupportDisplay.ts src/adventure/v2/adventureSupportDisplay.test.ts
git commit -m "feat: show premium support status"
```

### Task 6: 일반권 지급 경로·인벤토리·매뉴얼 회귀

**Files:**
- Modify: `src/app/api/v2/me/attendance/route.test.ts`
- Modify: `src/lib/server/inboxClaimSeasonReward.test.ts`
- Modify: `src/adventure/v2/inventory/InventoryItemIcon.tsx`
- Modify: `src/adventure/v2/inventory/RareMapsTab.tsx`
- Modify: `src/app/manual/content/controls.tsx`

**Interfaces:**
- Consumes: premium-aware `grantAdventureSupport`
- Verifies: attendance/inbox standard grants extend only `activeUntil` during premium
- Produces: premium inventory icon and manual comparison copy

- [ ] **Step 1: 기존 일반권 지급이 프리미엄 뒤에 쌓이는 회귀 테스트 작성**

출석과 우편 테스트의 기존 character fixture에 프리미엄 30일 상태를 넣고 일반 7일 보상 후 `premiumUntil` 불변, `activeUntil` +7일을 검증한다.

- [ ] **Step 2: 회귀 테스트 실패 확인**

Run: `npx vitest run src/app/api/v2/me/attendance/route.test.ts src/lib/server/inboxClaimSeasonReward.test.ts`
Expected: 기존 grant가 `premiumUntil`을 보존하지 않는 구현이면 FAIL.

- [ ] **Step 3: 프리미엄 인벤토리 표시와 매뉴얼 문구 추가**

프리미엄 item effect를 사용 가능한 이용권으로 표시하고 금색 방패/별 아이콘을 매핑한다. 매뉴얼에는 일반권과 프리미엄권 수치를 나란히 설명하고, 프리미엄 중 일반 기간 보존 및 연장권 2개 지급을 명시한다. 자동·오프라인 사냥 표현은 넣지 않는다.

- [ ] **Step 4: 지급 경로·인벤토리 관련 테스트 통과 확인**

Run: `npx vitest run src/app/api/v2/me/attendance/route.test.ts src/lib/server/inboxClaimSeasonReward.test.ts src/adventure/v2/V2InventoryView.test.tsx`
Expected: PASS; premium state is retained by standard grants.

- [ ] **Step 5: 문서와 호환 변경 커밋**

```bash
git add src/app/api/v2/me/attendance/route.test.ts src/lib/server/inboxClaimSeasonReward.test.ts src/adventure/v2/inventory/InventoryItemIcon.tsx src/adventure/v2/inventory/RareMapsTab.tsx src/app/manual/content/controls.tsx
git commit -m "docs: document premium adventure support"
```

### Task 7: 전체 검증과 최종 검토

**Files:**
- Verify only: all files changed in Tasks 1-6

**Interfaces:**
- Verifies: approved design, existing standard pass compatibility, no unrelated changes included

- [ ] **Step 1: 지원권 관련 테스트 전체 실행**

Run: `npx vitest run src/adventure/data/v2/adventureSupport.test.ts src/adventure/data/v2/museunCashItems.test.ts src/app/api/v2/me/use-cash-item/route.test.ts src/adventure/v2/stamina.test.ts src/lib/server/marketplaceV2.test.ts src/adventure/v2/MuseunCoinShopView.test.ts src/adventure/v2/adventureSupportDisplay.test.ts src/adventure/v2/CompactCharacterEffectCard.test.tsx src/adventure/v2/V2CharacterCard.test.tsx src/adventure/v2/V2DungeonFloorView.test.tsx src/app/api/v2/me/attendance/route.test.ts src/lib/server/inboxClaimSeasonReward.test.ts`
Expected: all tests PASS.

- [ ] **Step 2: 정적 검사와 이미지 검사 실행**

Run: `npx tsc --noEmit && npm run check-images`
Expected: exit 0; no missing image reference.

- [ ] **Step 3: 전체 회귀 테스트 실행**

Run: `npm test`
Expected: exit 0. If unrelated pre-existing failures occur, record exact failing files without modifying their work.

- [ ] **Step 4: 설계 누락과 금지 보너스 문자열 검사**

Run: `rg -n "adventure_support_premium|PREMIUM_ADVENTURE_SUPPORT|premiumUntil|adventureSupportTier" src docs/superpowers/specs/2026-08-30-premium-adventure-support-design.md`
Expected: catalog, use route, state route, all consumers, UI, and manual references are present; no premium EXP/gold/drop/mastery/combat or auto-hunt benefit implementation exists.

- [ ] **Step 5: 변경 범위와 작업 트리 확인**

Run: `git diff --check && git status --short`
Expected: no whitespace errors; unrelated pre-existing user files remain untouched and uncommitted.

- [ ] **Step 6: 검증 중 필요한 보정만 커밋**

```bash
git add src/adventure/data/v2/adventureSupport.ts src/adventure/data/v2/adventureSupport.test.ts src/adventure/data/v2/museunCashItems.ts src/adventure/data/v2/museunCashItems.test.ts src/app/api/v2/me/use-cash-item/route.ts src/app/api/v2/me/use-cash-item/route.test.ts src/adventure/v2/stamina.ts src/adventure/v2/stamina.test.ts src/lib/server/marketplaceV2.ts src/lib/server/marketplaceV2.test.ts src/app/api/v2/dungeon/hunt/route.ts src/adventure/v2/V2DungeonFloorView.tsx src/adventure/v2/V2DungeonFloorView.test.tsx src/app/api/v2/me/state/route.ts src/adventure/v2/GameStateProvider.tsx src/adventure/v2/fetchGameState.ts src/adventure/v2/CompactCharacterSummary.tsx src/adventure/v2/CompactCharacterEffectCard.tsx src/adventure/v2/CompactCharacterEffectCard.test.tsx src/adventure/v2/V2CharacterCard.tsx src/adventure/v2/V2CharacterCard.test.tsx src/adventure/v2/adventureSupportDisplay.ts src/adventure/v2/adventureSupportDisplay.test.ts src/adventure/v2/MuseunCoinShopView.tsx src/adventure/v2/MuseunCoinShopView.test.ts src/adventure/v2/inventory/InventoryItemIcon.tsx src/adventure/v2/inventory/RareMapsTab.tsx src/app/manual/content/controls.tsx public/images/items/cash/adventure_support_premium_30d.svg
git commit -m "test: verify premium adventure support"
```

검증 보정이 없으면 빈 커밋을 만들지 않는다. 배포·푸시·원격 통합은 수행하지 않는다.
