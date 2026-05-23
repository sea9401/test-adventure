import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { advanceTurn, initialBattleState, type PlayerCombat } from "./engine";
import type { Monster } from "../data/monsters";

// 크리 cap 75% 도입 후, 결정적 크리 발동을 위해 Math.random 을 0 으로 모킹(이전엔
// critChancePct 100 으로 항상 발동했으나, 캡 도입으로 75% 확률 굴림이 필요해짐).
beforeEach(() => {
  vi.spyOn(Math, "random").mockReturnValue(0);
});
afterEach(() => {
  vi.restoreAllMocks();
});

// 기본: atk 10, def 5, spd 10 — 적(atk 8, def 3, spd 5)보다 빠름 → 항상 선공.
// 적 회피 0 / 추가공격 확률 0 → 결정적. damageBetween(10,3)=7, damageBetween(8,5)=3.
const PLAYER: PlayerCombat = {
  hp: 50,
  maxHp: 50,
  atk: 10,
  def: 5,
  spd: 10,
  evasionPct: 0,
  attackCount: 1,
};

function enemy(hp = 100): Monster {
  return { name: "적", tags: ["beast"], hp, atk: 8, def: 3, spd: 5, exp: 5 };
}

describe("특기 — 광전사", () => {
  it("잃은 HP 비율만큼 ATK 가산 (HP 절반 → +25%)", () => {
    const p: PlayerCombat = {
      ...PLAYER,
      hp: 25, // 50% 손실
      maxHp: 50,
      berserkAtkPctPerLostHpPct: 0.5,
    };
    let s = initialBattleState(p, enemy(100), "용사");
    s = advanceTurn(s, p, "용사"); // berserkBonus = floor(10 × 0.5 × 0.5)=2 → damageBetween(12,3)=9 → 91
    expect(s.enemyHp).toBe(91);
  });
});

describe("특기 — 암살", () => {
  it("전투 첫 공격: 적 DEF 30% 무시 + 데미지 ×2, 그 뒤 공격은 정상", () => {
    const p: PlayerCombat = { ...PLAYER, assassinateDmgMult: 2 };
    let s = initialBattleState(p, enemy(100), "용사");
    // DEF 3×0.7→round 2. damageBetween(10,2)=8, ×2 → 16 → 84.
    s = advanceTurn(s, p, "용사");
    expect(s.enemyHp).toBe(84);
    expect(s.flags.assassinateUsed).toBe(true);
    s = advanceTurn(s, p, "용사"); // 적 턴
    s = advanceTurn(s, p, "용사"); // 2턴: 암살 소진 → damageBetween(10,3)=7 → 77
    expect(s.enemyHp).toBe(77);
  });
});

describe("특기 — 질풍검", () => {
  it("턴 첫 공격에 그 턴 공격 횟수만큼 ATK 보너스", () => {
    const p: PlayerCombat = { ...PLAYER, attackCount: 2, gustAtkPerAttack: 1 };
    let s = initialBattleState(p, enemy(100), "용사");
    s = advanceTurn(s, p, "용사"); // 1타: +2(횟수2) → damageBetween(12,3)=9 → 91
    expect(s.enemyHp).toBe(91);
    s = advanceTurn(s, p, "용사"); // 2타: 보너스 없음 → damageBetween(10,3)=7 → 84
    expect(s.enemyHp).toBe(84);
  });
});

describe("특기 — 연참", () => {
  it("그 턴 크리티컬 나면 추가 공격 1회 (턴당 1회)", () => {
    const p: PlayerCombat = {
      ...PLAYER,
      critChancePct: 75,
      critMult: 2,
      riposteExtra: 1,
    };
    let s = initialBattleState(p, enemy(100), "용사");
    s = advanceTurn(s, p, "용사"); // 크리 14 → 86, 연참 발동 → 다시 player phase
    expect(s.enemyHp).toBe(86);
    expect(s.phase).toBe("player");
    expect(s.turn.riposteUsedThisTurn).toBe(true);
    s = advanceTurn(s, p, "용사"); // 연참 추가타: 크리 14 → 72, 더 이상 연참 X → 적 턴으로
    expect(s.enemyHp).toBe(72);
    expect(s.phase).toBe("enemy");
  });
});

