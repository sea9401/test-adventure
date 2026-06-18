import { afterEach, describe, expect, it, vi } from "vitest";
import {
  advanceTurn,
  initialBattleState,
  resolveBattle,
  type PlayerCombat,
} from "../v2/combat/engine";
import type { Monster } from "../data/monsters";

// v2 직업 패시브 엔진훅 단위 검증 (2026-06-03 재설계):
//   마법사 — 평타 마공화, 궁수 — 평타 방어관통, 무도가 — 피격 반격.

const BASE: PlayerCombat = {
  accuracyPct: 100,
  hp: 1000,
  maxHp: 1000,
  atk: 50,
  def: 5,
  spd: 100, // 플레이어 선공
  evasionPct: 0,
  attackCount: 1,
};

function enemy(over: Partial<Monster> = {}): Monster {
  return {
    name: "허수아비",
    tags: ["beast"],
    hp: 1000,
    atk: 10,
    def: 5,
    spd: 5,
    exp: 1,
    ...over,
  };
}

// 플레이어 1회 평타로 적이 입은 피해.
function basicHitDamage(player: PlayerCombat, e: Monster): number {
  vi.spyOn(Math, "random").mockReturnValue(0.99); // 크리/회피 proc 억제
  const s0 = initialBattleState(player, e, "용사");
  const s1 = advanceTurn(s0, player, "용사", { kind: "attack" });
  return e.hp - s1.enemyHp;
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("마법사 — 평타 마공화 (passiveMagicBasicAttack)", () => {
  it("평타가 magicAtk 로 스케일 (물리 atk 무시)", () => {
    const e = enemy({ def: 0, hp: 1000 });
    const physical = basicHitDamage({ ...BASE, atk: 1, magicAtk: 50 }, e);
    const magical = basicHitDamage(
      { ...BASE, atk: 1, magicAtk: 50, passiveMagicBasicAttack: true },
      e,
    );
    expect(physical).toBe(1); // atk 1 - def 0
    expect(magical).toBe(50); // magicAtk 50 - def 0
  });

  it("magicDef 없는 몹은 물방으로 경감(폴백) — NaN/throw 없음", () => {
    const e = enemy({ def: 10, hp: 1000 }); // 몹은 magicDef 필드 자체가 없음
    const magical = basicHitDamage(
      { ...BASE, atk: 1, magicAtk: 50, passiveMagicBasicAttack: true },
      e,
    );
    expect(Number.isFinite(magical)).toBe(true);
    expect(magical).toBe(40); // magicAtk 50 - 물방 10
  });
});

describe("궁수 — 평타 방어 관통 (passiveDefPenetrationPct)", () => {
  it("관통 50% → 적 방어가 절반으로 보여 피해 증가", () => {
    const e = enemy({ def: 40, hp: 1000 });
    const noPen = basicHitDamage({ ...BASE, atk: 50 }, e);
    const pen = basicHitDamage(
      { ...BASE, atk: 50, passiveDefPenetrationPct: 50 },
      e,
    );
    expect(noPen).toBe(10); // 50 - 40
    expect(pen).toBe(30); // 50 - (40 × 0.5 = 20)
    expect(pen).toBeGreaterThan(noPen);
  });
});

describe("무도가 — 피격 시 반격 (passiveCounterChancePct)", () => {
  it("확률 100% + 치명 반격으로 적 처치 → 승리 + [반격] 로그", () => {
    vi.spyOn(Math, "random").mockReturnValue(0); // 반격 항상 발동 (0 < 100)
    const player: PlayerCombat = {
  accuracyPct: 100,
      ...BASE,
      atk: 30,
      spd: 1, // 적 선공 — 피격을 받게
      passiveCounterChancePct: 100,
    };
    // 적이 먼저 친다(피격) → 생존 → 반격 30 → 적(hp 20) 사망.
    const result = resolveBattle(
      player,
      enemy({ atk: 5, def: 0, hp: 20, spd: 100 }),
      "용사",
      { pickAction: () => ({ kind: "attack" }), potions: {} },
    );
    expect(result.finalState.outcome).toBe("win");
    expect(
      result.finalState.log.some((e) => e.text.includes("[반격]")),
    ).toBe(true);
  });
});
