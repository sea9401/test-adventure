import { afterEach, describe, expect, it, vi } from "vitest";
import {
  advanceTurn,
  initialBattleState,
  resolveBattle,
  type PlayerCombat,
} from "../v2/combat/engine";
import type { Monster } from "../data/monsters";
import { makeBleedDot, makePoisonDot } from "../v2/combat/combatShared";

// 별빛 마법부여 발동형 affix 의 engine wiring 단위 검증.
//
// 결정적 RNG — Math.random 을 stub 해서 발동/미발동 분기를 컨트롤. resolveBattle 전체는
// 사용하지 않고 핵심 hook 만 콕 집어 검증.

const BASE_PLAYER: PlayerCombat = {
  accuracyPct: 100,
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
  accuracyPct: 100,
      ...BASE_PLAYER,
      enchantBarrierPctMaxHp: 20,
    };
    const state = initialBattleState(player, enemy(), "용사");
    expect(state.stacks.playerShield).toBe(20);
    expect(state.log.some((e) => e.text.includes("[보호막]"))).toBe(true);
  });

  it("bulwarkShield 와 별도로 누적", () => {
    const player: PlayerCombat = {
  accuracyPct: 100,
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
  accuracyPct: 100,
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
  accuracyPct: 100,
      ...BASE_PLAYER,
      enchantRegenPctPerTurn: 5,
    };
    let state = initialBattleState(player, enemy({ hp: 1000 }), "용사");
    state = advanceTurn(state, player, "용사", { kind: "attack" });
    expect(state.log.every((e) => !e.text.includes("[재생]"))).toBe(true);
  });
});

describe("passiveTurnHealPctMaxHp — 매 플레이어 턴 종료 시 maxHp %", () => {
  it("HP 50 → maxHp 100 의 5% 회복 → 55", () => {
    const player: PlayerCombat = {
  accuracyPct: 100,
      ...BASE_PLAYER,
      hp: 50,
      atk: 1,
      passiveTurnHealPctMaxHp: 5,
    };
    let state = initialBattleState(player, enemy({ hp: 1000 }), "용사");
    state = advanceTurn(state, player, "용사", { kind: "attack" });
    expect(state.playerHp).toBe(55);
    expect(state.log.some((e) => e.text.includes("[가호]"))).toBe(true);
  });
});

describe("mpRegenPerTurn — 워메이지 마력 순환 (매 턴 MP flat 회복)", () => {
  it("MP 50/100, regen 8 → 58 (HP 가득이어도 발동)", () => {
    const player: PlayerCombat = {
  accuracyPct: 100,
      ...BASE_PLAYER,
      atk: 1,
      maxMp: 100,
      mp: 50,
      mpRegenPerTurn: 8,
    };
    let state = initialBattleState(player, enemy({ hp: 1000 }), "용사");
    state = advanceTurn(state, player, "용사", { kind: "attack" });
    expect(state.playerMp).toBe(58);
    expect(state.log.some((e) => e.text.includes("[마력 순환]"))).toBe(true);
  });

  it("MP 가득이면 회복 없음 (over-cap 방지)", () => {
    const player: PlayerCombat = {
  accuracyPct: 100,
      ...BASE_PLAYER,
      atk: 1,
      maxMp: 100,
      mp: 100,
      mpRegenPerTurn: 8,
    };
    let state = initialBattleState(player, enemy({ hp: 1000 }), "용사");
    state = advanceTurn(state, player, "용사", { kind: "attack" });
    expect(state.playerMp).toBe(100);
    expect(state.log.some((e) => e.text.includes("[마력 순환]"))).toBe(false);
  });

  it("mpRegenPerTurn 미보유 캐릭은 MP 불변 (회복 로그 없음)", () => {
    const player: PlayerCombat = {
  accuracyPct: 100,
      ...BASE_PLAYER,
      atk: 1,
      maxMp: 100,
      mp: 50,
    };
    let state = initialBattleState(player, enemy({ hp: 1000 }), "용사");
    state = advanceTurn(state, player, "용사", { kind: "attack" });
    expect(state.playerMp).toBe(50);
    expect(state.log.some((e) => e.text.includes("[마력 순환]"))).toBe(false);
  });
});