describe("특기 — 유격", () => {
  it("회피 성공 시 다음 플레이어 턴 공격 횟수 +1", () => {
    // 회피 캡 75% 도입으로 evasionPct:100 만으로는 결정적 회피 불가 — 보장 회피로 우회.
    const p: PlayerCombat = { ...PLAYER, guaranteedEvades: 5, skirmishNextTurnBonus: 1 };
    let s = initialBattleState(p, enemy(100), "용사");
    s = advanceTurn(s, p, "용사"); // 1턴: 7 → 93, 다음 턴 선롤 playerAttacksLeft=1
    s = advanceTurn(s, p, "용사"); // 적 턴: 보장 회피 → playerAttacksLeft 1+1=2
    expect(s.playerAttacksLeft).toBe(2);
    s = advanceTurn(s, p, "용사"); // 2턴 1타: 7 → 86
    s = advanceTurn(s, p, "용사"); // 2턴 2타: 7 → 79
    expect(s.enemyHp).toBe(79);
  });
});

describe("특기 — 반사 갑주", () => {
  it("피격 시 적이 넣은 피해의 N% 를 적에게 반사", () => {
    const p: PlayerCombat = { ...PLAYER, thornsPct: 50 };
    let s = initialBattleState(p, enemy(100), "용사");
    s = advanceTurn(s, p, "용사"); // 1턴: 7 → 93
    s = advanceTurn(s, p, "용사"); // 적 턴: 적 공격 3 → 플레이어 47, 반사 floor(3×0.5)=1 → 적 92
    expect(s.playerHp).toBe(47);
    expect(s.enemyHp).toBe(92);
    expect(s.stacks.damageTakenThisCombat).toBe(3);
  });

  it("가드로 피해 0 이 되어도 pre-mit 베이스로 반사가 살아남는다", () => {
    // 적 atk 20, 플레이어 def 0 → damageBetween=20. 가드 reduction 50 → dmgToHp=0.
    // 반사 베이스는 rawDmgBeforeReduction=20 이므로 thornsPct 50 = floor(20*0.5)=10.
    const p: PlayerCombat = {
      ...PLAYER,
      thornsPct: 50,
      guard: { turns: 3, reduction: 50 },
    };
    const tough: Monster = { name: "강적", tags: ["beast"], hp: 200, atk: 20, def: 1, spd: 5, exp: 5 };
    let s = initialBattleState(p, tough, "용사");
    const beforeEnemy = s.enemyHp;
    s = advanceTurn(s, p, "용사"); // 1턴 본타
    const afterPlayer = s.playerHp;
    s = advanceTurn(s, p, "용사"); // 적 턴: 가드로 0 피해, 반사 10
    expect(s.playerHp).toBe(afterPlayer); // 피해 0
    expect(beforeEnemy - s.enemyHp).toBeGreaterThanOrEqual(10); // 본타 + 반사 10
  });
});

// ── 2티어 특기 ───────────────────────────────────────────────────────────

