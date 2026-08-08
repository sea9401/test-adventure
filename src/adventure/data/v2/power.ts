// v2 콘텐츠 파워 지표 (docs/v2-proficiency-redesign.md §8).
// 레벨이 전직마다 1로 리셋되는 prestige 루프라 "레벨"은 진척 척도로 무의미해진다.
// 대신 derive 합성 스탯-파워를 던전 층의 권장 강도 지표로 쓴다(파워는 floor/장비로 영구 진척).
//
// 단일 소스 — state 라우트가 플레이어 combat 에서 surface(combat.power)하고, sim(PR-9)이
// 같은 함수로 층별 권장 파워(dungeon.ts requirement.min)를 캘리브한다.
// 가중치는 잠정(PR-9 캘리브 대상): 공격/방어 1.0, 생존(HP)·자원(MP) 0.1,
// 템포(SPD) 0.5, 회피도 0.45, 적중도 0.35. 실제 전투에서 대체 관계인 물공·마공은
// 단순 합산하지 않고, 속도·레이팅은 전투의 점감 구간을 반영한다.

export type V2PowerInput = {
  atk: number;
  magicAtk?: number;
  def: number;
  spd: number;
  maxHp: number;
  maxMp?: number;
  magicBarrierMax?: number;
  evaRating?: number;
  accRating?: number;
};

export const V2_POWER_WEIGHT = {
  hp: 0.1, // maxHp → 생존
  spd: 0.5, // spd → 다중공격·선공 템포
  mp: 0.1, // maxMp → 자원(마법 빌드)
  magicBarrier: 0.03, // 전투별 유한 내구도이며 직접 피해 일부만 흡수하므로 HP보다 보수적으로 반영
  evasion: 0.45, // 회피도 → 직접 피해 경감 생존력
  accuracy: 0.35, // 적중도 → 상대 회피 경감 상쇄
} as const;

// ATB 행동 빈도가 최대치에 도달하는 SPD. 그 이후 원본 SPD를 전투력에 계속 더하지 않는다.
export const POWER_SPD_CAP = 576;
// 회피·적중 레이팅은 상대 수치와 겨루는 점근식이므로 표시 전투력도 같은 성격의 소프트캡을 쓴다.
export const POWER_RATING_SOFTCAP = 5_000;
export const SECONDARY_ATTACK_POWER_WEIGHT = 0.25;

export function effectiveAttackPowerForScore(
  physicalAttack: number,
  magicAttack: number,
): number {
  const physical = Math.max(0, physicalAttack);
  const magic = Math.max(0, magicAttack);
  return (
    Math.max(physical, magic) +
    Math.min(physical, magic) * SECONDARY_ATTACK_POWER_WEIGHT
  );
}

export function effectiveRatingForPower(rating: number): number {
  const value = Math.max(0, rating);
  return POWER_RATING_SOFTCAP * (1 - Math.exp(-value / POWER_RATING_SOFTCAP));
}

// 합성 파워 점수(정수). 주 공격축 + 보조 공격축 25% + 방어 + 생존(maxHp×0.1)
//   + 상한 반영 템포 + 자원(MP·마나 실드) + 점감된 회피·적중 레이팅.
// 서로 대체되는 공격축의 이중 계산과 전투 상한 이후 원시 수치의 과대평가를 막는다.
export function derivePowerScore(c: V2PowerInput): number {
  return Math.round(
    effectiveAttackPowerForScore(c.atk, c.magicAtk ?? 0) +
      c.def +
      c.maxHp * V2_POWER_WEIGHT.hp +
      Math.min(POWER_SPD_CAP, Math.max(0, c.spd)) * V2_POWER_WEIGHT.spd +
      (c.maxMp ?? 0) * V2_POWER_WEIGHT.mp +
      (c.magicBarrierMax ?? 0) * V2_POWER_WEIGHT.magicBarrier +
      effectiveRatingForPower(c.evaRating ?? 0) * V2_POWER_WEIGHT.evasion +
      effectiveRatingForPower(c.accRating ?? 0) * V2_POWER_WEIGHT.accuracy,
  );
}
