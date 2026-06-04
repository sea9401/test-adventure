import { describe, it, expect } from "vitest";
import { advanceTurn, initialBattleState, type PlayerCombat } from "../v2/combat/engine";
import type { Monster } from "../data/monsters";

// 기본 PLAYER: atk 10, def 5, spd 10 — 적(atk 8, def 3, spd 5)보다 빠르므로 항상 선공.
const PLAYER: PlayerCombat = {
  hp: 9999,
  maxHp: 9999,
  atk: 10,
  def: 5,
  spd: 10,
  evasionPct: 0,
  attackCount: 1,
};

function enemy(hp = 100, overrides: Partial<Monster> = {}): Monster {
  return {
    name: "적",
    tags: ["beast"],
    hp,
    atk: 8,
    def: 3,
    spd: 5,
    exp: 5,
    ...overrides,
  };
}

// damageBetween(10, 3) = 7 (플레이어 본타)
// damageBetween(8, 5)  = 3 (적 본타)

describe("5티어 — 막다른 격노", () => {
  it("RAMPAGE_START_TURN(3) 턴 전에는 누적 0", () => {
    const p: PlayerCombat = { ...PLAYER, rampagePerTurn: 3 };
    let s = initialBattleState(p, enemy(9999), "용사");
    // 2 player 턴: p-e 패턴 → advanceTurn 4회
    for (let i = 0; i < 4; i += 1) s = advanceTurn(s, p, "용사");
    expect(s.turn.completedPlayerTurns).toBe(2);
    expect(s.buffs.rampageAtkBonus).toBe(0);
  });

  it("RAMPAGE_START_TURN 도달 시점부터 매 플레이어 턴 종료마다 +N 누적", () => {
    const p: PlayerCombat = { ...PLAYER, rampagePerTurn: 3 };
    let s = initialBattleState(p, enemy(9999), "용사");
    // 3 player 턴 진행
    for (let i = 0; i < 6; i += 1) s = advanceTurn(s, p, "용사");
    expect(s.turn.completedPlayerTurns).toBe(3);
    expect(s.buffs.rampageAtkBonus).toBe(3);
    // 한 턴 더 (4번째)
    for (let i = 0; i < 2; i += 1) s = advanceTurn(s, p, "용사");
    expect(s.turn.completedPlayerTurns).toBe(4);
    expect(s.buffs.rampageAtkBonus).toBe(6);
  });

  it("누적된 보너스 ATK 가 다음 본타 데미지에 반영", () => {
    const p: PlayerCombat = { ...PLAYER, rampagePerTurn: 5 };
    let s = initialBattleState(p, enemy(9999), "용사");
    // 3턴까지 = 누적 +5. 4턴째 본타는 atk 10+5=15, damageBetween(15,3)=12.
    for (let i = 0; i < 6; i += 1) s = advanceTurn(s, p, "용사");
    const before = s.enemyHp;
    s = advanceTurn(s, p, "용사"); // 4번째 player 본타
    expect(before - s.enemyHp).toBe(12);
  });
});

describe("5티어 — 약점 분석", () => {
  it("매 플레이어 턴 종료 시 적 ATK·DEF 페널티 누적", () => {
    const p: PlayerCombat = { ...PLAYER, analysisPerTurn: 2 };
    // 적 atk/def 100 → 페널티 캡 floor(100×0.3)=30. +2 누적은 캡 한참 아래라 그대로 쌓임.
    let s = initialBattleState(p, enemy(9999, { atk: 100, def: 100 }), "용사");
    s = advanceTurn(s, p, "용사"); // 본타 후 finishPlayerTurn → 페널티 +2
    expect(s.buffs.enemyAtkPenalty).toBe(2);
    expect(s.buffs.enemyDefPenalty).toBe(2);
    s = advanceTurn(s, p, "용사"); // 적 턴
    s = advanceTurn(s, p, "용사"); // 본타 → 페널티 +2
    expect(s.buffs.enemyAtkPenalty).toBe(4);
    expect(s.buffs.enemyDefPenalty).toBe(4);
  });

  it("DEF 페널티(캡)가 플레이어 데미지에 반영 — 캡은 적 DEF 의 30%", () => {
    const p: PlayerCombat = { ...PLAYER, atk: 50, analysisPerTurn: 20 };
    // 적 def 30 → 페널티 캡 floor(30×0.3)=9. analysisPerTurn 20 이라도 9 에서 멈춤.
    let s = initialBattleState(p, enemy(9999, { def: 30 }), "용사");
    s = advanceTurn(s, p, "용사"); // 1번째 본타 → 턴 종료 시 페널티 9 (캡)
    expect(s.buffs.enemyDefPenalty).toBe(9);
    s = advanceTurn(s, p, "용사"); // 적 턴
    const before = s.enemyHp;
    s = advanceTurn(s, p, "용사"); // 2번째 본타 — effective def = 30-9 = 21 → damageBetween(50,21)=29
    expect(before - s.enemyHp).toBe(29);
  });
});

