# Marketplace Unregistered Codex Filter Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 거래소의 여섯 장비 탭에서 현재 장비 도감에 등록되지 않은 아이템의 매물만 골라보는 필터를 제공한다.

**Architecture:** 기존 클라이언트 컴포넌트인 `V2MarketplaceView`가 `useEquipmentCodexContext()`의 로딩 상태와 등록 ID 집합을 구독한다. 카탈로그 경계와 등록 여부 판정은 `marketplaceBrowseFilters.ts`의 순수 함수로 분리하고, 화면은 기존 필터 파이프라인·상태 요약·초기화·페이지네이션에 새 불리언 상태를 배선한다. 서버 API와 데이터베이스는 변경하지 않는다.

**Tech Stack:** Next.js App Router Client Components, React 19, TypeScript, Vitest, Testing Library, Tailwind CSS

## Global Constraints

- 적용 화면은 거래소 매물 탐색 화면으로 한정한다.
- 무기, 방어구, 장갑, 신발, 반지, 목걸이 탭에서만 필터를 표시하고 적용한다.
- 재료·소모품 탭과 최근 거래, 판매 등록, 내 거래 화면은 변경하지 않는다.
- 도감 데이터가 로드되지 않았거나 컨텍스트가 없으면 토글을 비활성화하고 매물을 숨기지 않는다.
- 등록 처리, `/api/v2/marketplace/browse`, 데이터베이스 스키마와 기존 정렬 방식은 변경하지 않는다.
- 기존 `SURFACE_INSET`을 유지하고 새 반투명 표면을 만들지 않는다.
- 별도 배포 요청 전에는 어떤 환경에도 배포하지 않는다.

## File Map

- Modify: `src/adventure/v2/marketplace/marketplaceBrowseFilters.ts` — 장비 카탈로그와 도감 등록 집합을 이용한 순수 판정 함수.
- Modify: `src/adventure/v2/marketplace/marketplaceBrowseFilters.test.ts` — 판정 함수의 등록·미등록·로딩·옛 ID 회귀 테스트.
- Create: `src/adventure/v2/V2MarketplaceView.codexFilter.test.tsx` — 로딩 UI, 실제 필터링, 기존 검색 조합, 초기화, 장비 탭 한정 및 빈 상태의 상호작용 테스트.
- Modify: `src/adventure/v2/V2MarketplaceView.tsx` — 도감 컨텍스트 구독, 필터 상태와 UI, 목록 파이프라인·개수·초기화·페이지 키·빈 상태 배선.

---

### Task 1: 도감 미등록 순수 판정 함수

**Files:**
- Modify: `src/adventure/v2/marketplace/marketplaceBrowseFilters.test.ts`
- Modify: `src/adventure/v2/marketplace/marketplaceBrowseFilters.ts`

**Interfaces:**
- Consumes: `V2_EQUIPMENT`, `V2EquipmentId`, `ReadonlySet<V2EquipmentId>`
- Produces: `matchesMarketplaceUnregisteredCodex(itemId: string, enabled: boolean, loaded: boolean, registeredIds: ReadonlySet<V2EquipmentId> | null | undefined): boolean`

- [ ] **Step 1: 판정 함수의 실패 테스트 작성**

`marketplaceBrowseFilters.test.ts`의 import에 `matchesMarketplaceUnregisteredCodex`와 `V2EquipmentId`를 추가하고 다음 사례를 작성한다.

```ts
describe("거래소 도감 미등록 장비 필터", () => {
  const registeredIds = new Set<V2EquipmentId>(["v2_iron_sword"]);

  it("필터가 꺼져 있거나 도감 로딩 전이면 매물을 보존한다", () => {
    expect(
      matchesMarketplaceUnregisteredCodex(
        "v2_iron_sword",
        false,
        true,
        registeredIds,
      ),
    ).toBe(true);
    expect(
      matchesMarketplaceUnregisteredCodex(
        "v2_iron_sword",
        true,
        false,
        registeredIds,
      ),
    ).toBe(true);
  });

  it("로드 후에는 등록 장비를 제외하고 미등록 장비만 보존한다", () => {
    expect(
      matchesMarketplaceUnregisteredCodex(
        "v2_iron_sword",
        true,
        true,
        registeredIds,
      ),
    ).toBe(false);
    expect(
      matchesMarketplaceUnregisteredCodex(
        "v2_greatsword",
        true,
        true,
        registeredIds,
      ),
    ).toBe(true);
  });

  it("카탈로그에 없는 옛 ID는 미등록 장비로 노출하지 않는다", () => {
    expect(
      matchesMarketplaceUnregisteredCodex(
        "legacy_unknown",
        true,
        true,
        registeredIds,
      ),
    ).toBe(false);
  });
});
```

