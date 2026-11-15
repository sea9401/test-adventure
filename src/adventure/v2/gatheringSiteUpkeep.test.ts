import { describe, expect, it } from "vitest";
import {
  GATHERING_PIONEER_TITLE_ID,
  GATHERING_SITE_MASTER_TITLE_ID,
  TITLES,
} from "@/adventure/data/titles";
import { MINING_MATERIAL_ID } from "@/adventure/data/v2/miningSpots";
import { WOODCUTTING_MATERIAL_ID } from "@/adventure/data/v2/woodcuttingSpots";
import {
  GATHERING_SITES,
  GATHERING_SITE_BASE_MAX_STAGE,
  GATHERING_SITE_MASTER_STAGE,
  GATHERING_SITE_TITLE_TOTAL_STAGE,
  GatheringSiteUpkeepError,
  gatheringSiteBlockReason,
  gatheringSiteCost,
  gatheringSiteEarnedTitleIds,
  gatheringSiteExtendedDurationMs,
  gatheringSiteStage,
  gatheringSiteTotalStage,
  isGatheringSiteId,
  parseGatheringSiteUpkeep,
  upkeepGatheringSite,
  type GatheringSiteId,
  type GatheringSiteUpkeepContext,
  type GatheringSiteUpkeepState,
} from "./gatheringSiteUpkeep";
import { LIFE_MAJOR_PRODUCT_ID } from "./lifeMajorProducts";

const MINUTE = 60_000;
const ALL_IDS = GATHERING_SITES.map((site) => site.id);

function context(
  materials: Record<string, number> = {},
  masterUnlocked: Partial<GatheringSiteUpkeepContext["masterUnlocked"]> = {},
): GatheringSiteUpkeepContext {
  return {
    materials,
    masterUnlocked: { mining: false, woodcutting: false, ...masterUnlocked },
  };
}

function allAt(stage: number): GatheringSiteUpkeepState {
  return Object.fromEntries(ALL_IDS.map((id) => [id, stage]));
}

describe("채집지 구성", () => {
  it("광맥 6곳 뒤에 숲 6곳을 등급순으로 둔다", () => {
    expect(GATHERING_SITES.map((site) => [site.id, site.activity, site.grade])).toEqual([
      ["iron", "mining", 1],
      ["copper", "mining", 2],
      ["silver", "mining", 3],
      ["gold", "mining", 4],
      ["mythril", "mining", 5],
      ["adamantite", "mining", 6],
      ["pine", "woodcutting", 1],
      ["birch", "woodcutting", 2],
      ["willow", "woodcutting", 3],
      ["oak", "woodcutting", 4],
      ["cedar", "woodcutting", 5],
      ["cypress", "woodcutting", 6],
    ]);
    expect(GATHERING_SITES[0]).toMatchObject({
      name: "철 광맥",
      materialId: MINING_MATERIAL_ID.iron,
      materialName: "철광석",
    });
    expect(GATHERING_SITES[6]).toMatchObject({
      name: "소나무숲",
      materialId: WOODCUTTING_MATERIAL_ID.pine,
    });
    expect(isGatheringSiteId("cypress")).toBe(true);
    expect(isGatheringSiteId("stone")).toBe(false);
    expect(isGatheringSiteId(3)).toBe(false);
  });
});