describe("2티어 특기 — 불굴의 일격", () => {
  it("본타에 누적 받은 피해 × 0.25 추가", () => {
    // 시나리오: 적 공격 1회 받아 누적 피해 누적 → 다음 턴 본타에 보너스.
    const p: PlayerCombat = { ...PLAYER, enduringStrikeMult: 0.25 };
    let s = initialBattleState(p, enemy(100), "용사");
    s = advanceTurn(s, p, "용사"); // 1턴 본타: 누적 0 → baseDmg=7 → 93. (보너스 없음 — 누적 0)
    s = advanceTurn(s, p, "용사"); // 적 턴: 플레이어 -3 → damageTakenThisCombat=3
    expect(s.stacks.damageTakenThisCombat).toBe(3);
    s = advanceTurn(s, p, "용사"); // 2턴 본타: floor(3*0.25)=0 → 변화 없음 → 86
    expect(s.enemyHp).toBe(86);
  });
  it("누적 피해가 4 이상 누적되면 본타에 +1 ATK 보너스", () => {
    // 더 강한 적으로 누적 피해 키움. baseDmg 9 (10-1).
    const strongEnemy: Monster = { name: "강적", tags: ["beast"], hp: 100, atk: 12, def: 1, spd: 5, exp: 5 };
    const p: PlayerCombat = { ...PLAYER, enduringStrikeMult: 0.25 };
    let s = initialBattleState(p, strongEnemy, "용사");
    s = advanceTurn(s, p, "용사"); // 본타 9 → 91
    s = advanceTurn(s, p, "용사"); // 적 턴 -7 (12-5) → damageTaken=7
    expect(s.stacks.damageTakenThisCombat).toBe(7);
    s = advanceTurn(s, p, "용사"); // 2턴 본타: floor(7*0.25)=1 추가 ATK → baseDmg(11,1)=10 → 81
    expect(s.enemyHp).toBe(81);
  });
});

describe("2티어 특기 — 약점 적중", () => {
  it("크리 발동 시 DEF 30% 무시 추가타 1회 (턴당 1회)", () => {
    const p: PlayerCombat = {
      ...PLAYER,
      critChancePct: 75,
      critMult: 2,
      weakpointExtraAttacks: 1,
    };
    let s = initialBattleState(p, enemy(100), "용사");
    s = advanceTurn(s, p, "용사"); // 1타: 크리 14 → 86, 약점 적중 큐 +1 추가타
    expect(s.enemyHp).toBe(86);
    expect(s.turn.weakpointUsedThisTurn).toBe(true);
    expect(s.stacks.weakpointDefIgnoreLeft).toBe(1);
    expect(s.phase).toBe("player");
    // 약점 추가타: DEF 3×0.7→round 2 관통, 크리 → damageBetween(10,2)=8 ×2 = 16 → 70
    s = advanceTurn(s, p, "용사");
    expect(s.enemyHp).toBe(70);
    expect(s.stacks.weakpointDefIgnoreLeft).toBe(0);
  });
});

describe("2티어 특기 — 광속 격투", () => {
  it("기본 공격 횟수 +1 — 매 턴 2회 공격", () => {
    // attackCount 는 derive 단계에서 +1 되므로 직접 attackCount 2 로 지정.
    const p: PlayerCombat = { ...PLAYER, attackCount: 2, lightHandExtraAttack: 1 };
    let s = initialBattleState(p, enemy(100), "용사");
    s = advanceTurn(s, p, "용사"); // 1타: 7 → 93
    expect(s.phase).toBe("player");
    s = advanceTurn(s, p, "용사"); // 2타: 7 → 86 → 적 턴
    expect(s.enemyHp).toBe(86);
    expect(s.phase).toBe("enemy");
  });
});

describe("2티어 특기 — 연쇄 운명", () => {
  it("크리 발동 시 다음 공격 크리 100% 보장 (턴당 1회)", () => {
    const p: PlayerCombat = {
      ...PLAYER,
      attackCount: 2,
      critChancePct: 75,
      critMult: 2,
      fatedChainActive: true,
    };
    let s = initialBattleState(p, enemy(100), "용사");
    // 1타: 크리 14 → 86, 연쇄 운명 큐 set
    s = advanceTurn(s, p, "용사");
    expect(s.enemyHp).toBe(86);
    expect(s.turn.fatedChainTriggeredThisTurn).toBe(true);
    expect(s.flags.fatedChainCritPending).toBe(true);
    // 2타: 큐 소비 — 보장 크리 14 → 72
    s = advanceTurn(s, p, "용사");
    expect(s.enemyHp).toBe(72);
    expect(s.flags.fatedChainCritPending).toBe(false);
  });
});