- [ ] **Step 2: 테스트가 함수 미정의로 실패하는지 확인**

Run: `npx vitest run src/adventure/v2/marketplace/marketplaceBrowseFilters.test.ts`

Expected: `matchesMarketplaceUnregisteredCodex` export가 없어 FAIL.

- [ ] **Step 3: 최소 순수 함수 구현**

`marketplaceBrowseFilters.ts`에 다음 함수를 추가한다.

```ts
export function matchesMarketplaceUnregisteredCodex(
  itemId: string,
  enabled: boolean,
  loaded: boolean,
  registeredIds: ReadonlySet<V2EquipmentId> | null | undefined,
): boolean {
  if (!enabled || !loaded) return true;
  const item = V2_EQUIPMENT[itemId as V2EquipmentId];
  return item != null && registeredIds?.has(item.id) === false;
}
```

- [ ] **Step 4: 순수 함수 테스트 통과 확인**

Run: `npx vitest run src/adventure/v2/marketplace/marketplaceBrowseFilters.test.ts`

Expected: 해당 파일의 모든 테스트 PASS.

- [ ] **Step 5: 순수 판정 단위 커밋**

```bash
git add src/adventure/v2/marketplace/marketplaceBrowseFilters.ts src/adventure/v2/marketplace/marketplaceBrowseFilters.test.ts
git commit -m "feat: add marketplace codex filter predicate"
```

### Task 2: 거래소 화면 필터 배선과 상호작용

**Files:**
- Create: `src/adventure/v2/V2MarketplaceView.codexFilter.test.tsx`
- Modify: `src/adventure/v2/V2MarketplaceView.tsx`

**Interfaces:**
- Consumes: `useEquipmentCodexContext()`의 `{ registeredIds, loaded }`, Task 1의 `matchesMarketplaceUnregisteredCodex(...)`
- Produces: 장비 탭 전용 `unregisteredCodexOnly` 상태, `도감 상태` 토글, `도감 미등록` 상태 칩과 빈 상태 문구

- [ ] **Step 1: 화면 상호작용 실패 테스트 작성**

`V2MarketplaceView.codexFilter.test.tsx`를 jsdom 테스트로 만든다. `vi.hoisted`의 변경 가능한 `codexState`를 `useEquipmentCodexContext` mock이 반환하게 하고, `useGameState`는 거래소에 필요한 최소 상태만 반환한다. 고정가 무기 매물 세 개(`v2_iron_sword`, `v2_greatsword`, `v2_mithril_sword`)를 가진 preview를 렌더링한다.

```tsx
// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { RewardToastProvider } from "./RewardToastProvider";
import {
  V2MarketplaceView,
  type MarketplacePreviewData,
} from "./V2MarketplaceView";

const codexState = vi.hoisted(() => ({
  loaded: false,
  registeredIds: new Set<string>(),
}));

vi.mock("next/navigation", () => ({
  usePathname: () => "/marketplace",
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
}));

vi.mock("./GameStateProvider", () => ({
  useEquipmentCodexContext: () => ({
    loaded: codexState.loaded,
    registeredIds: codexState.registeredIds,
    replaceRegisteredIds: vi.fn(),
  }),
  useGameState: () => ({
    coreLoopOn: true,
    bankedGold: 0,
    frontierDepth: 42,
    refreshGameState: vi.fn(),
  }),
}));

const preview: MarketplacePreviewData = {
  viewerGold: 1_000_000,
  bidGraceMinHours: 2,
  bidGraceMaxHours: 24,
  fixedListingHours: 2,
  directListingHours: 24,
  prices: {},
  listings: [
    [1, "v2_iron_sword", "철검"],
    [2, "v2_greatsword", "한타검"],
    [3, "v2_mithril_sword", "미스릴검"],
  ].map(([id, itemId, itemName]) => ({
    id: Number(id),
    isMine: false,
    isHighestBidder: false,
    kind: "equip" as const,
    itemId: String(itemId),
    itemName: String(itemName),
    quantity: 1,
    price: 100_000,
    instancePayload: {},
    createdAt: "2026-09-03T00:00:00.000Z",
    bidEndsAt: "2000-01-01T00:00:00.000Z",
    expiresAt: "9999-12-31T23:59:59.999Z",
    highestBid: null,
    bidCount: 0,
    bidResolvedAt: null,
    nextBid: 1,
  })),
};

function renderMarketplace() {
  render(
    <RewardToastProvider>
      <V2MarketplaceView onBack={() => {}} preview={preview} />
    </RewardToastProvider>,
  );
}

function openFilters() {
  fireEvent.click(screen.getByRole("button", { name: /^필터/ }));
}

beforeEach(() => {
  codexState.loaded = false;
  codexState.registeredIds = new Set();
});

afterEach(cleanup);
```

