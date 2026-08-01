import { describe, expect, it } from "vitest";
import { dungeonFloorBackHref } from "./dungeonNavigation";

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