describe("2티어 특기 — 반사 회피", () => {
  it("회피 시 받았을 피해의 50% 반사", () => {
    // 회피 캡 75% 도입 — 보장 회피로 결정적 회피 보장 (보장 회피 path 도 reflexEvade 정상 작동).
    const p: PlayerCombat = { ...PLAYER, guaranteedEvades: 5, reflexEvadeMult: 0.5 };
    let s = initialBattleState(p, enemy(100), "용사");
    s = advanceTurn(s, p, "용사"); // 1턴: 7 → 93
    s = advanceTurn(s, p, "용사"); // 적 턴 보장 회피: 받았을 dmg=3, 반사 floor(3*0.5)=1 → 92
    expect(s.playerHp).toBe(50);
    expect(s.enemyHp).toBe(92);
  });
});

describe("2티어 특기 — 그림자 보법", () => {
  it("100% 확률로 적 턴 무피격 + 무한 가시 반사", () => {
    const p: PlayerCombat = { ...PLAYER, shadowStepPct: 100 };
    let s = initialBattleState(p, enemy(100), "용사");
    s = advanceTurn(s, p, "용사"); // 1턴: 7 → 93
    s = advanceTurn(s, p, "용사"); // 적 턴 그림자 보법 → 모든 적 공격 무효
    expect(s.playerHp).toBe(50);
    expect(s.phase).toBe("player");
  });
});

describe("2티어 특기 — 행운의 흡혈", () => {
  it("모든 공격 피해의 N% HP 회복 (크리 외도 포함)", () => {
    // HP 25 / atk 10 / def 3 / luckyLifestealPct=12 (LUK 100 / 8 정도)
    // dmg=7, heal=floor(7 * 12 / 100) = 0. 12% 너무 작음 → 더 큰 % 로.
    const p: PlayerCombat = { ...PLAYER, hp: 25, luckyLifestealPct: 50 };
    let s = initialBattleState(p, enemy(100), "용사");
    s = advanceTurn(s, p, "용사"); // 본타 7 → 93, heal floor(7*50/100)=3 → HP 28
    expect(s.enemyHp).toBe(93);
    expect(s.playerHp).toBe(28);
  });
});

describe("2티어 특기 — 무한 가시", () => {
  it("적 공격 시 적 ATK 의 N% 를 반사 (피격 무관)", () => {
    // 무한 가시 25%: 적 atk 8 → 반사 2 → 적 -2
    const p: PlayerCombat = { ...PLAYER, infiniteThornsAtkPct: 25 };
    let s = initialBattleState(p, enemy(100), "용사");
    s = advanceTurn(s, p, "용사"); // 1턴: 7 → 93
    s = advanceTurn(s, p, "용사"); // 적 턴 피격 3, 반사 floor(8*0.25)=2 → 적 91
    expect(s.playerHp).toBe(47);
    expect(s.enemyHp).toBe(91);
  });
});

describe("2티어 특기 — 굳건한 의지", () => {
  it("받은 피해 평탄 -N 감소", () => {
    const p: PlayerCombat = { ...PLAYER, steadfastWillFlat: 2 };
    let s = initialBattleState(p, enemy(100), "용사");
    s = advanceTurn(s, p, "용사"); // 1턴: 7 → 93
    s = advanceTurn(s, p, "용사"); // 적 턴 raw 3 → -2 → 1 → 플레이어 49
    expect(s.playerHp).toBe(49);
  });
});

describe("2티어 특기 — 회전 운기", () => {
  it("매 플레이어 턴 누적 크리/회피 +N% 누적", () => {
    // cyclingChiPerTurn 100 → 1턴부터 크리 100% 강제.
    const p: PlayerCombat = {
      ...PLAYER,
      critChancePct: 0,
      critMult: 2,
      cyclingChiPerTurn: 75,
    };
    let s = initialBattleState(p, enemy(100), "용사");
    s = advanceTurn(s, p, "용사"); // 1턴 본타: cyclingChiBonus = 0 + 75 = 75 → 크리 캡 도달 → 14 → 86
    expect(s.enemyHp).toBe(86);
    expect(s.buffs.cyclingChiBonus).toBe(75);
  });
});