describe("5티어 — 가시 갑옷", () => {
  it("받은 피해의 N% 를 적에게 반사", () => {
    // 적 atk 100 → damageBetween(100, 5) = 95 → 반사 30% = 28
    const p: PlayerCombat = { ...PLAYER, bramblePct: 30 };
    let s = initialBattleState(p, enemy(1000, { atk: 100 }), "용사");
    s = advanceTurn(s, p, "용사"); // 본타 7 → 993
    expect(s.enemyHp).toBe(993);
    s = advanceTurn(s, p, "용사"); // 적 본타 95 피해 + 반사 28
    expect(s.playerHp).toBe(9999 - 95);
    expect(s.enemyHp).toBe(993 - 28);
  });

  it("반사 갑주(특기) 와 누적된다", () => {
    // 적 atk 100, damageBetween(100,5)=95 → thorns 20% = 19 + bramble 30% = 28 → 합 47
    const p: PlayerCombat = { ...PLAYER, thornsPct: 20, bramblePct: 30 };
    let s = initialBattleState(p, enemy(1000, { atk: 100 }), "용사");
    s = advanceTurn(s, p, "용사"); // 본타
    const before = s.enemyHp;
    s = advanceTurn(s, p, "용사"); // 적 본타 + 합산 반사
    expect(before - s.enemyHp).toBe(47);
  });
});

describe("5티어 — 풍사슬", () => {
  it("광속 발동 후 풍사슬이 캡(3)까지 체인", () => {
    const p: PlayerCombat = {
      ...PLAYER,
      lightspeedExtraAttackPct: 100,
      galeChainChancePct: 100,
    };
    let s = initialBattleState(p, enemy(9999), "용사");
    // turn 1: 본타1(7) → 광속 발동 → 본타2(7) → 풍사슬1 → 본타3(7) → 풍사슬2 → 본타4(7) → 풍사슬3 → 본타5(7) → cap → 턴 종료
    s = advanceTurn(s, p, "용사"); // 본타1 + 광속 발동
    expect(s.phase).toBe("player");
    expect(s.turn.lightspeedUsedThisTurn).toBe(true);
    s = advanceTurn(s, p, "용사"); // 본타2 + 풍사슬1
    expect(s.turn.galeChainsThisTurn).toBe(1);
    s = advanceTurn(s, p, "용사"); // 본타3 + 풍사슬2
    expect(s.turn.galeChainsThisTurn).toBe(2);
    s = advanceTurn(s, p, "용사"); // 본타4 + 풍사슬3
    expect(s.turn.galeChainsThisTurn).toBe(3);
    s = advanceTurn(s, p, "용사"); // 본타5, cap 도달 → 풍사슬 X → phase=enemy
    expect(s.phase).toBe("enemy");
    expect(s.enemyHp).toBe(9999 - 7 * 5);
  });

  it("기본 공격만 있고 추가공격(연타·광속·풍사슬)이 한 번도 없으면 풍사슬 안 발동", () => {
    // galeChainReady 가 false 라 풍사슬 100% 라도 발동 X
    const p: PlayerCombat = { ...PLAYER, galeChainChancePct: 100 };
    let s = initialBattleState(p, enemy(9999), "용사");
    s = advanceTurn(s, p, "용사"); // 본타 7, 광속/연타 X → 풍사슬도 X → phase=enemy
    expect(s.phase).toBe("enemy");
    expect(s.turn.galeChainsThisTurn).toBe(0);
    expect(s.enemyHp).toBe(9999 - 7);
  });

  it("새 턴 시작 시 galeChainsThisTurn 리셋", () => {
    const p: PlayerCombat = {
      ...PLAYER,
      lightspeedExtraAttackPct: 100,
      galeChainChancePct: 100,
    };
    let s = initialBattleState(p, enemy(9999), "용사");
    // turn 1: 풍사슬 3회 발동
    for (let i = 0; i < 5; i += 1) s = advanceTurn(s, p, "용사"); // 본타 5번
    expect(s.turn.galeChainsThisTurn).toBe(0); // turn 종료 시 리셋
    expect(s.phase).toBe("enemy");
    s = advanceTurn(s, p, "용사"); // 적 턴
    expect(s.phase).toBe("player");
    // turn 2: 풍사슬 재발동 가능
    s = advanceTurn(s, p, "용사"); // 본타 + 광속
    expect(s.turn.lightspeedUsedThisTurn).toBe(true);
    s = advanceTurn(s, p, "용사"); // 본타 + 풍사슬1
    expect(s.turn.galeChainsThisTurn).toBe(1);
  });
});

describe("5티어 — 행운의 별", () => {
  it("발동 시 데미지 ×2 (크리티컬과 별개)", () => {
    // 확률 100% → 매 본타 ×2. damageBetween(10,3)=7, ×2 = 14.
    const p: PlayerCombat = { ...PLAYER, luckyStarChancePct: 100 };
    let s = initialBattleState(p, enemy(100), "용사");
    s = advanceTurn(s, p, "용사");
    expect(s.enemyHp).toBe(86); // 100 - 14
  });

  it("확률 0 면 평소 데미지", () => {
    const p: PlayerCombat = { ...PLAYER, luckyStarChancePct: 0 };
    let s = initialBattleState(p, enemy(100), "용사");
    s = advanceTurn(s, p, "용사");
    expect(s.enemyHp).toBe(93); // 100 - 7
  });
});