describe("비용과 작업 시간", () => {
  it("철 광맥은 1회분 640으로 3·8·15·25·40·60회분이 든다", () => {
    expect(
      [1, 2, 3, 4, 5, 6].map((stage) => gatheringSiteCost("iron", stage)?.materials),
    ).toEqual([1_920, 5_120, 9_600, 16_000, 25_600, 38_400]);
    expect(gatheringSiteCost("iron", 1)).toEqual({
      materialId: MINING_MATERIAL_ID.iron,
      materials: 1_920,
      byproductId: MINING_MATERIAL_ID.stone,
      byproducts: 200,
      masterProductId: LIFE_MAJOR_PRODUCT_ID.mining,
      masterProducts: 0,
    });
  });

  it("부산물은 단계에 따라 돌·석탄·원석 보석으로 바뀐다", () => {
    expect(
      [1, 2, 3, 4, 5, 6].map((stage) => {
        const cost = gatheringSiteCost("gold", stage)!;
        return [cost.byproductId, cost.byproducts];
      }),
    ).toEqual([
      [MINING_MATERIAL_ID.stone, 200],
      [MINING_MATERIAL_ID.stone, 400],
      [MINING_MATERIAL_ID.coal, 250],
      [MINING_MATERIAL_ID.coal, 500],
      [MINING_MATERIAL_ID.roughGem, 400],
      [MINING_MATERIAL_ID.roughGem, 600],
    ]);
  });

  it("숲의 명장 정비는 명장 목재를 쓴다", () => {
    expect(gatheringSiteCost("cypress", GATHERING_SITE_MASTER_STAGE)).toEqual({
      materialId: WOODCUTTING_MATERIAL_ID.cypress,
      materials: 13_200,
      byproductId: MINING_MATERIAL_ID.roughGem,
      byproducts: 600,
      masterProductId: LIFE_MAJOR_PRODUCT_ID.woodcutting,
      masterProducts: 20,
    });
    expect(gatheringSiteCost("cypress", 0)).toBeNull();
    expect(gatheringSiteCost("cypress", 7)).toBeNull();
    expect(gatheringSiteCost("cypress", 1.5)).toBeNull();
  });

  it("12곳 5단계까지 원자재 합계는 447,720개다", () => {
    const total = ALL_IDS.reduce(
      (sum, id) =>
        sum +
        [1, 2, 3, 4, 5].reduce(
          (siteSum, stage) => siteSum + gatheringSiteCost(id, stage)!.materials,
          0,
        ),
      0,
    );
    expect(total).toBe(447_720);
  });

  it("느긋한 작업 시간은 2시간에서 3시간 30분까지 늘어난다", () => {
    expect(
      [0, 1, 2, 3, 4, 5, 6].map((stage) => gatheringSiteExtendedDurationMs(stage) / MINUTE),
    ).toEqual([120, 132, 144, 156, 168, 180, 210]);
    // 범위를 벗어난 단계는 0~6으로 맞춘다.
    expect(gatheringSiteExtendedDurationMs(99) / MINUTE).toBe(210);
    expect(gatheringSiteExtendedDurationMs(-3) / MINUTE).toBe(120);
    expect(gatheringSiteExtendedDurationMs(Number.NaN) / MINUTE).toBe(120);
  });
});

describe("세이브 파싱", () => {
  it("모르는 id와 0단계를 버리고 단계를 0~6으로 맞춘다", () => {
    expect(
      parseGatheringSiteUpkeep({
        iron: 3,
        pine: 99,
        oak: 2.9,
        gold: 0,
        silver: -1,
        cedar: "4",
        stone: 5,
      }),
    ).toEqual({ iron: 3, pine: 6, oak: 2 });
    expect(parseGatheringSiteUpkeep(null)).toEqual({});
    expect(parseGatheringSiteUpkeep([1, 2])).toEqual({});
    expect(gatheringSiteStage({ iron: 3 }, "iron")).toBe(3);
    expect(gatheringSiteStage({}, "iron")).toBe(0);
  });
});

