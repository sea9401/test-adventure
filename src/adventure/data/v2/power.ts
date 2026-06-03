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
  // 마법 방어력 — 마법 데미지 경감 축(정신·지능·장신구). SIM-핸드오프 §C-1: 없으면 신술(SPI)이
  // 파워식·sim 양쪽서 깎여 전 캘리브 오염. def 와 병렬(가중 1.0).
  magicDef?: number;
  spd: number;
  maxHp: number;
  maxMp?: number;
  // 치명 저항(%p) — 정신. 피격 시 상대 치명 확률 차감. 생존 보조라 def 의 절반 가중.
  critResistPct?: number;
};

export const V2_POWER_WEIGHT = {
  hp: 0.1, // maxHp → 생존
  spd: 0.5, // spd → 다중공격·선공 템포
  mp: 0.1, // maxMp → 자원(마법 빌드)
  // SIM-핸드오프 §D 시드 — magicDef ×1.0 (def 병렬), critResist ×0.5 (spd 병렬, 생존 보조).
  magicDef: 1.0, // magicDef → 마법 방어 (물리 def 와 동일 가중)
  critResist: 0.5, // critResistPct → 치명 저항 (생존 보조)
} as const;

// 합성 파워 점수(정수). 공격(atk+magicAtk) + 방어(def + magicDef×1.0) + 생존(maxHp×0.1)
//   + 템포(spd×0.5) + 자원(maxMp×0.1) + 치명저항(critResistPct×0.5).
//   빌드 전반(물리/마법/탱/속도/저항)을 한 축으로 환산.
export function derivePowerScore(c: V2PowerInput): number {
  return Math.round(
    c.atk +
      (c.magicAtk ?? 0) +
      c.def +
      (c.magicDef ?? 0) * V2_POWER_WEIGHT.magicDef +
      c.maxHp * V2_POWER_WEIGHT.hp +
      c.spd * V2_POWER_WEIGHT.spd +
      (c.maxMp ?? 0) * V2_POWER_WEIGHT.mp +
      (c.critResistPct ?? 0) * V2_POWER_WEIGHT.critResist,
  );
}
