import { describe, expect, it } from "vitest";
import { gameTabForPath } from "./gameTabForPath";

describe("게임 경로의 메인 탭 분류", () => {
  it.each([
    "/map",
    "/town/life-workshop",
    "/town/farm",
    "/town/fishing/tournament",
    "/town/logging",
    "/town/mining",
    "/town/kitchen",
  ])("%s를 생활 탭으로 분류한다", (path) => {
    expect(gameTabForPath(path)).toBe("life");
  });

  it("나머지 마을 시설은 마을 탭으로 유지한다", () => {
    expect(gameTabForPath("/town/bank")).toBe("town");
    expect(gameTabForPath("/town/smithy")).toBe("town");
  });
});
