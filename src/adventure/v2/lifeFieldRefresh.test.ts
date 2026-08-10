import { describe, expect, it } from "vitest";
import { environmentRefreshDelay } from "./lifeFieldRefresh";

describe("environmentRefreshDelay", () => {
  it("환경 종료 1초 뒤 한 번 갱신하도록 남은 시간을 계산한다", () => {
    expect(environmentRefreshDelay(10_000, 70_000)).toBe(61_000);
  });

  it("이미 종료된 환경은 최소 1초 뒤 갱신한다", () => {
    expect(environmentRefreshDelay(80_000, 70_000)).toBe(1_000);
  });
});
