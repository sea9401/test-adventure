import { describe, expect, it } from "vitest";
import {
  earliestEnvironmentRefreshDelay,
  environmentRefreshDelay,
} from "./lifeFieldRefresh";

describe("environmentRefreshDelay", () => {
  it("환경 종료 1초 뒤 한 번 갱신하도록 남은 시간을 계산한다", () => {
    expect(environmentRefreshDelay(10_000, 70_000)).toBe(61_000);
  });

  it("이미 종료된 환경은 최소 1초 뒤 갱신한다", () => {
    expect(environmentRefreshDelay(80_000, 70_000)).toBe(1_000);
  });
});

describe("earliestEnvironmentRefreshDelay", () => {
  it("full 응답에 포함된 환경 중 가장 이른 종료 시각을 사용한다", () => {
    expect(
      earliestEnvironmentRefreshDelay(10_000, [130_000, 70_000, 190_000]),
    ).toBe(61_000);
  });

  it("유효한 환경 종료 시각이 없으면 타이머를 만들지 않는다", () => {
    expect(earliestEnvironmentRefreshDelay(10_000, [])).toBeNull();
  });
});
