// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { WOODCUTTING_MATERIAL_ID } from "@/adventure/data/v2/woodcuttingSpots";
import { MINING_MATERIAL_ID } from "@/adventure/data/v2/miningSpots";
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

  it("채광지를 선택하면 해당 광맥의 주 광석 보유량을 표시한다", async () => {
    stubInventory({ [MINING_MATERIAL_ID.iron]: 5678 });
    render(<WorldRumorMapView />);

    fireEvent.click(screen.getByText("채광지"));

    expect(await screen.findByText("철광석 · 보유 5,678개")).toBeTruthy();
  });

  it("주 생산물을 보유하지 않았으면 0개로 표시한다", async () => {
    stubInventory({});
    render(<WorldRumorMapView />);

    fireEvent.click(screen.getByText("벌목지"));

    expect(await screen.findByText("소나무 원목 · 보유 0개")).toBeTruthy();
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

  it("인벤토리를 불러오기 전에는 보유량을 표시하지 않는다", () => {
    vi.stubGlobal("fetch", vi.fn(() => new Promise(() => {})));
    render(<WorldRumorMapView />);

    fireEvent.click(screen.getByText("벌목지"));

    expect(screen.queryByText(/· 보유 [\d,]+개/)).toBeNull();
  });

  it("인벤토리 조회가 실패해도 기존 지역 상세는 유지한다", () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("network")));
    render(<WorldRumorMapView />);

    fireEvent.click(screen.getByText("채광지"));

    expect(
      screen.getByRole("heading", { name: "회색바위 철 채석장" }),
    ).toBeTruthy();
    expect(screen.queryByText(/· 보유 [\d,]+개/)).toBeNull();
  });
});
