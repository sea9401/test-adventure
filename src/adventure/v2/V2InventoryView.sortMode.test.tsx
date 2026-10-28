// @vitest-environment jsdom
import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { SortMode } from "./v2ItemListShared";
import { V2InventoryView } from "./V2InventoryView";

// 장비 정렬 유지(건의 #812) — 다른 화면에 다녀와도(언마운트 후 재마운트) 마지막 정렬로 연다.

const mocks = vi.hoisted(() => ({
  sortMode: null as SortMode | null,
  setSortMode: null as ((mode: SortMode) => void) | null,
}));

vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams("tab=weapon"),
}));

vi.mock("@/adventure/v2/GameStateProvider", () => ({
  useEquipmentCodexContext: () => null,
  useGameState: () => ({
    frontierDepth: 99,
    refreshGameState: vi.fn(async () => {}),
    setGold: vi.fn(),
  }),
}));

vi.mock("./RewardToastProvider", () => ({
  useSystemToast: () => ({ notifySystem: vi.fn() }),
}));

vi.mock("./inventory/EquipmentTab", () => ({
  EquipmentTab: ({
    sortMode,
    setSortMode,
  }: {
    sortMode: SortMode;
    setSortMode: (mode: SortMode) => void;
  }) => {
    mocks.sortMode = sortMode;
    mocks.setSortMode = setSortMode;
    return <div>장비 탭</div>;
  },
}));

async function renderView() {
  render(<V2InventoryView onBack={() => {}} />);
  await screen.findByText("장비 탭");
}

describe("인벤토리 장비 정렬 유지", () => {
  beforeEach(() => {
    localStorage.clear();
    mocks.sortMode = null;
    mocks.setSortMode = null;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: string | URL | Request) => {
        const url = String(input);
        if (url.endsWith("/api/v2/me/inventory")) {
          return Response.json({ ok: true, materials: {} });
        }
        if (url.endsWith("/api/v2/me/equipment")) {
          return Response.json({ ok: true, owned: [], equipped: {} });
        }
        throw new Error(`unexpected fetch: ${url}`);
      }),
    );
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    localStorage.clear();
  });

  it("처음에는 기본 정렬로 연다", async () => {
    await renderView();
    expect(mocks.sortMode).toBe("default");
  });

  it("바꾼 정렬은 화면을 나갔다 다시 들어와도 유지된다", async () => {
    await renderView();
    act(() => mocks.setSortMode!("power"));
    expect(mocks.sortMode).toBe("power");

    cleanup();
    mocks.sortMode = null;
    await renderView();
    expect(mocks.sortMode).toBe("power");
  });
});
