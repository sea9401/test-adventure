import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { AdventurerFarmPanel } from "./AdventurerFarmPanel";

vi.mock("./useFarm", async () => {
  const farmModule = await import("./farm");
  const noop = () => {};
  const noopAsync = async () => {};

  return {
    useFarm: () => ({
      loading: false,
      busyPlotId: null,
      busyDeliveryId: null,
      busySpecialDeliveryId: null,
      busyWeeklyDeliveryId: null,
      busyShopItemId: null,
      busyPlotUpgrade: false,
      notice: null,
      now: 0,
      farm: farmModule.emptyFarmState(0),
      learnedSkillIds: [],
      crops: farmModule.FARM_CROP_LIST,
      deliveries: [],
      specialDeliveries: [],
      weeklyDeliveries: [],
      shopItems: [],
      clearNotice: noop,
      refresh: noopAsync,
      plant: noopAsync,
      harvest: noopAsync,
      deliver: noopAsync,
      deliverSpecial: noopAsync,
      deliverWeekly: noopAsync,
      buyShopItem: noopAsync,
      buyPlotUpgrade: noopAsync,
    }),
  };
});

describe("모험가 농장 모바일 섹션", () => {
  it("농장 정보를 홈으로 분리하고 작업 탭 바로가기를 제공한다", () => {
    const html = renderToStaticMarkup(
      <AdventurerFarmPanel onBack={vi.fn()} onOpenKitchen={vi.fn()} />,
    );

    expect(html).toContain("농장 홈");
    expect(html).toContain(">재배<");
    expect(html).toContain(">납품<");
    expect(html).toContain(">상점<");
    expect(html).toContain('aria-label="농장 바로가기"');
    expect(html).toContain("농사 레벨");
    expect(html).toContain("농장 성장");
    expect(html).toContain("sticky top-16");
  });
});
