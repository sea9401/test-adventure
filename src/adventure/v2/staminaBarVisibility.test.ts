import { describe, expect, it } from "vitest";
import { shouldShowStaminaBar } from "./staminaBarVisibility";

describe("shouldShowStaminaBar", () => {
  it.each([
    "/battle/dungeon",
    "/battle/dungeon/12",
  ])("스태미나를 계속 쓰는 사냥터에서만 표시한다: %s", (pathname) => {
    expect(shouldShowStaminaBar(pathname)).toBe(true);
  });

  it.each([
    "/battle/coop",
    "/battle/coop/shop",
    "/battle/mastery-tower",
    "/battle/mastery-tower/battle",
    "/battle/arena",
    "/battle/arena/match",
    "/battle/storm-expedition",
    "/battle/storm-expedition/result",
  ])("상단 바와 겹치는 다른 전투 화면에서는 숨긴다: %s", (pathname) => {
    expect(shouldShowStaminaBar(pathname)).toBe(false);
  });

  it("홈에서는 편집 가능한 위젯과 중복되지 않도록 공용 바를 숨긴다", () => {
    expect(shouldShowStaminaBar("/")).toBe(false);
  });

  it.each([
    "/battle",
    "/battle/sparring",
    "/battle/grid-dungeon",
    "/battle/subjugation",
    "/battle/arena-old",
    "/map",
    "/town",
    "/town/fishing",
    "/character",
    "/quests",
    "/guild",
    "/plaza",
  ])("그 밖의 화면에서는 숨긴다: %s", (pathname) => {
    expect(shouldShowStaminaBar(pathname)).toBe(false);
  });
});
