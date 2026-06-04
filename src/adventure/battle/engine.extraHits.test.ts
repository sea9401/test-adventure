// 추가타(그림자 분신/군단, 무피해 난무) 에 본인 빌드 on-hit 효과 적용 회귀.
// 본타 정체성(크리/강공격/충돌파/약점/연참/암살/AP 스킬/AP +1) 은 여전히 미적용.
//
// 실행: npm test -- src/adventure/v2/combat/engine.extraHits.test.ts

import { describe, expect, it } from "vitest";
import { advanceTurn, initialBattleState, type PlayerCombat } from "../v2/combat/engine";
import type { Monster } from "../data/monsters";

const PLAYER: PlayerCombat = {
  hp: 100,
  maxHp: 100,
  atk: 10,
  def: 5,
  spd: 10,
  evasionPct: 0,
  attackCount: 1,
};

function enemy(hp = 100): Monster {
  return { name: "적", tags: ["beast"], hp, atk: 8, def: 3, spd: 5, exp: 5 };
}

describe("추가타 on-hit — 출혈", () => {
  it("그림자 분신이 출혈 스택을 누적한다 (본타 1 + 분신 1 = 2)", () => {
    const p: PlayerCombat = {
      ...PLAYER,
      bleedDmgPerStack: 3,
      shadowCloneAtkPct: 50,
    };
    let s = initialBattleState(p, enemy(100), "용사");
    s = advanceTurn(s, p, "용사"); // 본타 + 분신 1회
    expect(s.stacks.bleedStacks).toBe(2);
  });

  it("그림자 군단 (분신 +1 = 2회) 도 각 hit 가 출혈 +1", () => {
    const p: PlayerCombat = {
      ...PLAYER,
      bleedDmgPerStack: 3,
      shadowCloneAtkPct: 50,
      shadowLegionExtraClones: 1,
    };
    let s = initialBattleState(p, enemy(100), "용사");
    s = advanceTurn(s, p, "용사"); // 본타 + 분신×2 = 3
    expect(s.stacks.bleedStacks).toBe(3);
  });

  it("무피해 난무 추가타도 각 hit 가 출혈 +1", () => {
    const p: PlayerCombat = {
      ...PLAYER,
      bleedDmgPerStack: 3,
      flurryAttacks: 2,
    };
    let s = initialBattleState(p, enemy(100), "용사");
    s = advanceTurn(s, p, "용사"); // 본타 + 난무×2 = 3
    expect(s.stacks.bleedStacks).toBe(3);
  });
});

describe("추가타 on-hit — 흡혈류", () => {
  it("행운의 흡혈 — 분신 데미지의 N% 회복", () => {
    // PLAYER hp 100 → 1 데미지 받으려고 PLAYER def 낮춰서. 일단 PLAYER 그대로 두고
    // 적 데미지로 잃은 hp 확인.
    const p: PlayerCombat = {
      ...PLAYER,
      hp: 50, // 회복 가시화 위해 50으로 시작.
      shadowCloneAtkPct: 100, // 분신 데미지 = 본타와 비슷 (atk 10 vs def 3 = 7).
      luckyLifestealPct: 100, // 데미지 100% 회복 — 결정적 검증.
    };
    let s = initialBattleState(p, enemy(100), "용사");
    s = advanceTurn(s, p, "용사");
    // 본타 7 회복 (행운의 흡혈) + 분신 7 회복 (행운의 흡혈) → 50 + 14 = 64, max 100.
    expect(s.playerHp).toBe(64);
  });

  it("크리 기반 흡혈 (lifestealCritHealPct) 은 분신에 안 붙는다 (분신 크리 안 굴림)", () => {
    const p: PlayerCombat = {
      ...PLAYER,
      hp: 50,
      shadowCloneAtkPct: 100,
      lifestealCritHealPct: 100, // 크리 시 100% 회복 — 분신은 크리 안 굴리므로 0.
      critChancePct: 0, // 본타도 크리 안 나게.
    };
    let s = initialBattleState(p, enemy(100), "용사");
    s = advanceTurn(s, p, "용사");
    expect(s.playerHp).toBe(50); // 회복 없음.
  });
});

describe("추가타 on-hit — 행운의 별 (확률 100% 강제)", () => {
  it("분신 데미지에도 ×배수 적용", () => {
    // LUCKY_STAR_DAMAGE_MULT 정확값은 import 안 해도 검증 — 본타와 분신 둘 다 ×배수 되니
    // (본타 데미지 + 분신 데미지) 가 둘 다 같은 배수로 곱해진 값을 확인.
    const p: PlayerCombat = {
      ...PLAYER,
      shadowCloneAtkPct: 100, // 본타와 분신 데미지 동일 (둘 다 7).
      luckyStarChancePct: 100, // 100% 발동.
    };
    let s = initialBattleState(p, enemy(100), "용사");
    s = advanceTurn(s, p, "용사");
    // 본타 7 × 배수 + 분신 7 × 배수 = 14 × LUCKY_STAR_DAMAGE_MULT
    // 정확한 값 검증은 LUCKY_STAR_DAMAGE_MULT 변경에 종속이라, 그냥 "분신 데미지가 같은 배수로 늘었는지" 확인:
    // luckyStarChancePct=0 일 때 vs 100 일 때 비교.
    const pNoLuck: PlayerCombat = { ...p, luckyStarChancePct: 0 };
    let s2 = initialBattleState(pNoLuck, enemy(100), "용사");
    s2 = advanceTurn(s2, pNoLuck, "용사");
    const baseDmg = 100 - s2.enemyHp; // 14 (본타 7 + 분신 7).
    const luckyDmg = 100 - s.enemyHp;
    // 본타·분신 둘 다 ×배수 되어 같은 비율. 단순 본타만 적용되었으면 비율 < 2.0 였을 것.
    expect(luckyDmg).toBeGreaterThan(baseDmg);
    // 본타만 ×배수면 ratio < (mult+1)/2 ≈ (1.5+1)/2 = 1.25 정도. 둘 다 적용이면 mult 그대로 (1.5).
    expect(luckyDmg / baseDmg).toBeGreaterThan(1.3);
  });
});

describe("추가타 on-hit — 천명 (확률 100% 강제)", () => {
  it("분신 hit 도 천명을 굴려 추가 데미지", () => {
    const p: PlayerCombat = {
      ...PLAYER,
      shadowCloneAtkPct: 100,
      heavenDecreeChancePct: 100,
    };
    let s = initialBattleState(p, enemy(100), "용사");
    s = advanceTurn(s, p, "용사");
    // 천명 미보유 baseline 과 비교.
    const pNoDecree: PlayerCombat = { ...p, heavenDecreeChancePct: 0 };
    let s2 = initialBattleState(pNoDecree, enemy(100), "용사");
    s2 = advanceTurn(s2, pNoDecree, "용사");
    expect(100 - s.enemyHp).toBeGreaterThan(100 - s2.enemyHp);
  });
});

