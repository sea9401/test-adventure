import { describe, it, expect } from "vitest";
import { derivePowerScore, V2_POWER_WEIGHT } from "./power";

describe("v2 콘텐츠 파워 지표", () => {
  it("derivePowerScore — 공격/방어 1.0 + HP·MP ×0.1 + SPD ×0.5, 정수", () => {
    // atk20 + magicAtk0 + def10 + maxHp200×0.1(20) + spd30×0.5(15) + maxMp0 = 65
    expect(
      derivePowerScore({ atk: 20, def: 10, spd: 30, maxHp: 200 }),
    ).toBe(65);
  });

  it("magicAtk·maxMp 도 합산 (마법 빌드)", () => {
    // atk0 + magicAtk40 + def8 + maxHp180×0.1(18) + spd24×0.5(12) + maxMp120×0.1(12) = 90
    expect(
      derivePowerScore({
        atk: 0,
        magicAtk: 40,
        def: 8,
        spd: 24,
        maxHp: 180,
        maxMp: 120,
      }),
    ).toBe(90);
  });

  it("magicAtk/maxMp 미지정은 0 취급", () => {
    expect(derivePowerScore({ atk: 0, def: 0, spd: 0, maxHp: 0 })).toBe(0);
  });

  it("가중치 상수 노출 — 캘리브 다이얼(PR-9)", () => {
    expect(V2_POWER_WEIGHT.hp).toBe(0.1);
    expect(V2_POWER_WEIGHT.spd).toBe(0.5);
    expect(V2_POWER_WEIGHT.mp).toBe(0.1);
  });
});
