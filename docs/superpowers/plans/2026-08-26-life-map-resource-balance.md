# 생활 지도 주 생산물 보유량 표시 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 선택한 벌목지·채광지의 오른쪽 상세 카드에서 해당 지역 주 생산물의 현재 보유량을 확인할 수 있게 한다.

**Architecture:** 기존 클라이언트 컴포넌트가 마운트될 때 `/api/v2/me/inventory`를 한 번 조회해 재료 잔액을 로컬 상태에 보관한다. 선택한 수종·광맥의 기존 `materialId`로 잔액을 찾아 `WoodcuttingSpotMeta`와 `MiningSpotMeta`에만 표시하며, 조회 전이나 실패 시에는 보유량 줄을 렌더링하지 않는다.

**Tech Stack:** Next.js 16.2 Client Components, React 19 hooks, TypeScript, Vitest 4, Testing Library, Tailwind CSS 4

## Global Constraints

- 왼쪽 `선택 가능한 지역` 목록은 변경하지 않는다.
- 벌목지는 주 원목만, 채광지는 주 광석만 표시하고 채광 부산물은 표시하지 않는다.
- 낚시터 화면은 변경하지 않는다.
- 기존 `SURFACE_INSET` 불투명 표면과 라이트·다크 모드 색상 체계를 유지한다.
- 조회 전 또는 실패 시 잘못된 0개나 별도 오류 화면을 노출하지 않는다.
- 배포하지 않는다.

---

### Task 1: 주 생산물 보유량 조회 및 상세 표시

**Files:**
- Create: `src/adventure/v2/WorldRumorMapView.resourceBalance.test.tsx`
- Modify: `src/adventure/v2/WorldRumorMapView.tsx`

**Interfaces:**
- Consumes: `GET /api/v2/me/inventory` 응답의 `materials?: Record<string, number>`, `WoodcuttingTree.materialId`, `MiningNode.materialId`, `WOODCUTTING_MATERIALS`, `MINING_MATERIALS`
- Produces: `WoodcuttingSpotMeta({ id, materialBalances })`와 `MiningSpotMeta({ id, materialBalances })`가 로드된 잔액이 있을 때 `<생산물명> · 보유 <ko-KR 형식 수량>개`를 렌더링한다.

- [ ] **Step 1: 벌목 주 생산물의 보유량 회귀 테스트 작성**

```tsx
// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  WOODCUTTING_MATERIAL_ID,
} from "@/adventure/data/v2/woodcuttingSpots";
import { WorldRumorMapView } from "./WorldRumorMapView";

vi.mock("@/adventure/v2/LifeFieldPanels", () => ({
  LifeFieldEnvironmentCard: () => null,
  useFullLifeFieldStatus: () => ({
    data: null,
    loading: false,
    error: false,
    refresh: () => Promise.resolve(),
  }),
}));

function stubInventory(materials: Record<string, number>) {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ ok: true, materials }),
    } as Response),
  );
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("생활 지도 주 생산물 보유량", () => {
it("벌목지를 선택하면 해당 수종의 원목 보유량을 표시한다", async () => {
  stubInventory({ [WOODCUTTING_MATERIAL_ID.pine]: 1234 });
  render(<WorldRumorMapView />);

  fireEvent.click(screen.getByText("벌목지"));

  expect(
    await screen.findByText("소나무 원목 · 보유 1,234개"),
  ).toBeTruthy();
});
});
```

- [ ] **Step 2: 테스트를 실행해 주 생산물 보유량 UI가 없어 실패하는지 확인**

Run: `npx vitest run src/adventure/v2/WorldRumorMapView.resourceBalance.test.tsx -t "벌목지를 선택하면"`

Expected: FAIL because `소나무 원목 · 보유 1,234개` is absent.

- [ ] **Step 3: 채광 주 생산물과 부산물 제외 테스트 추가**

```tsx
it("채광지를 선택하면 해당 광맥의 주 광석 보유량을 표시한다", async () => {
  stubInventory({ [MINING_MATERIAL_ID.iron]: 5678 });
  render(<WorldRumorMapView />);

  fireEvent.click(screen.getByText("채광지"));

  expect(await screen.findByText("철광석 · 보유 5,678개")).toBeTruthy();
});

it("채광 부산물 보유량은 지역 상세에 표시하지 않는다", async () => {
  stubInventory({
    [MINING_MATERIAL_ID.iron]: 1,
    [MINING_MATERIAL_ID.stone]: 999,
  });
  render(<WorldRumorMapView />);

  fireEvent.click(screen.getByText("채광지"));
  await screen.findByText("철광석 · 보유 1개");

  expect(screen.queryByText(/단단한 돌 · 보유/)).toBeNull();
});
```

