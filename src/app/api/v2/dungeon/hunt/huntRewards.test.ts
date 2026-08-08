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

  it("설정한 목표 체력까지만 HP 충전약을 사용한다", () => {
    const result = applyChargeRestore({
      afterHp: 20,
      afterMp: 10,
      maxHp: 101,
      maxMp: 20,
      hpCharges: 100,
      mpCharges: 0,
      hpTargetPct: 50,
    });

    expect(result.afterHp).toBe(51);
    expect(result.hpCharges).toBe(69);
  });

  it("현재 체력이 목표 이상이면 HP 충전약을 사용하지 않는다", () => {
    const result = applyChargeRestore({
      afterHp: 70,
      afterMp: 10,
      maxHp: 100,
      maxMp: 20,
      hpCharges: 100,
      mpCharges: 0,
      hpTargetPct: 50,
    });

    expect(result.afterHp).toBe(70);
    expect(result.hpCharges).toBe(100);
  });
});
