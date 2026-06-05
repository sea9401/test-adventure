import { describe, it, expect } from "vitest";
import { advanceTurn, initialBattleState, type PlayerCombat } from "../v2/combat/engine";
import type { Monster } from "../data/monsters";

// 기본 PLAYER: atk 10, def 5, spd 10 — 적(atk 8, def 3, spd 5)보다 빠르므로 항상 선공.
// 적 회피 0 / 플레이어 추가공격 확률 0 → 아래 테스트들은 전부 결정적 (천명은 확률 100% 로 강제).
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

// damageBetween(10, 3) = 7  (플레이어 일반 타격)
// damageBetween(8, 5)  = 3  (적 타격)

describe("4티어 — 출혈", () => {
  it("적중 시 스택 누적, 다음 적 턴 시작에 스택당 고정 피해(DEF 무시)", () => {
    const p: PlayerCombat = { ...PLAYER, bleedOnHit: { flatPerStack: 3, atkCoefPerStack: 0.08 } };
    let s = initialBattleState(p, enemy(100), "용사");
    s = advanceTurn(s, p, "용사"); // 플레이어 턴: 7 피해 → 93, 출혈 1스택
    expect(s.enemyHp).toBe(93);
    expect(s.enemyV2Dots.find((d) => d.tag === "bleed")?.stacks).toBe(1);
    s = advanceTurn(s, p, "용사"); // 적 턴: 출혈 1×(3 + ATK×0.08) → 89.2, 그 뒤 적 공격 3 → 플레이어 47
    expect(s.enemyHp).toBe(89.2);
    expect(s.playerHp).toBe(47);
    expect(s.stacks.damageTakenThisCombat).toBe(3);
  });
});

describe("4티어 — 철벽", () => {
  it("보호막이 피해를 먼저 흡수, 소진까지 HP 와 누적피해 0", () => {
    const p: PlayerCombat = { ...PLAYER, bulwarkShield: 10 };
    let s = initialBattleState(p, enemy(100), "용사");
    expect(s.stacks.playerShield).toBe(10);
    s = advanceTurn(s, p, "용사"); // 플레이어 타격
    s = advanceTurn(s, p, "용사"); // 적 타격 3 → 보호막 10→7, HP 그대로
    expect(s.stacks.playerShield).toBe(7);
    expect(s.playerHp).toBe(50);
    expect(s.stacks.damageTakenThisCombat).toBe(0);
  });
});

describe("4티어 — 천명", () => {
  it("발동 시 적 현재 HP 의 5% 추가 고정 피해 (확률 100%)", () => {
    const p: PlayerCombat = { ...PLAYER, heavenDecreeChancePct: 100 };
    let s = initialBattleState(p, enemy(100), "용사");
    s = advanceTurn(s, p, "용사"); // 7(일반) + floor(100×5/100)=5 → 12 피해 → 88
    expect(s.enemyHp).toBe(88);
  });
});

describe("4티어 — 그림자 분신", () => {
  it("플레이어 턴 종료 시 분신이 ATK의 50% 로 1회 추가타", () => {
    const p: PlayerCombat = { ...PLAYER, shadowCloneAtkPct: 50 };
    let s = initialBattleState(p, enemy(100), "용사");
    s = advanceTurn(s, p, "용사"); // 7(본체) + damageBetween(floor(10*0.5)=5, 3)=2(분신) → 91
    expect(s.enemyHp).toBe(91);
  });
});

describe("4티어 — 무피해 난무", () => {
  it("받은 피해 0이면 턴 종료 시 추가 공격 N회", () => {
    const p: PlayerCombat = { ...PLAYER, flurryAttacks: 2 };
    let s = initialBattleState(p, enemy(100), "용사");
    s = advanceTurn(s, p, "용사"); // 7(본체) + 7 + 7 (난무 2회) → 79
    expect(s.enemyHp).toBe(79);
    expect(s.stacks.damageTakenThisCombat).toBe(0);
  });

  it("피해를 받은 뒤에는 난무가 안 나간다", () => {
    const p: PlayerCombat = { ...PLAYER, flurryAttacks: 2 };
    let s = initialBattleState(p, enemy(100), "용사");
    s = advanceTurn(s, p, "용사"); // 1턴: 본체7 + 난무14 → 79
    s = advanceTurn(s, p, "용사"); // 적 턴: 3 피해 → damageTaken 3
    expect(s.stacks.damageTakenThisCombat).toBe(3);
    const before = s.enemyHp; // 79
    s = advanceTurn(s, p, "용사"); // 2턴: 본체7만 (난무 X) → 72
    expect(s.enemyHp).toBe(before - 7);
  });
});
