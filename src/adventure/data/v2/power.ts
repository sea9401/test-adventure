// v2 콘텐츠 파워 지표 (docs/v2-proficiency-redesign.md §8).
// 레벨이 전직마다 1로 리셋되는 prestige 루프라 "레벨"은 진척 척도로 무의미해진다.
// 대신 derive 합성 스탯-파워를 던전 층의 권장 강도 지표로 쓴다(파워는 floor/장비로 영구 진척).
//
// 단일 소스 — state 라우트가 플레이어 combat 에서 surface(combat.power)하고, sim(PR-9)이
// 같은 함수로 층별 권장 파워(dungeon.ts requirement.min)를 캘리브한다.
// 가중치는 잠정(PR-9 캘리브 대상): 공격/방어 1.0, 생존(HP)·자원(MP) 0.1, 템포(SPD) 0.5.

export type V2PowerInput = {
  atk: number;
  magicAtk?: number;
  def: number;
  spd: number;
  maxHp: number;
  maxMp?: number;
};

export const V2_POWER_WEIGHT = {
  hp: 0.1, // maxHp → 생존
  spd: 0.5, // spd → 다중공격·선공 템포
  mp: 0.1, // maxMp → 자원(마법 빌드)
} as const;

// 합성 파워 점수(정수). 공격(atk+magicAtk) + 방어(def) + 생존(maxHp×0.1)
//   + 템포(spd×0.5) + 자원(maxMp×0.1). 빌드 전반(물리/마법/탱/속도)을 한 축으로 환산.
export function derivePowerScore(c: V2PowerInput): number {
  return Math.round(
    c.atk +
      (c.magicAtk ?? 0) +
      c.def +
      c.maxHp * V2_POWER_WEIGHT.hp +
      c.spd * V2_POWER_WEIGHT.spd +
      (c.maxMp ?? 0) * V2_POWER_WEIGHT.mp,
  );
}