describe("guard — 피격 시 % 확률 블록", () => {
  it("rng 0 → 무조건 발동, 피해 0", () => {
    vi.spyOn(Math, "random").mockReturnValue(0);
    const player: PlayerCombat = {
  accuracyPct: 100,
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
  accuracyPct: 100,
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

describe("damageNullifyChancePct — 기사 흘려막기 (% 완전 무효)", () => {
  it("rng 0 → 발동, 피해 0 + [흘려막기] 로그", () => {
    vi.spyOn(Math, "random").mockReturnValue(0);
    const player: PlayerCombat = {
  accuracyPct: 100,
      ...BASE_PLAYER,
      damageNullifyChancePct: 50,
      atk: 1, // 적이 죽지 않게
    };
    let state = initialBattleState(
      player,
      enemy({ spd: 100, atk: 50, hp: 10000 }),
      "용사",
    );
    expect(state.phase).toBe("enemy");
    const before = state.playerHp;
    state = advanceTurn(state, player, "용사", { kind: "attack" });
    expect(state.playerHp).toBe(before);
    expect(state.log.some((e) => e.text.includes("[흘려막기]"))).toBe(true);
  });

  it("rng 0.99 → 미발동, 정상 피해", () => {
    vi.spyOn(Math, "random").mockReturnValue(0.99);
    const player: PlayerCombat = {
  accuracyPct: 100,
      ...BASE_PLAYER,
      damageNullifyChancePct: 50,
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
    expect(state.log.some((e) => e.text.includes("[흘려막기]"))).toBe(false);
  });
});

describe("extraHitDmgPct — 궁사 난사 (추가타 데미지 +%)", () => {
  it("첫 타는 평타, 둘째 타(추가타)는 +50%", () => {
    vi.spyOn(Math, "random").mockReturnValue(0.99); // 크리/행운의 별/회피 전부 미발동
    const player: PlayerCombat = {
  accuracyPct: 100,
      ...BASE_PLAYER,
      atk: 30,
      attackCount: 2,
      extraHitDmgPct: 50,
    };
    let state = initialBattleState(
      player,
      enemy({ hp: 100000, def: 0, spd: 1 }),
      "용사",
    );
    expect(state.phase).toBe("player");
    const hp0 = state.enemyHp;
    state = advanceTurn(state, player, "용사", { kind: "attack" }); // 첫 타(본타)
    const hit1 = hp0 - state.enemyHp;
    const hp1 = state.enemyHp;
    state = advanceTurn(state, player, "용사", { kind: "attack" }); // 추가타
    const hit2 = hp1 - state.enemyHp;
    expect(hit1).toBeGreaterThan(0);
    expect(hit2).toBe(Math.floor(hit1 * 1.5));
  });

  it("미보유면 추가타도 평타 (첫 타 == 둘째 타)", () => {
    vi.spyOn(Math, "random").mockReturnValue(0.99);
    const player: PlayerCombat = {
  accuracyPct: 100,
      ...BASE_PLAYER,
      atk: 30,
      attackCount: 2,
    };
    let state = initialBattleState(
      player,
      enemy({ hp: 100000, def: 0, spd: 1 }),
      "용사",
    );
    const hp0 = state.enemyHp;
    state = advanceTurn(state, player, "용사", { kind: "attack" });
    const hit1 = hp0 - state.enemyHp;
    const hp1 = state.enemyHp;
    state = advanceTurn(state, player, "용사", { kind: "attack" });
    const hit2 = hp1 - state.enemyHp;
    expect(hit2).toBe(hit1);
  });
});

describe("poisonedEnemyDefReductionPct — 독사 부식 (중독 적 DEF -%)", () => {
  const measure = (player: PlayerCombat, poisoned: boolean) => {
    let s = initialBattleState(
      player,
      enemy({ hp: 100000, def: 40, spd: 1 }),
      "용사",
    );
    s = {
      ...s,
      enemyV2Dots: poisoned
        ? [makePoisonDot({ stacks: 3, pctMaxHpPerStack: 0, sourceAtk: 0 })]
        : [],
    };
    const hp0 = s.enemyHp;
    s = advanceTurn(s, player, "용사", { kind: "attack" });
    return hp0 - s.enemyHp;
  };

  it("중독 상태면 적 DEF -50% → 데미지 증가", () => {
    vi.spyOn(Math, "random").mockReturnValue(0.99); // 크리/회피 미발동
    const baseDmg = measure({ ...BASE_PLAYER, atk: 60 }, true);
    const corrodeDmg = measure(
      { ...BASE_PLAYER, atk: 60, poisonedEnemyDefReductionPct: 50 },
      true,
    );
    expect(corrodeDmg).toBeGreaterThan(baseDmg);
  });

  it("중독 상태가 아니면 부식 비활성 (평타와 동일)", () => {
    vi.spyOn(Math, "random").mockReturnValue(0.99);
    const baseDmg = measure({ ...BASE_PLAYER, atk: 60 }, false);
    const corrodeDmg = measure(
      { ...BASE_PLAYER, atk: 60, poisonedEnemyDefReductionPct: 50 },
      false,
    );
    expect(corrodeDmg).toBe(baseDmg);
  });
});

describe("extraAttackChancePctWhileEnemyBleeding — 검투사 혈광 (출혈 적에게 연타)", () => {
  it("적 출혈 중이면 다음 턴 공격 횟수 굴림에 +확률 (100% → +1)", () => {
    vi.spyOn(Math, "random").mockReturnValue(0.99);
    const player: PlayerCombat = {
  accuracyPct: 100,
      ...BASE_PLAYER,
      atk: 1,
      attackCount: 1,
      extraAttackChancePctWhileEnemyBleeding: 100,
    };
    let state = initialBattleState(player, enemy({ hp: 100000, spd: 1 }), "용사");
    state = {
      ...state,
      enemyV2Dots: [makeBleedDot({ stacks: 3, flatPerStack: 0, sourceAtk: 0 })],
    };
    expect(state.playerAttacksLeft).toBe(1); // 첫 턴은 시작 시 굴림(출혈 적용 전)
    state = advanceTurn(state, player, "용사", { kind: "attack" }); // 마지막 타 후 다음 턴 굴림
    expect(state.phase).toBe("enemy");
    expect(state.playerAttacksLeft).toBe(2); // 출혈 → +1 추가 공격
  });

  it("적 출혈 없으면 추가 공격 없음 (다음 턴 = base)", () => {
    vi.spyOn(Math, "random").mockReturnValue(0.99);
    const player: PlayerCombat = {
  accuracyPct: 100,
      ...BASE_PLAYER,
      atk: 1,
      attackCount: 1,
      extraAttackChancePctWhileEnemyBleeding: 100,
    };
    let state = initialBattleState(player, enemy({ hp: 100000, spd: 1 }), "용사");
    state = advanceTurn(state, player, "용사", { kind: "attack" });
    expect(state.playerAttacksLeft).toBe(1);
  });
});

describe("defGainOnHitPct — 금강 강체 (받은 피해만큼 DEF 누적)", () => {
  it("적에게 맞으면 braceDefBonus 누적 (상한 = 기본 DEF)", () => {
    vi.spyOn(Math, "random").mockReturnValue(0.99);
    const player: PlayerCombat = {
  accuracyPct: 100,
      ...BASE_PLAYER,
      maxHp: 100000,
      hp: 100000,
      def: 10,
      atk: 1,
      defGainOnHitPct: 50,
    };
    let state = initialBattleState(
      player,
      enemy({ atk: 100, def: 0, spd: 100, hp: 100000 }),
      "용사",
    );
    expect(state.phase).toBe("enemy"); // 적 선공
    expect(state.stacks.braceDefBonus).toBe(0);
    state = advanceTurn(state, player, "용사", { kind: "attack" });
    expect(state.stacks.braceDefBonus).toBeGreaterThan(0);
    expect(state.stacks.braceDefBonus).toBeLessThanOrEqual(10); // 상한 = 기본 DEF
  });

  it("braceDefBonus 가 클수록 받는 피해가 줄어든다", () => {
    vi.spyOn(Math, "random").mockReturnValue(0.99);
    const player: PlayerCombat = {
  accuracyPct: 100,
      ...BASE_PLAYER,
      maxHp: 100000,
      hp: 100000,
      def: 10,
      atk: 1,
    };
    const takeOneHit = (brace: number) => {
      let s = initialBattleState(
        player,
        enemy({ atk: 100, def: 0, spd: 100, hp: 100000 }),
        "용사",
      );
      s = { ...s, stacks: { ...s.stacks, braceDefBonus: brace } };
      const hp0 = s.playerHp;
      s = advanceTurn(s, player, "용사", { kind: "attack" });
      return hp0 - s.playerHp;
    };
    expect(takeOneHit(50)).toBeLessThan(takeOneHit(0));
  });
});

describe("comboAtkPctPerHit — 연환 연격세 (적중마다 ATK 누적)", () => {
  it("적중할수록 뒤 타격이 더 세진다 (누적 ATK)", () => {
    vi.spyOn(Math, "random").mockReturnValue(0.99);
    const player: PlayerCombat = {
  accuracyPct: 100,
      ...BASE_PLAYER,
      atk: 100,
      attackCount: 3,
      comboAtkPctPerHit: 50, // 적중당 +50% atk 누적(상한 = 기본 atk)
    };
    let s = initialBattleState(
      player,
      enemy({ hp: 1000000, def: 0, spd: 1 }),
      "용사",
    );
    const hits: number[] = [];
    for (let i = 0; i < 3; i++) {
      const hp0 = s.enemyHp;
      s = advanceTurn(s, player, "용사", { kind: "attack" });
      hits.push(hp0 - s.enemyHp);
    }
    expect(s.stacks.comboAtkBonus).toBeGreaterThan(0);
    expect(hits[1]).toBeGreaterThan(hits[0]);
    expect(hits[2]).toBeGreaterThan(hits[1]);
  });
});

describe("comboFinisherBonusPct — 연환 절초 (4타째 마무리 강타)", () => {
  it("4타째만 +150%, 그 외는 평타", () => {
    vi.spyOn(Math, "random").mockReturnValue(0.99);
    const player: PlayerCombat = {
  accuracyPct: 100,
      ...BASE_PLAYER,
      atk: 100,
      attackCount: 5,
      comboFinisherBonusPct: 150,
    };
    let s = initialBattleState(
      player,
      enemy({ hp: 1000000, def: 0, spd: 1 }),
      "용사",
    );
    const hits: number[] = [];
    for (let i = 0; i < 5; i++) {
      const hp0 = s.enemyHp;
      s = advanceTurn(s, player, "용사", { kind: "attack" });
      hits.push(hp0 - s.enemyHp);
    }
    expect(hits[1]).toBe(hits[0]); // 2타 = 평타
    expect(hits[3]).toBe(Math.floor(hits[0] * 2.5)); // 4타 = 마무리 +150%
    expect(hits[4]).toBe(hits[0]); // 5타 = 평타 복귀
  });
});

describe("주문중첩/약점노출 — 스킬 데미지 스택 (resolveBattle 풀 전투)", () => {
  // 시전(cast)은 resolveBattle 의 while 루프에서만 일어난다(advanceTurn 단발은 평타).
  // v2_skill_strike: procChance 100(항상 시전)·cd 0·mpCost 8·물리.
  const run = (over: Partial<PlayerCombat>) => {
    const player: PlayerCombat = {
  accuracyPct: 100,
      ...BASE_PLAYER,
      maxHp: 100000,
      hp: 100000,
      atk: 100,
      maxMp: 100000,
      mp: 100000,
      ...over,
    };
    const r = resolveBattle(
      player,
      enemy({ hp: 3000, def: 0, spd: 1 }),
      "용사",
      {
        pickAction: () => ({ kind: "attack" }),
        potions: {},
        v2Skills: {
          learned: ["v2_skill_strike"],
          equipped: ["v2_skill_strike"],
        },
      },
    );
    return r.finalState;
  };

  it("주문 중첩 — 시전 누적으로 더 빨리 처치 + spellCastCount 누적", () => {
    vi.spyOn(Math, "random").mockReturnValue(0.5);
    const stacked = run({ skillDmgPctPerCast: 50 });
    const plain = run({});
    expect(stacked.outcome).toBe("win");
    expect(stacked.stacks.spellCastCount).toBeGreaterThan(0);
    expect(plain.stacks.spellCastCount).toBe(0); // 미보유 → 누적 없음
    expect(stacked.turn.completedPlayerTurns).toBeLessThan(
      plain.turn.completedPlayerTurns,
    );
  });

  it("약점 노출 — 적중 누적으로 더 빨리 처치 + enemyMagicVulnStacks 누적", () => {
    vi.spyOn(Math, "random").mockReturnValue(0.5);
    const stacked = run({ enemyMagicVulnPctPerStack: 50 });
    const plain = run({});
    expect(stacked.outcome).toBe("win");
    expect(stacked.stacks.enemyMagicVulnStacks).toBeGreaterThan(0);
    expect(plain.stacks.enemyMagicVulnStacks).toBe(0);
    expect(stacked.turn.completedPlayerTurns).toBeLessThan(
      plain.turn.completedPlayerTurns,
    );
  });
});

describe("mpCostReductionPct — 워메이지 절제 (스킬 마나 소모 환급)", () => {
  // 1방 시전으로 적 처치(적 선공 전) → finalState.playerMp = 시작MP − 순소모.
  const run = (over: Partial<PlayerCombat>) => {
    const player: PlayerCombat = {
  accuracyPct: 100,
      ...BASE_PLAYER,
      atk: 100,
      maxMp: 1000,
      mp: 1000,
      ...over,
    };
    const r = resolveBattle(player, enemy({ hp: 50, def: 0, spd: 1 }), "용사", {
      pickAction: () => ({ kind: "attack" }),
      potions: {},
      v2Skills: {
        learned: ["v2_skill_strike"],
        equipped: ["v2_skill_strike"],
      },
    });
    return r.finalState;
  };

  it("마나 소모 -50% → 1회 시전 후 MP 가 평타보다 더 남음", () => {
    vi.spyOn(Math, "random").mockReturnValue(0.5);
    const plain = run({});
    const frugal = run({ mpCostReductionPct: 50 });
    expect(plain.outcome).toBe("win");
    expect(frugal.playerMp).toBeGreaterThan(plain.playerMp); // 소모분 환급
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
  accuracyPct: 100,
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
  accuracyPct: 100,
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
  accuracyPct: 100,
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
  accuracyPct: 100,
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
  accuracyPct: 100,
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
  accuracyPct: 100,
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
  accuracyPct: 100,
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

describe("poisonOnHit — 공격 시 중독 스택", () => {
  it("적중 시 중독 스택 +1", () => {
    vi.spyOn(Math, "random").mockReturnValue(0);
    const player: PlayerCombat = {
  accuracyPct: 100,
      ...BASE_PLAYER,
      atk: 1,
      poisonOnHit: { pctMaxHpPerStack: 0.001 },
    };
    let state = initialBattleState(player, enemy({ hp: 1000 }), "용사");
    state = advanceTurn(state, player, "용사", { kind: "attack" });
    expect(state.enemyV2Dots.find((d) => d.tag === "poison")?.stacks).toBe(1);
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
  accuracyPct: 100,
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
  accuracyPct: 100,
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
  accuracyPct: 100,
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
