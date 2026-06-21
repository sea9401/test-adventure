// 거점 챔피언(NPC 영웅) — 점령 1대1 일기토의 NPC 상대.
//
// 16 종 = tier(1~4) × type(mine/tower/fort/village). 각자 강도 다름:
//   - 강도: tier 곡선 (1=약 ~ 4=매우 강함)
//   - 특색: type mult (광산=고hp/저atk·튼튼 / 마탑=저hp/고atk·마법 / 요새=균형·약간 hp/def↑ / 마을=평균)
//
// 라이브 resolveBattle 의 enemy:Monster 로 그대로 호출 가능.
// drops 는 빈 배열 — 점령 자체가 보상 (별도 drop 없음).

import type { Monster } from "../monsters/types";
import type { OutpostTier, OutpostType } from "./types";

const TIER_BASE: Record<
  OutpostTier,
  { hp: number; atk: number; def: number; spd: number; exp: number }
> = {
  1: { hp: 450, atk: 32, def: 18, spd: 10, exp: 80 },
  2: { hp: 900, atk: 60, def: 33, spd: 12, exp: 180 },
  3: { hp: 1600, atk: 88, def: 52, spd: 14, exp: 400 },
  4: { hp: 2800, atk: 125, def: 75, spd: 16, exp: 900 },
};

const TYPE_MULT: Record<
  OutpostType,
  { hp: number; atk: number; def: number }
> = {
  mine: { hp: 1.2, atk: 0.9, def: 1.15 }, // 광부 — 튼튼
  tower: { hp: 0.85, atk: 1.25, def: 0.9 }, // 마법사 — 고화력 저방어
  fort: { hp: 1.1, atk: 1.0, def: 1.15 }, // 기사 — 균형 + 방어
  village: { hp: 1.0, atk: 1.0, def: 1.0 }, // 일반
};

const NAME_BY: Record<OutpostType, Record<OutpostTier, string>> = {
  mine: {
    1: "광맥 우두머리",
    2: "광산 두목",
    3: "광산 군주",
    4: "광산왕",
  },
  tower: {
    1: "견습 마법사",
    2: "마탑 술사",
    3: "대마법사",
    4: "대현자",
  },
  fort: {
    1: "변경 기사",
    2: "요새 부장",
    3: "요새 사령관",
    4: "전쟁의 왕",
  },
  village: {
    1: "자경단장",
    2: "촌장",
    3: "도시 총독",
    4: "만국의 왕",
  },
};

export type Champion = Monster;

export function getChampion(type: OutpostType, tier: OutpostTier): Champion {
  const base = TIER_BASE[tier];
  const mult = TYPE_MULT[type];
  return {
    name: NAME_BY[type][tier],
    tags: type === "tower" ? ["spirit"] : ["humanoid"],
    hp: Math.round(base.hp * mult.hp),
    atk: Math.round(base.atk * mult.atk),
    def: Math.round(base.def * mult.def),
    spd: base.spd,
    exp: base.exp,
    // 회피 대결형(Slice 1) — 챔피언은 scaleMonsterForFloor 를 안 거치므로 명중을 직접 부여(없으면
    //   플레이어가 챔피언 공격을 75% 공짜 회피). tier 비례(floorAccuracy 동급 magnitude).
    accuracy: tier * 2,
    drops: [],
  };
}

// 점령 시도 비용 (스태미너) — tier 별. 강한 거점일수록 비싼 시도.
export const CLAIM_STAMINA_COST: Record<OutpostTier, number> = {
  1: 30,
  2: 50,
  3: 80,
  4: 120,
};
