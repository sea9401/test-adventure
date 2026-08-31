import type { V2PowerInput } from "@/adventure/data/v2/power";

export type PlayerPowerSource = {
  atk: number;
  magicAtk?: number;
  def: number;
  magicDef?: number;
  spd: number;
  magicBarrierMax?: number;
  evaRating?: number;
  accRating?: number;
  critChancePct?: number;
  critMult?: number;
  passiveDamageTakenReductionPct?: number;
  healMult?: number;
};

/** 모든 API 표면이 같은 전투력 입력을 사용하도록 PlayerCombat 필드를 한곳에서 매핑한다. */
export function powerInputFromPlayer(
  player: PlayerPowerSource,
  maxHp: number,
  maxMp: number = 0,
): V2PowerInput {
  return {
    atk: player.atk,
    magicAtk: player.magicAtk ?? 0,
    def: player.def,
    magicDef: player.magicDef ?? 0,
    spd: player.spd,
    maxHp,
    maxMp,
    magicBarrierMax: player.magicBarrierMax,
    evaRating: player.evaRating,
    accRating: player.accRating,
    critChancePct: player.critChancePct,
    critMult: player.critMult,
    damageTakenReductionPct: player.passiveDamageTakenReductionPct,
    healMult: player.healMult,
  };
}
