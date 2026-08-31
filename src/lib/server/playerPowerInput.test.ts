import { describe, expect, it } from "vitest";
import { powerInputFromPlayer } from "./playerPowerInput";

describe("powerInputFromPlayer", () => {
  it("전투력에 사용하는 마법·치명·생존·회복 필드를 빠짐없이 옮긴다", () => {
    expect(
      powerInputFromPlayer(
        {
          atk: 100,
          magicAtk: 200,
          def: 30,
          magicDef: 70,
          spd: 40,
          magicBarrierMax: 500,
          evaRating: 60,
          accRating: 80,
          critChancePct: 25,
          critMult: 1.8,
          passiveDamageTakenReductionPct: 12,
          healMult: 2.5,
        },
        1_000,
        600,
      ),
    ).toEqual({
      atk: 100,
      magicAtk: 200,
      def: 30,
      magicDef: 70,
      spd: 40,
      maxHp: 1_000,
      maxMp: 600,
      magicBarrierMax: 500,
      evaRating: 60,
      accRating: 80,
      critChancePct: 25,
      critMult: 1.8,
      damageTakenReductionPct: 12,
      healMult: 2.5,
    });
  });
});
