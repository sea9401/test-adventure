import { describe, expect, it } from "vitest";
import { canApplyShock, enterShockAction } from "./shockAction";

describe("감전 행동 상태", () => {
  it("평상시에는 감전을 부여할 수 있다", () => {
    expect(canApplyShock(undefined)).toBe(true);
  });

  it("대기 중 감전은 다음 행동 묶음을 건너뛰고 면역으로 바뀐다", () => {
    expect(enterShockAction("pending")).toEqual({
      skip: true,
      next: "immune",
    });
  });

  it("면역 상태에서는 한 행동을 정상 수행한 뒤 다시 감전 가능 상태가 된다", () => {
    expect(canApplyShock("immune")).toBe(false);
    expect(enterShockAction("immune")).toEqual({
      skip: false,
      next: undefined,
    });
  });

  it("감전 대기 중에는 중복 부여할 수 없다", () => {
    expect(canApplyShock("pending")).toBe(false);
  });
});
