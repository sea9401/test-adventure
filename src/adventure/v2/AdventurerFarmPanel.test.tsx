import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import {
  AdventurerFarmPanel,
  FarmBatchActionPanel,
  FarmPlotCard,
  prioritizeDeliverable,
} from "./AdventurerFarmPanel";
import { FARM_CROPS } from "./farm";

vi.mock("./useFarm", async () => {
  const farmModule = await import("./farm");
  const noop = () => {};
  const noopAsync = async () => {};

  return {
    useFarm: () => ({
      loading: false,
      busyPlotId: null,
      busyPlotAction: null,
      busyDeliveryId: null,
      busySpecialDeliveryId: null,
      busyWeeklyDeliveryId: null,
      busyShopItemId: null,
      busyPlotUpgrade: false,
      busyRanchFeedPenId: null,
      busyRanchCollect: false,
      busyRanchUpgradePenId: null,
      fertilizerBalance: 2,
      notice: null,
      now: 0,
      farm: {
        ...farmModule.emptyFarmState(0),
        seeds: { wheat: 1_234 },
        inventory: { wheat: 5_678 },
      },
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
      fertilize: noopAsync,
      plantAll: noopAsync,
      harvestAll: noopAsync,
      fertilizeAll: noopAsync,
      deliver: noopAsync,
      deliverSpecial: noopAsync,
      deliverWeekly: noopAsync,
      buyShopItem: noopAsync,
      buyPlotUpgrade: noopAsync,
      feedRanchPen: noopAsync,
      collectRanch: noopAsync,
      buyRanchPen: noopAsync,
    }),
  };
});

describe("모험가 농장 모바일 섹션", () => {
  it("농장 정보를 홈으로 분리하고 작업 탭 바로가기를 제공한다", () => {
    const html = renderToStaticMarkup(
      <AdventurerFarmPanel
        onBack={vi.fn()}
        onOpenKitchen={vi.fn()}
        onOpenLifeWorkshop={vi.fn()}
      />,
    );

    expect(html).toContain("농장 홈");
    expect(html).toContain(">재배<");
    expect(html).toContain(">목장<");
    expect(html).toContain(">납품<");
    expect(html).toContain(">상점<");
    expect(html).toContain('aria-label="농장 바로가기"');
    expect(html).toContain("sm:grid-cols-4");
    expect(html).toContain("농사 레벨");
    expect(html).toContain("농장 성장");
    expect(html).toContain("sticky top-16");
  });
});

describe("재배 작물 보유량", () => {
  it("씨앗 선택 카드에 씨앗과 일반 수확 작물 수를 함께 표시한다", () => {
    const html = renderToStaticMarkup(
      <AdventurerFarmPanel
        onBack={vi.fn()}
        onOpenKitchen={vi.fn()}
        onOpenLifeWorkshop={vi.fn()}
      />,
    );

    expect(html).toContain("씨앗 1,234개");
    expect(html).toContain("작물 5,678개");
    expect(html).toContain("씨앗 0개");
    expect(html).toContain("작물 0개");
  });
});

describe("재배 카드 작업 위치", () => {
  const commonProps = {
    now: 1_000,
    selectedCrop: FARM_CROPS.wheat,
    selectedCropLocked: false,
    selectedSeedCount: 3,
    busy: false,
    fertilizerBalance: 2,
    onPlant: vi.fn(),
    onHarvest: vi.fn(),
    onFertilize: vi.fn(),
  };

  it("빈 밭과 재배 중인 밭 모두 같은 높이의 두 줄 작업 영역을 유지한다", () => {
    const emptyHtml = renderToStaticMarkup(
      <FarmPlotCard
        {...commonProps}
        plot={{
          id: "plot-1",
          cropId: null,
          plantedAt: null,
          readyAt: null,
        }}
        crop={null}
      />,
    );
    const growingHtml = renderToStaticMarkup(
      <FarmPlotCard
        {...commonProps}
        plot={{
          id: "plot-1",
          cropId: "wheat",
          plantedAt: 0,
          readyAt: 2_000,
        }}
        crop={FARM_CROPS.wheat}
      />,
    );

    for (const html of [emptyHtml, growingHtml]) {
      expect(html).toContain('aria-label="밭 1 작업"');
      expect(html).toContain("min-h-[4.75rem]");
      expect(html).toContain("grid-rows-[2.25rem_2rem]");
    }
    expect(emptyHtml).toContain('aria-hidden="true"');
    expect(emptyHtml).toContain(">밀 심기<");
    expect(growingHtml).toContain(">재배 중<");
    expect(growingHtml).toContain("유기질 거름 사용");
  });
});

describe("농장 일괄 작업", () => {
  const commonProps = {
    cropName: "밀",
    harvestCount: 2,
    plantCount: 3,
    fertilizerCount: 1,
    busyAction: null,
    onHarvestAll: vi.fn(),
    onPlantAll: vi.fn(),
    onFertilizeAll: vi.fn(),
  } as const;

  it("세 일괄 작업과 현재 대상 칸 수를 표시한다", () => {
    const html = renderToStaticMarkup(
      <FarmBatchActionPanel {...commonProps} />,
    );

    expect(html).toContain('aria-label="농장 일괄 작업"');
    expect(html).toContain("모두 수확 · 2칸");
    expect(html).toContain("밀 모두 심기 · 3칸");
    expect(html).toContain("모두 비료 뿌리기 · 1칸");
    expect(html).toContain("sm:grid-cols-3");
  });

  it("대상이 없거나 다른 일괄 작업 중이면 버튼을 비활성화한다", () => {
    const noTargetHtml = renderToStaticMarkup(
      <FarmBatchActionPanel
        {...commonProps}
        harvestCount={0}
        plantCount={0}
        fertilizerCount={0}
      />,
    );
    const busyHtml = renderToStaticMarkup(
      <FarmBatchActionPanel {...commonProps} busyAction="harvest" />,
    );

    expect(noTargetHtml.match(/disabled=""/g)).toHaveLength(3);
    expect(busyHtml.match(/disabled=""/g)).toHaveLength(3);
    expect(busyHtml).toContain("모두 수확 중...");
  });
});

describe("농장 납품 정렬", () => {
  it("납품 가능한 품목을 위로 올리고 각 그룹의 기존 순서는 유지한다", () => {
    const items = [
      { id: "unavailable-a", deliverable: false },
      { id: "available-a", deliverable: true },
      { id: "unavailable-b", deliverable: false },
      { id: "available-b", deliverable: true },
    ];

    expect(
      prioritizeDeliverable(items, (item) => item.deliverable).map(
        (item) => item.id,
      ),
    ).toEqual([
      "available-a",
      "available-b",
      "unavailable-a",
      "unavailable-b",
    ]);
    expect(items.map((item) => item.id)).toEqual([
      "unavailable-a",
      "available-a",
      "unavailable-b",
      "available-b",
    ]);
  });
});