이 단계에서 `MINING_MATERIAL_ID`도 테스트 파일 import에 추가하고, 두 테스트를 같은 `describe` 블록에 둔다.

- [ ] **Step 4: 로딩 전과 조회 실패 시 보유량을 숨기는 테스트 추가**

```tsx
it("인벤토리를 불러오기 전에는 보유량을 표시하지 않는다", () => {
  vi.stubGlobal("fetch", vi.fn(() => new Promise(() => {})));
  render(<WorldRumorMapView />);

  fireEvent.click(screen.getByText("벌목지"));

  expect(screen.queryByText(/· 보유 [\d,]+개/)).toBeNull();
});

it("인벤토리 조회가 실패해도 기존 지역 상세는 유지한다", async () => {
  vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("network")));
  render(<WorldRumorMapView />);

  fireEvent.click(screen.getByText("채광지"));

  expect(await screen.findByText("회색바위 철 채석장")).toBeTruthy();
  expect(screen.queryByText(/· 보유 [\d,]+개/)).toBeNull();
});
```

- [ ] **Step 5: 전체 신규 테스트를 실행해 기대한 이유로 실패하는지 확인**

Run: `npx vitest run src/adventure/v2/WorldRumorMapView.resourceBalance.test.tsx`

Expected: 주 생산물 보유량 두 테스트는 문구 부재로 FAIL하고, 부산물 제외 테스트는 주 생산물 문구 대기에서 FAIL한다.

- [ ] **Step 6: 인벤토리 조회와 상세 표시를 최소 구현**

`WorldRumorMapView.tsx`에서 `useEffect`와 재료 카탈로그를 가져오고, 잔액 타입을 정의한다.

```tsx
import { useEffect, useState } from "react";
import { WOODCUTTING_MATERIALS } from "@/adventure/data/v2/woodcuttingSpots";
import { MINING_MATERIALS } from "@/adventure/data/v2/miningSpots";

type MaterialBalances = Readonly<Record<string, number>>;
```

`WorldRumorMapView`에 로드 상태와 취소 안전한 조회 효과를 추가한다.

```tsx
const [materialBalances, setMaterialBalances] =
  useState<MaterialBalances | null>(null);

useEffect(() => {
  let active = true;
  void fetch("/api/v2/me/inventory")
    .then(async (response) => {
      if (!response.ok) return null;
      return (await response.json().catch(() => null)) as {
        materials?: Record<string, number>;
      } | null;
    })
    .then((inventory) => {
      if (active && inventory) setMaterialBalances(inventory.materials ?? {});
    })
    .catch(() => {});
  return () => {
    active = false;
  };
}, []);
```

두 메타 컴포넌트에 `materialBalances`를 전달하고, 로드된 경우에만 주 생산물 줄을 추가한다.

```tsx
const material = WOODCUTTING_MATERIALS[tree.materialId];
const owned = materialBalances ? (materialBalances[tree.materialId] ?? 0) : null;

{owned != null ? (
  <div className="text-xs font-medium text-zinc-700 dark:text-zinc-200">
    {material.name} · 보유{" "}
    <span className="tabular-nums">{owned.toLocaleString("ko-KR")}개</span>
  </div>
) : null}
```

채광 메타도 `MINING_MATERIALS[node.materialId]`를 사용해 같은 구조로 렌더링한다. 부산물 배열은 순회하지 않는다.

- [ ] **Step 7: 신규 테스트가 모두 통과하는지 확인**

Run: `npx vitest run src/adventure/v2/WorldRumorMapView.resourceBalance.test.tsx`

Expected: PASS.

- [ ] **Step 8: 기존 생활 지도 회귀 테스트와 정적 검사를 실행**

Run: `npx vitest run src/adventure/v2/WorldRumorMapView.test.tsx src/adventure/v2/WorldRumorMapView.resourceBalance.test.tsx`

Expected: PASS.

Run: `npx eslint src/adventure/v2/WorldRumorMapView.tsx src/adventure/v2/WorldRumorMapView.test.tsx src/adventure/v2/WorldRumorMapView.resourceBalance.test.tsx`

Expected: exit 0 with no warnings or errors.

Run: `npx tsc --noEmit`

Expected: exit 0.

- [ ] **Step 9: 구현 변경 커밋**

```bash
git add src/adventure/v2/WorldRumorMapView.tsx src/adventure/v2/WorldRumorMapView.resourceBalance.test.tsx docs/superpowers/plans/2026-08-26-life-map-resource-balance.md
git commit -m "feat: show life resource balances on map"
```
