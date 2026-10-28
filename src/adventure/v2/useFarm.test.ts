import { describe, expect, it } from "vitest";
import { farmErrorMessage } from "./useFarm";

describe("농장 오류 문구", () => {
  it("요청 제한은 잠시 뒤 다시 시도하라고 안내한다", () => {
    expect(farmErrorMessage(new Error("rate_limited"))).toBe(
      "요청이 너무 많아 잠시 멈췄습니다. 잠시 후 다시 시도해 주세요.",
    );
  });
});