같은 파일에 다음 동작을 검증한다.

```tsx
describe("거래소 도감 미등록 필터", () => {
  it("도감 로딩 전에는 토글을 비활성화하고 매물을 보존한다", () => {
    renderMarketplace();
    openFilters();

    const loadingButton = screen.getByRole("button", {
      name: "도감 불러오는 중",
    }) as HTMLButtonElement;
    expect(loadingButton.disabled).toBe(true);
    expect(screen.getByText("철검")).toBeTruthy();
  });

  it("등록 장비를 제외하고 검색 조건과 함께 적용한 뒤 초기화한다", () => {
    codexState.loaded = true;
    codexState.registeredIds = new Set(["v2_iron_sword"]);
    renderMarketplace();
    openFilters();

    fireEvent.click(screen.getByRole("button", { name: "도감 미등록만 보기" }));
    expect(screen.queryByText("철검")).toBeNull();
    expect(screen.getByText("한타검")).toBeTruthy();
    expect(
      screen.getByTestId("marketplace-unregistered-codex-filter-chip")
        .textContent,
    ).toBe("도감 미등록");

    fireEvent.change(screen.getByPlaceholderText("아이템 또는 제작자 검색"), {
      target: { value: "미스릴" },
    });
    expect(screen.queryByText("한타검")).toBeNull();
    expect(screen.getByText("미스릴검")).toBeTruthy();

    fireEvent.change(screen.getByPlaceholderText("아이템 또는 제작자 검색"), {
      target: { value: "" },
    });
    fireEvent.click(screen.getByRole("button", { name: "필터 초기화" }));
    expect(screen.getByText("철검")).toBeTruthy();
    expect(
      screen.queryByTestId("marketplace-unregistered-codex-filter-chip"),
    ).toBeNull();
  });

  it("재료 탭에서는 숨기고 장비 탭 복귀 시 선택 상태를 보존한다", () => {
    codexState.loaded = true;
    renderMarketplace();
    openFilters();
    fireEvent.click(screen.getByRole("button", { name: "도감 미등록만 보기" }));

    fireEvent.click(screen.getByRole("tab", { name: "재료" }));
    expect(screen.queryByRole("button", { name: "✓ 도감 미등록만 보는 중" })).toBeNull();
    expect(
      screen.queryByTestId("marketplace-unregistered-codex-filter-chip"),
    ).toBeNull();

    fireEvent.click(screen.getByRole("tab", { name: "무기" }));
    expect(
      screen
        .getByRole("button", { name: "✓ 도감 미등록만 보는 중" })
        .getAttribute("aria-pressed"),
    ).toBe("true");
  });

  it("등록된 매물만 있으면 전용 빈 상태를 표시한다", () => {
    codexState.loaded = true;
    codexState.registeredIds = new Set([
      "v2_iron_sword",
      "v2_greatsword",
      "v2_mithril_sword",
    ]);
    renderMarketplace();
    openFilters();
    fireEvent.click(screen.getByRole("button", { name: "도감 미등록만 보기" }));

    expect(screen.getByText("도감 미등록 매물이 없어요.")).toBeTruthy();
  });
});
```

- [ ] **Step 2: 화면 테스트가 새 UI 부재로 실패하는지 확인**

Run: `npx vitest run src/adventure/v2/V2MarketplaceView.codexFilter.test.tsx`

Expected: `도감 불러오는 중` 또는 `도감 미등록만 보기` 버튼을 찾지 못해 FAIL.

- [ ] **Step 3: 도감 컨텍스트와 화면 상태 배선**

`V2MarketplaceView.tsx`에서 `useEquipmentCodexContext`와 Task 1의 판정 함수를 import하고 컴포넌트 안에 상태를 추가한다.

