import { describe, expect, it } from "vitest";
import { shouldShowStaminaBar } from "./staminaBarVisibility";

describe("shouldShowStaminaBar", () => {
  it.each([
    "/",
    "/battle/dungeon",
    "/battle/dungeon/12",
    "/battle/coop",
    "/battle/coop/shop",
    "/battle/mastery-tower",
    "/battle/mastery-tower/battle",
    "/battle/arena",
    "/battle/arena/match",
    "/battle/storm-expedition",
    "/battle/storm-expedition/result",
  ])("지정 화면에서는 표시한다: %s", (pathname) => {
    expect(shouldShowStaminaBar(pathname)).toBe(true);
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
