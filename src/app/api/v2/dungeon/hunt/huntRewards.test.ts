import { describe, expect, it } from "vitest";
import { applyChargeRestore } from "./huntRewards";

describe("applyChargeRestore", () => {
  it("HP가 0이어도 보유 충전량으로 자동 회복한다", () => {
    const result = applyChargeRestore({
      afterHp: 0,
      afterMp: 10,
      maxHp: 100,
      maxMp: 20,
      hpCharges: 60,
      mpCharges: 0,
    });

    expect(result.afterHp).toBe(60);
    expect(result.hpCharges).toBe(0);
  });
});