```ts
const equipmentCodex = useEquipmentCodexContext();
const equipmentCodexLoaded = equipmentCodex?.loaded === true;
const [unregisteredCodexOnly, setUnregisteredCodexOnly] = useState(false);
```

`displayedListings`의 장비 전용 필터 구간에 다음 조건을 추가한다.

```ts
.filter(
  (listing) =>
    !browseEquipmentTab ||
    matchesMarketplaceUnregisteredCodex(
      listing.itemId,
      unregisteredCodexOnly,
      equipmentCodexLoaded,
      equipmentCodex?.registeredIds,
    ),
)
```

활성 필터 개수의 장비 분기에 `Number(unregisteredCodexOnly)`를 더하고, `resetBrowseFilters`에서 `setUnregisteredCodexOnly(false)`를 호출한다. `browsePager` 키에는 `${unregisteredCodexOnly}`를 추가해 토글 변경 시 첫 페이지로 초기화한다.

- [ ] **Step 4: 상세 필터 토글, 상태 칩과 빈 상태 구현**

장비 전용 필터 그리드에 다음 블록을 추가한다.

```tsx
<div className="space-y-1">
  <span className="text-[11px] font-medium text-zinc-500 dark:text-zinc-400">
    도감 상태
  </span>
  <button
    type="button"
    aria-pressed={unregisteredCodexOnly}
    disabled={!equipmentCodexLoaded}
    onClick={() => setUnregisteredCodexOnly((value) => !value)}
    className={`w-full rounded-md border px-3 py-2 text-left text-xs font-medium transition disabled:cursor-not-allowed disabled:opacity-60 ${
      unregisteredCodexOnly
        ? "border-sky-600 bg-sky-600 text-white"
        : "border-zinc-300 bg-white text-zinc-700 hover:bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800"
    }`}
  >
    {!equipmentCodexLoaded
      ? "도감 불러오는 중"
      : unregisteredCodexOnly
        ? "✓ 도감 미등록만 보는 중"
        : "도감 미등록만 보기"}
  </button>
</div>
```

결과 요약에는 장비 탭이면서 활성 상태일 때만 다음 칩을 표시한다.

```tsx
{browseEquipmentTab && unregisteredCodexOnly ? (
  <span
    data-testid="marketplace-unregistered-codex-filter-chip"
    className="rounded-full bg-sky-100 px-2 py-1 text-sky-700 dark:bg-sky-950 dark:text-sky-300"
  >
    도감 미등록
  </span>
) : null}
```

매물 목록의 `emptyText`를 다음 우선순위로 계산한다.

```tsx
emptyText={
  browseEquipmentTab && unregisteredCodexOnly && equipmentCodexLoaded
    ? "도감 미등록 매물이 없어요."
    : listings && listings.length > 0
      ? "조건에 맞는 매물이 없어요."
      : "등록된 매물이 없어요."
}
```

- [ ] **Step 5: 화면 상호작용 및 기존 인접 테스트 통과 확인**

Run: `npx vitest run src/adventure/v2/V2MarketplaceView.codexFilter.test.tsx src/adventure/v2/V2MarketplaceView.layout.test.tsx src/adventure/v2/V2MarketplaceView.equipmentBuyOrderSearch.test.tsx src/adventure/v2/marketplace/marketplaceBrowseFilters.test.ts`

Expected: 지정한 테스트 파일 모두 PASS.

- [ ] **Step 6: 타입·린트 및 전체 테스트 검증**

Run: `npx tsc --noEmit`

Expected: exit code 0.

Run: `npx eslint src/adventure/v2/V2MarketplaceView.tsx src/adventure/v2/V2MarketplaceView.codexFilter.test.tsx src/adventure/v2/marketplace/marketplaceBrowseFilters.ts src/adventure/v2/marketplace/marketplaceBrowseFilters.test.ts`

Expected: exit code 0.

Run: `npm test`

Expected: 모든 테스트 PASS. 기준선에서 전체 병렬 부하 때문에 `src/adventure/data/v2/levelDesignSim.test.ts` 1건이 5초 시간 제한을 넘긴 전력이 있으므로, 동일 실패만 발생하면 해당 파일을 단독 재실행해 신규 회귀와 구분한다.

- [ ] **Step 7: 거래소 UI 통합 커밋**

```bash
git add src/adventure/v2/V2MarketplaceView.tsx src/adventure/v2/V2MarketplaceView.codexFilter.test.tsx
git commit -m "feat: filter marketplace by unregistered codex gear"
```
