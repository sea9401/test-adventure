import { afterEach, describe, expect, it, vi } from "vitest";
import {
  advanceTurn,
  initialBattleState,
  type PlayerCombat,
} from "./engine";
import type { Monster } from "../data/monsters";

// 별빛 마법부여 발동형 affix 의 engine wiring 단위 검증.
//
// 결정적 RNG — Math.random 을 stub 해서 발동/미발동 분기를 컨트롤. resolveBattle 전체는
// 사용하지 않고 핵심 hook 만 콕 집어 검증.

const BASE_PLAYER: PlayerCombat = {
  hp: 100,
  maxHp: 100,
  atk: 20,
  def: 5,
  spd: 10,
  evasionPct: 0,
  attackCount: 1,
};

function enemy(over: Partial<Monster> = {}): Monster {
  return {
    name: "허수아비",
    tags: ["beast"],
    hp: 100,
    atk: 10,
    def: 5,
    spd: 5,
    exp: 1,
    ...over,
  };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("barrier — 전투 시작 시 maxHp 의 %를 보호막으로", () => {
  it("maxHp 100 + barrierPct 20 → 보호막 20", () => {
    const player: PlayerCombat = {
      ...BASE_PLAYER,
      enchantBarrierPctMaxHp: 20,
    };
    const state = initialBattleState(player, enemy(), "용사");
    expect(state.stacks.playerShield).toBe(20);
    expect(state.log.some((e) => e.text.includes("[보호막]"))).toBe(true);
  });

  it("bulwarkShield 와 별도로 누적", () => {
    const player: PlayerCombat = {
      ...BASE_PLAYER,
      bulwarkShield: 30,
      enchantBarrierPctMaxHp: 10,
    };
    const state = initialBattleState(player, enemy(), "용사");
    expect(state.stacks.playerShield).toBe(40); // 30 + 10% × 100
  });

  it("barrierPct 0 → 추가 보호막 0", () => {
    const state = initialBattleState(BASE_PLAYER, enemy(), "용사");
    expect(state.stacks.playerShield).toBe(0);
  });
});

describe("regen — 매 플레이어 턴 종료 시 maxHp %", () => {
  it("HP 50 → maxHp 100 의 5% 회복 → 55", () => {
    const player: PlayerCombat = {
      ...BASE_PLAYER,
      hp: 50,
      enchantRegenPctPerTurn: 5,
    };
    // SPD 가 적보다 높아 player 선공. 1턴 진행 후 종료 처리에서 발동.
    let state = initialBattleState(player, enemy({ hp: 1000 }), "용사");
    state = advanceTurn(state, player, "용사", { kind: "attack" });
    // 적 페이즈로 넘어가 1회 맞기 전 player 턴 종료 effects 실행 — log 안에 [재생] 포함.
    expect(state.log.some((e) => e.text.includes("[재생]"))).toBe(true);
  });

  it("이미 풀 HP 면 발동 X", () => {
    const player: PlayerCombat = {
      ...BASE_PLAYER,
      enchantRegenPctPerTurn: 5,
    };
    let state = initialBattleState(player, enemy({ hp: 1000 }), "용사");
    state = advanceTurn(state, player, "용사", { kind: "attack" });
    expect(state.log.every((e) => !e.text.includes("[재생]"))).toBe(true);
  });
});

describe("guard — 피격 시 % 확률 블록", () => {
  it("rng 0 → 무조건 발동, 피해 0", () => {
    vi.spyOn(Math, "random").mockReturnValue(0);
    const player: PlayerCombat = {
      ...BASE_PLAYER,
      enchantGuardBlockPct: 50,
      atk: 1, // 적이 죽지 않게
    };
    // 적 선공으로 강제 — spd 비교.
    let state = initialBattleState(
      player,
      enemy({ spd: 100, atk: 50, hp: 10000 }),
      "용사",
    );
    expect(state.phase).toBe("enemy");
    const before = state.playerHp;
    state = advanceTurn(state, player, "용사", { kind: "attack" });
    // 가드 발동 → HP 그대로.
    expect(state.playerHp).toBe(before);
    expect(state.log.some((e) => e.text.includes("[가드]"))).toBe(true);
  });

  it("rng 0.99 → 미발동, 정상 피해", () => {
    vi.spyOn(Math, "random").mockReturnValue(0.99);
    const player: PlayerCombat = {
      ...BASE_PLAYER,
      enchantGuardBlockPct: 50,
      atk: 1,
    };
    let state = initialBattleState(
      player,
      enemy({ spd: 100, atk: 50, hp: 10000 }),
      "용사",
    );
    const before = state.playerHp;
    state = advanceTurn(state, player, "용사", { kind: "attack" });
    expect(state.playerHp).toBeLessThan(before);
  });
});

describe("endure — 받는 피해 -%", () => {
  it("endurePct 50 → 피해 절반", () => {
    vi.spyOn(Math, "random").mockReturnValue(0.99); // guard 미발동
    const baseline: PlayerCombat = { ...BASE_PLAYER, atk: 1 };
    let s1 = initialBattleState(
      baseline,
      enemy({ spd: 100, atk: 50, hp: 10000, def: 0 }),
      "용사",
    );
    s1 = advanceTurn(s1, baseline, "용사", { kind: "attack" });
    const baseDmg = baseline.maxHp - s1.playerHp;

    const endured: PlayerCombat = {
      ...BASE_PLAYER,
      atk: 1,
      enchantEndurePct: 50,
    };
    let s2 = initialBattleState(
      endured,
      enemy({ spd: 100, atk: 50, hp: 10000, def: 0 }),
      "용사",
    );
    s2 = advanceTurn(s2, endured, "용사", { kind: "attack" });
    const enduredDmg = endured.maxHp - s2.playerHp;
    expect(enduredDmg).toBeLessThan(baseDmg);
    expect(s2.log.some((e) => e.text.includes("[인내]"))).toBe(true);
  });
});

describe("execute — 적 HP 25% 이하 추가 피해", () => {
  it("적 HP 20% 일 때 enchantExecuteBonusPct 40 → 데미지 +40%", () => {
    vi.spyOn(Math, "random").mockReturnValue(0.99); // crit/luckystar 미발동
    const player: PlayerCombat = {
      ...BASE_PLAYER,
      atk: 100,
      enchantExecuteBonusPct: 40,
    };
    const e = enemy({ hp: 100, def: 0 });
    let state = initialBattleState(player, e, "용사");
    // 적 HP 미리 깎아두기 — 20%.
    state = { ...state, enemyHp: 20 };
    state = advanceTurn(state, player, "용사", { kind: "attack" });
    expect(state.log.some((e) => e.text.includes("별빛 처형"))).toBe(true);
  });
});

describe("berserk — 자기 HP 30% 이하 ATK +%", () => {
  it("HP 30% 이하 → enchantBerserkBonusPct 가 atk 합산에 반영", () => {
    vi.spyOn(Math, "random").mockReturnValue(0.99);
    const player: PlayerCombat = {
      ...BASE_PLAYER,
      hp: 20, // 20% — 발동
      atk: 100,
      enchantBerserkBonusPct: 50,
    };
    const e = enemy({ hp: 10000, def: 0 });
    let state = initialBattleState(player, e, "용사");
    const enemyHpBefore = state.enemyHp;
    state = advanceTurn(state, player, "용사", { kind: "attack" });
    const dmg = enemyHpBefore - state.enemyHp;
    // 베이스 100 ATK + 50% = 150 ATK → 150 데미지 (def 0).
    expect(dmg).toBeGreaterThanOrEqual(140);
    expect(state.log.some((e) => e.text.includes("폭주"))).toBe(true);
  });

  it("HP 40% 면 미발동", () => {
    vi.spyOn(Math, "random").mockReturnValue(0.99);
    const player: PlayerCombat = {
      ...BASE_PLAYER,
      hp: 40, // 40% — 미발동
      atk: 100,
      enchantBerserkBonusPct: 50,
    };
    const e = enemy({ hp: 10000, def: 0 });
    let state = initialBattleState(player, e, "용사");
    state = advanceTurn(state, player, "용사", { kind: "attack" });
    expect(state.log.every((e) => !e.text.includes("폭주"))).toBe(true);
  });
});

describe("breaker — 보스에게 데미지 +%", () => {
  it("isBoss true + breakerBossBonusPct 20 → 데미지 +20%", () => {
    vi.spyOn(Math, "random").mockReturnValue(0.99);
    const player: PlayerCombat = {
      ...BASE_PLAYER,
      atk: 100,
      enchantBreakerBossBonusPct: 20,
    };
    const e = enemy({ hp: 10000, def: 0 });
    let state = initialBattleState(player, e, "용사");
    state = { ...state, isBoss: true };
    const before = state.enemyHp;
    state = advanceTurn(state, player, "용사", { kind: "attack" });
    const dmg = before - state.enemyHp;
    // 100 × 1.2 = 120.
    expect(dmg).toBeGreaterThanOrEqual(115);
    expect(state.log.some((e) => e.text.includes("파괴"))).toBe(true);
  });

  it("일반 적엔 미발동", () => {
    vi.spyOn(Math, "random").mockReturnValue(0.99);
    const player: PlayerCombat = {
      ...BASE_PLAYER,
      atk: 100,
      enchantBreakerBossBonusPct: 20,
    };
    const e = enemy({ hp: 10000, def: 0 });
    let state = initialBattleState(player, e, "용사");
    state = advanceTurn(state, player, "용사", { kind: "attack" });
    expect(state.log.every((e) => !e.text.includes("파괴"))).toBe(true);
  });
});

describe("lifesteal — 가한 피해의 % HP 회복", () => {
  it("HP 50 / dmg 100 / lifestealPct 10 → +10 회복", () => {
    vi.spyOn(Math, "random").mockReturnValue(0.99);
    const player: PlayerCombat = {
      ...BASE_PLAYER,
      hp: 50,
      atk: 100,
      enchantLifestealPct: 10,
    };
    const e = enemy({ hp: 10000, def: 0 });
    let state = initialBattleState(player, e, "용사");
    state = advanceTurn(state, player, "용사", { kind: "attack" });
    expect(state.playerHp).toBeGreaterThan(50);
    expect(state.log.some((e) => e.text.includes("별빛 흡혈"))).toBe(true);
  });
});

describe("venom — 공격 시 % 확률 출혈 스택", () => {
  it("rng 0 → 무조건 발동, 출혈 스택 +1", () => {
    vi.spyOn(Math, "random").mockReturnValue(0);
    const player: PlayerCombat = {
      ...BASE_PLAYER,
      atk: 1,
      enchantVenomChancePct: 50,
      enchantVenomDmgPerStack: 5,
    };
    let state = initialBattleState(player, enemy({ hp: 1000 }), "용사");
    const before = state.stacks.bleedStacks;
    state = advanceTurn(state, player, "용사", { kind: "attack" });
    expect(state.stacks.bleedStacks).toBe(before + 1);
    expect(state.log.some((e) => e.text.includes("[독공]"))).toBe(true);
  });
});

describe("pierce — flat def 차감", () => {
  it("pierceFlat 5 → 적 def 10 이 5 로 보임", () => {
    vi.spyOn(Math, "random").mockReturnValue(0.99);
    const baseline: PlayerCombat = { ...BASE_PLAYER, atk: 20 };
    let s1 = initialBattleState(baseline, enemy({ def: 10, hp: 1000 }), "용사");
    const before1 = s1.enemyHp;
    s1 = advanceTurn(s1, baseline, "용사", { kind: "attack" });
    const dmgBaseline = before1 - s1.enemyHp;

    const pierced: PlayerCombat = {
      ...BASE_PLAYER,
      atk: 20,
      enchantPierceFlat: 5,
    };
    let s2 = initialBattleState(pierced, enemy({ def: 10, hp: 1000 }), "용사");
    const before2 = s2.enemyHp;
    s2 = advanceTurn(s2, pierced, "용사", { kind: "attack" });
    const dmgPierced = before2 - s2.enemyHp;
    expect(dmgPierced).toBeGreaterThan(dmgBaseline);
  });
});

describe("reflect — 받은 HP 피해의 % 반사", () => {
  it("dmgToHp 의 % 가 적에게 반사", () => {
    vi.spyOn(Math, "random").mockReturnValue(0.99); // guard/dodge/lucky 미발동
    const player: PlayerCombat = {
      ...BASE_PLAYER,
      atk: 1,
      enchantReflectPct: 50,
    };
    const e = enemy({ spd: 100, atk: 20, hp: 1000, def: 0 });
    let state = initialBattleState(player, e, "용사");
    state = advanceTurn(state, player, "용사", { kind: "attack" });
    expect(state.log.some((l) => l.text.includes("별빛 반사"))).toBe(true);
  });
});

describe("통합 — barrier + endure 묶음", () => {
  it("초기 보호막 + 적 선공 후 인내 로그", () => {
    vi.spyOn(Math, "random").mockReturnValue(0.5);
    const player: PlayerCombat = {
      ...BASE_PLAYER,
      atk: 50,
      enchantBarrierPctMaxHp: 30,
      enchantEndurePct: 30,
    };
    let state = initialBattleState(
      player,
      enemy({ hp: 1000, atk: 30, spd: 100, def: 0 }),
      "용사",
    );
    expect(state.stacks.playerShield).toBe(30);
    state = advanceTurn(state, player, "용사", { kind: "attack" });
    expect(state.log.some((l) => l.text.includes("[인내]"))).toBe(true);
  });
});
