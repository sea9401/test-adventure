import { describe, expect, it } from "vitest";
import {
  dungeonFloorBackHref,
  normalHuntFloorHref,
  rareMapEntryHref,
} from "./dungeonNavigation";

describe("dungeonFloorBackHref", () => {
  it("일반 사냥은 현재 테마의 깊이 선택으로 돌아간다", () => {
    expect(dungeonFloorBackHref(10, null)).toBe(
      "/battle/dungeon?openDepth=7",
    );
  });

  it("레어맵 사냥은 열린 레어맵이 모인 사냥터 메인으로 돌아간다", () => {
    expect(dungeonFloorBackHref(10, "rare-map-1")).toBe("/battle/dungeon");
  });
});

describe("normalHuntFloorHref", () => {
  it("희귀 탐사 깊이를 같은 지역의 일반 사냥 대표 층 주소로 바꾼다", () => {
    expect(normalHuntFloorHref(10)).toBe("/battle/dungeon/10");
    expect(normalHuntFloorHref(9)).toBe("/battle/dungeon/10");
  });
});

describe("rareMapEntryHref", () => {
  it("희귀 탐사는 발견 깊이와 iid가 포함된 사냥 주소를 만든다", () => {
    expect(
      rareMapEntryHref({ iid: "rm /1", kind: "worn_map", depth: 12 }),
    ).toBe("/battle/dungeon/12?rareMap=rm%20%2F1");
  });

  it("희귀 장소는 각 전용 화면 주소를 만든다", () => {
    expect(
      rareMapEntryHref({ iid: "shop-1", kind: "secret_shop_map", depth: 2 }),
    ).toBe("/hidden/shop?map=shop-1");
    expect(
      rareMapEntryHref({ iid: "rename-1", kind: "rename_map", depth: 2 }),
    ).toBe("/hidden/rename?map=rename-1");
  });
});