describe("정비", () => {
  const ironStage1 = {
    [MINING_MATERIAL_ID.iron]: 1_920,
    [MINING_MATERIAL_ID.stone]: 200,
  };

  it("원자재, 부산물 순으로 모자란 것을 알린다", () => {
    expect(gatheringSiteBlockReason({}, "iron", context())).toBe("not_enough_materials");
    expect(
      gatheringSiteBlockReason({}, "iron", context({ [MINING_MATERIAL_ID.iron]: 1_920 })),
    ).toBe("not_enough_byproducts");
    expect(gatheringSiteBlockReason({}, "iron", context(ironStage1))).toBeNull();
  });

  it("정확히 필요한 만큼 있으면 정비되고 다 쓴 재료는 남기지 않는다", () => {
    const done = upkeepGatheringSite({ pine: 2 }, "iron", context({ ...ironStage1, other: 7 }));
    expect(done.state).toEqual({ pine: 2, iron: 1 });
    expect(done.materials).toEqual({ other: 7 });
    expect(done.result).toMatchObject({
      siteId: "iron",
      siteName: "철 광맥",
      stage: 1,
      extendedDurationMs: 132 * MINUTE,
    });
  });

  it("모자라면 사유를 담아 던지고 아무것도 바꾸지 않는다", () => {
    const state = { iron: 1 };
    try {
      upkeepGatheringSite(state, "iron", context({ [MINING_MATERIAL_ID.iron]: 5_119 }));
      throw new Error("정비되면 안 된다");
    } catch (error) {
      expect(error).toBeInstanceOf(GatheringSiteUpkeepError);
      expect((error as GatheringSiteUpkeepError).code).toBe("not_enough_materials");
    }
    expect(state).toEqual({ iron: 1 });
  });

  it("6단계는 그 생활의 명장 정비가 열려야 하고 명장 산물이 든다", () => {
    const rich = {
      [MINING_MATERIAL_ID.adamantite]: 13_200,
      [WOODCUTTING_MATERIAL_ID.cypress]: 13_200,
      [MINING_MATERIAL_ID.roughGem]: 1_200,
      [LIFE_MAJOR_PRODUCT_ID.mining]: 20,
      [LIFE_MAJOR_PRODUCT_ID.woodcutting]: 19,
    };
    const state = { adamantite: 5, cypress: 5 };
    // 채광 주전공은 숲의 6단계를 열지 못한다.
    expect(gatheringSiteBlockReason(state, "cypress", context(rich, { mining: true }))).toBe(
      "upkeep_master_locked",
    );
    expect(gatheringSiteBlockReason(state, "adamantite", context(rich))).toBe(
      "upkeep_master_locked",
    );
    expect(
      gatheringSiteBlockReason(state, "cypress", context(rich, { woodcutting: true })),
    ).toBe("not_enough_master_product");

    const done = upkeepGatheringSite(state, "adamantite", context(rich, { mining: true }));
    expect(done.state.adamantite).toBe(GATHERING_SITE_MASTER_STAGE);
    expect(done.materials[LIFE_MAJOR_PRODUCT_ID.mining]).toBeUndefined();
    expect(done.materials[MINING_MATERIAL_ID.roughGem]).toBe(600);
    expect(done.result.extendedDurationMs).toBe(210 * MINUTE);
    expect(
      gatheringSiteBlockReason(done.state, "adamantite", context(rich, { mining: true })),
    ).toBe("upkeep_max");
  });
});

describe("칭호", () => {
  it("단계 합계 24면 개척자, 12곳 모두 5단계면 산과 숲의 주인", () => {
    expect(TITLES[GATHERING_PIONEER_TITLE_ID].name).toBe("개척자");
    expect(TITLES[GATHERING_SITE_MASTER_TITLE_ID].name).toBe("산과 숲의 주인");
    expect(GATHERING_SITE_TITLE_TOTAL_STAGE).toBe(24);

    expect(gatheringSiteTotalStage(allAt(2))).toBe(24);
    expect(gatheringSiteEarnedTitleIds(allAt(2))).toEqual([GATHERING_PIONEER_TITLE_ID]);
    expect(gatheringSiteEarnedTitleIds({ iron: 6, copper: 6, silver: 6, gold: 5 })).toEqual([]);

    const oneShort = { ...allAt(GATHERING_SITE_BASE_MAX_STAGE), cypress: 4 } as Record<
      GatheringSiteId,
      number
    >;
    expect(gatheringSiteEarnedTitleIds(oneShort)).toEqual([GATHERING_PIONEER_TITLE_ID]);
    expect(gatheringSiteEarnedTitleIds(allAt(GATHERING_SITE_BASE_MAX_STAGE))).toEqual([
      GATHERING_PIONEER_TITLE_ID,
      GATHERING_SITE_MASTER_TITLE_ID,
    ]);
  });
});
