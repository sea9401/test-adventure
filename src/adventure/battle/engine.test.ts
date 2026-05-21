import { afterEach, describe, expect, it, vi } from "vitest";
import {
  advanceTurn,
  appendLog,
  applyPotionEffect,
  damageBetween,
  initialBattleState,
  resolveBattle,
  type BattleLogEntry,
  type PlayerCombat,
} from "./engine";
import { CRIT_MULT_BASE } from "../character/skills";
import type { Monster } from "../data/monsters";
import type { Potion } from "../data/potions";

const PLAYER: PlayerCombat = {
  hp: 50,
  maxHp: 50,
  atk: 10,
  def: 5,
  spd: 10,
  evasionPct: 0,
  attackCount: 1,
};

function makeEnemy(over: Partial<Monster> = {}): Monster {
  return {
    name: "테스트적",
    tags: ["beast"],
    hp: 30,
    atk: 8,
    def: 3,
    spd: 5,
    exp: 5,
    ...over,
  };
}

const HEAL_POTION: Potion = {
  id: "potion_heal_s",
  name: "테스트 회복약",
  description: "",
  effect: { kind: "heal_hp", flat: 20 },
  price: 0,
};

afterEach(() => {
  vi.restoreAllMocks();
});

describe("damageBetween", () => {
  it("atk-def, 최소 1", () => {
    expect(damageBetween(10, 3)).toBe(7);
    expect(damageBetween(3, 10)).toBe(1);
    expect(damageBetween(5, 5)).toBe(1);
  });
  it("데미지 바닥 — atk-def 가 ceil(atk×0.15) 보다 작으면 그 값으로 클램프", () => {
    // atk 100, def 95 → atk-def=5 < ceil(15)=15 → 15.
    expect(damageBetween(100, 95)).toBe(15);
    // atk 100, def 200 → ceil(15) 만큼은 들어간다.
    expect(damageBetween(100, 200)).toBe(15);
    // 정상 구간(atk-def 가 충분히 큼)에는 영향 없음.
    expect(damageBetween(100, 50)).toBe(50);
  });
});

describe("보스 부분 관통 (armorVulnerable / playerDefVulnerable)", () => {
  it("armorVulnerable — 플레이어 공격이 적 DEF 의 그 비율을 무시", () => {
    vi.spyOn(Math, "random").mockReturnValue(0.99); // 추가공격/회피/크리 미발동
    const enemy = makeEnemy({ hp: 100, def: 20, armorVulnerable: 0.25 });
    // 실효 DEF = round(20 × 0.75) = 15 → 데미지 = 10 - 15 = -5 → 바닥 ceil(10×0.15)=2.
    // (바닥이 가려서 잘 안 보이니 ATK 를 키운 케이스로도 확인)
    const strong: PlayerCombat = { ...PLAYER, atk: 50 };
    const s = advanceTurn(initialBattleState(strong, enemy, "용사"), strong, "용사");
    // 실효 DEF 15 → 50 - 15 = 35.
    expect(s.enemyHp).toBe(100 - 35);
  });
  it("playerDefVulnerable — 적 공격이 플레이어 DEF 의 그 비율을 무시", () => {
    vi.spyOn(Math, "random").mockReturnValue(0.99);
    const enemy = makeEnemy({ atk: 20, def: 0, spd: 99, playerDefVulnerable: 0.5 });
    // 적 선공. 실효 플레이어 DEF = round(5 × 0.5) = 3 → 데미지 = 20 - 3 = 17 (단, 바닥 ceil(20×0.15)=3 보다 큼).
    const s = advanceTurn(initialBattleState(PLAYER, enemy, "용사"), PLAYER, "용사");
    expect(s.playerHp).toBe(PLAYER.hp - 17);
  });
});

describe("appendLog", () => {
  it("로그를 자르지 않고 전부 누적한다 — 종료 후 알림에 전체 로그를 남기기 위함", () => {
    let log: BattleLogEntry[] = [];
    for (let i = 0; i < 20; i += 1) {
      log = appendLog(log, { kind: "info", text: `${i}` });
    }
    expect(log.length).toBe(20);
    expect(log[0].text).toBe("0");
    expect(log[19].text).toBe("19");
  });
});

describe("initialBattleState", () => {
  it("플레이어 SPD가 더 높으면 player phase로 시작", () => {
    const s = initialBattleState(PLAYER, makeEnemy({ spd: 3 }), "P");
    expect(s.phase).toBe("player");
  });

  it("SPD 동점이면 플레이어 우선", () => {
    const s = initialBattleState(PLAYER, makeEnemy({ spd: PLAYER.spd }), "P");
    expect(s.phase).toBe("player");
  });

  it("적 SPD가 더 높으면 enemy phase", () => {
    const s = initialBattleState(PLAYER, makeEnemy({ spd: 99 }), "P");
    expect(s.phase).toBe("enemy");
  });
});

describe("advanceTurn (player phase, attack)", () => {
  it("적 HP를 깎고 enemy phase로 넘어간다", () => {
    const s0 = initialBattleState(PLAYER, makeEnemy(), "P");
    const s1 = advanceTurn(s0, PLAYER, "P");
    expect(s1.enemyHp).toBe(30 - damageBetween(PLAYER.atk, 3));
    expect(s1.phase).toBe("enemy");
    expect(s1.outcome).toBeNull();
  });

  it("적을 처치하면 outcome=win, phase=ended", () => {
    const enemy = makeEnemy({ hp: 1 });
    const s0 = initialBattleState(PLAYER, enemy, "P");
    const s1 = advanceTurn(s0, PLAYER, "P");
    expect(s1.enemyHp).toBe(0);
    expect(s1.phase).toBe("ended");
    expect(s1.outcome).toBe("win");
  });

  it("attackCount > 1이면 같은 player phase에서 연속 공격", () => {
    const fast: PlayerCombat = { ...PLAYER, attackCount: 2 };
    const s0 = initialBattleState(fast, makeEnemy({ hp: 100 }), "P");
    const s1 = advanceTurn(s0, fast, "P");
    expect(s1.phase).toBe("player");
    expect(s1.playerAttacksLeft).toBe(1);
    const s2 = advanceTurn(s1, fast, "P");
    expect(s2.phase).toBe("enemy");
  });
});

describe("페이즈 트리거", () => {
  it("HP 가 hpFraction 미만이 되면 1회 발동 — DEF 증가 + 메시지 로그", () => {
    // hp 100, threshold = 30. 50 → 25 가 되면 미만 진입.
    const enemy = makeEnemy({
      hp: 100,
      def: 0,
      phaseTrigger: { hpFraction: 0.3, defBonus: 5, message: "단단해진다." },
    });
    const big: PlayerCombat = { ...PLAYER, atk: 25 };
    const s0 = { ...initialBattleState(big, enemy, "P"), enemyHp: 50 };
    const s1 = advanceTurn(s0, big, "P");
    expect(s1.enemyHp).toBe(25);
    expect(s1.flags.phaseTriggered).toBe(true);
    expect(s1.buffs.enemyDefBonus).toBe(5);
    expect(s1.log.some((e) => e.text.includes("단단해진다."))).toBe(true);
  });

  it("발동 후 후속 공격 데미지에 enemyDefBonus 가 적용된다", () => {
    const enemy = makeEnemy({
      hp: 100,
      def: 0,
      phaseTrigger: { hpFraction: 0.3, defBonus: 5, message: "msg" },
    });
    const big: PlayerCombat = { ...PLAYER, atk: 10, attackCount: 2 };
    // attackCount 2 — 첫 공격이 트리거를 발동시키고, 같은 턴 두 번째 공격은 def +5 적용.
    const s0 = { ...initialBattleState(big, enemy, "P"), enemyHp: 31 };
    const s1 = advanceTurn(s0, big, "P"); // 1st: dmg 10 (def 0) → enemyHp 21, 트리거 발동
    expect(s1.enemyHp).toBe(21);
    expect(s1.flags.phaseTriggered).toBe(true);
    expect(s1.phase).toBe("player");
    const s2 = advanceTurn(s1, big, "P"); // 2nd: dmg 10-5=5 → enemyHp 16
    expect(s2.enemyHp).toBe(16);
  });

  it("처치하는 공격에서는 트리거 발동 안 함", () => {
    const enemy = makeEnemy({
      hp: 100,
      def: 0,
      phaseTrigger: { hpFraction: 0.3, defBonus: 5, message: "msg" },
    });
    const big: PlayerCombat = { ...PLAYER, atk: 100 };
    const s0 = { ...initialBattleState(big, enemy, "P"), enemyHp: 50 };
    const s1 = advanceTurn(s0, big, "P");
    expect(s1.enemyHp).toBe(0);
    expect(s1.outcome).toBe("win");
    expect(s1.flags.phaseTriggered).toBe(false);
  });

  it("같은 전투에서 중복 발동 안 함", () => {
    const enemy = makeEnemy({
      hp: 100,
      def: 0,
      phaseTrigger: { hpFraction: 0.3, defBonus: 5, message: "msg" },
    });
    const big: PlayerCombat = { ...PLAYER, atk: 5 };
    let s = { ...initialBattleState(big, enemy, "P"), enemyHp: 28 };
    s = advanceTurn(s, big, "P"); // dmg 5, 23 → 트리거
    expect(s.buffs.enemyDefBonus).toBe(5);
    s = { ...s, phase: "player", enemyHp: 20 };
    s = advanceTurn(s, big, "P"); // dmg 1 (atk5 - def5, 최소 1)
    expect(s.buffs.enemyDefBonus).toBe(5); // 누적되지 않음
  });
});

describe("advanceTurn (enemy phase)", () => {
  it("회피 성공 시 데미지 없이 player phase로 복귀", () => {
    vi.spyOn(Math, "random").mockReturnValue(0); // 0 < evasionPct = 회피
    const dodgy: PlayerCombat = { ...PLAYER, evasionPct: 100 };
    const s0 = { ...initialBattleState(dodgy, makeEnemy(), "P"), phase: "enemy" as const };
    const s1 = advanceTurn(s0, dodgy, "P");
    expect(s1.playerHp).toBe(dodgy.hp);
    expect(s1.phase).toBe("player");
  });

  it("회피 실패 시 데미지를 입고 player phase", () => {
    vi.spyOn(Math, "random").mockReturnValue(0.99); // evasionPct=0이면 무조건 피격
    const enemy = makeEnemy();
    const s0 = { ...initialBattleState(PLAYER, enemy, "P"), phase: "enemy" as const };
    const s1 = advanceTurn(s0, PLAYER, "P");
    expect(s1.playerHp).toBe(PLAYER.hp - damageBetween(enemy.atk, PLAYER.def));
    expect(s1.phase).toBe("player");
  });

  it("HP가 0 이하가 되면 outcome=lose", () => {
    vi.spyOn(Math, "random").mockReturnValue(0.99);
    const fragile: PlayerCombat = { ...PLAYER, hp: 1, def: 0 };
    const s0 = {
      ...initialBattleState(fragile, makeEnemy({ atk: 50 }), "P"),
      phase: "enemy" as const,
    };
    const s1 = advanceTurn(s0, fragile, "P");
    expect(s1.playerHp).toBe(0);
    expect(s1.phase).toBe("ended");
    expect(s1.outcome).toBe("lose");
  });
});

describe("applyPotionEffect", () => {
  it("flat heal은 maxHp를 넘지 않는다", () => {
    const s0 = initialBattleState(
      { ...PLAYER, hp: 45 },
      makeEnemy(),
      "P",
    );
    const s1 = applyPotionEffect(s0, HEAL_POTION, "P");
    expect(s1.playerHp).toBe(50);
  });

  it("플레이어 phase에서 use_potion 후 enemy phase로 전환 (공격 1회 캐릭터)", () => {
    const s0 = initialBattleState({ ...PLAYER, hp: 10 }, makeEnemy(), "P");
    const s1 = advanceTurn(s0, PLAYER, "P", {
      kind: "use_potion",
      potionId: HEAL_POTION.id,
      potion: HEAL_POTION,
    });
    expect(s1.playerHp).toBe(30);
    expect(s1.phase).toBe("enemy");
  });

  it("use_potion 은 턴이 아니라 공격 1회만 소모 — 추가타 빌드는 같은 턴에 계속 공격", () => {
    const fast: PlayerCombat = { ...PLAYER, hp: 10, attackCount: 2 };
    const s0 = initialBattleState(fast, makeEnemy({ hp: 100 }), "P");
    expect(s0.playerAttacksLeft).toBe(2);
    const s1 = advanceTurn(s0, fast, "P", {
      kind: "use_potion",
      potionId: HEAL_POTION.id,
      potion: HEAL_POTION,
    });
    // 회복은 적용되고, 공격 1회만 깎여 여전히 player phase (남은 공격 1회).
    expect(s1.playerHp).toBe(30);
    expect(s1.phase).toBe("player");
    expect(s1.playerAttacksLeft).toBe(1);
    // 남은 공격으로 마저 때리면 그때 enemy phase 로.
    const s2 = advanceTurn(s1, fast, "P");
    expect(s2.phase).toBe("enemy");
  });
});

describe("resolveBattle", () => {
  it("강한 플레이어는 승리 + 적 HP 0", () => {
    const r = resolveBattle(PLAYER, makeEnemy(), "P", {
      pickAction: () => ({ kind: "attack" }),
      potions: {},
    });
    expect(r.outcome).toBe("win");
    expect(r.finalState.phase).toBe("ended");
    expect(r.finalState.enemyHp).toBe(0);
    expect(r.turns).toBeGreaterThan(0);
  });

  it("약한 플레이어는 패배 + final HP 0", () => {
    const fragile: PlayerCombat = { ...PLAYER, hp: 1, def: 0 };
    vi.spyOn(Math, "random").mockReturnValue(0.99); // 회피 실패
    const r = resolveBattle(fragile, makeEnemy({ atk: 50 }), "P", {
      pickAction: () => ({ kind: "attack" }),
      potions: {},
    });
    expect(r.outcome).toBe("lose");
    expect(r.finalState.playerHp).toBe(0);
  });

  it("포션 보유량을 추적, 부족하면 attack으로 폴백", () => {
    const r = resolveBattle(PLAYER, makeEnemy({ hp: 100 }), "P", {
      pickAction: () => ({
        kind: "use_potion",
        potionId: "potion_heal_s",
        potion: HEAL_POTION,
      }),
      potions: { potion_heal_s: 1 },
    });
    expect(r.potionsConsumed.potion_heal_s).toBe(1);
  });

  it("포션 0개면 소비 0, attack으로 진행", () => {
    const r = resolveBattle(PLAYER, makeEnemy(), "P", {
      pickAction: () => ({
        kind: "use_potion",
        potionId: "potion_heal_s",
        potion: HEAL_POTION,
      }),
      potions: {},
    });
    expect(r.potionsConsumed.potion_heal_s ?? 0).toBe(0);
    expect(r.outcome).toBe("win"); // 폴백 attack으로 어쨌든 진행
  });

  it("로그는 전체가 보존된다 — 턴 수만큼 누적", () => {
    const r = resolveBattle(PLAYER, makeEnemy({ hp: 200 }), "P", {
      pickAction: () => ({ kind: "attack" }),
      potions: {},
    });
    expect(r.turns).toBeGreaterThan(8); // 충분히 긴 전투
    expect(r.finalState.log.length).toBeGreaterThan(8);
  });

  it("보스 타임아웃 — isBoss + 50턴 도달 시 패배 + 안내 로그", () => {
    // 데미지가 안 박히지만 죽지도 않는 빌드 — 플레이어 atk=1, 적 def=999.
    const stalemate: PlayerCombat = { ...PLAYER, atk: 1, hp: 9999, def: 999 };
    vi.spyOn(Math, "random").mockReturnValue(0); // 회피·크리 등 결정성 확보
    const r = resolveBattle(
      stalemate,
      makeEnemy({ hp: 99999, def: 999, atk: 1 }),
      "P",
      {
        pickAction: () => ({ kind: "attack" }),
        potions: {},
        isBoss: true,
      },
    );
    expect(r.outcome).toBe("lose");
    expect(r.finalState.turn.completedPlayerTurns).toBeGreaterThanOrEqual(50);
    expect(
      r.finalState.log.some((e) => e.text.includes("50턴 경과")),
    ).toBe(true);
  });

  it("일반 전투(isBoss 미지정)는 50턴 캡 영향 없음 — 결과는 자연 종료", () => {
    // 보스 캡이 일반 전투에 새지 않는지 확인. 같은 stalemate 조건이지만 isBoss 없음.
    // 일반 안전망(turns > 500)에는 걸려도 보스 메시지는 안 나와야 한다.
    const stalemate: PlayerCombat = { ...PLAYER, atk: 1, hp: 9999, def: 999 };
    vi.spyOn(Math, "random").mockReturnValue(0);
    const r = resolveBattle(
      stalemate,
      makeEnemy({ hp: 99999, def: 999, atk: 1 }),
      "P",
      {
        pickAction: () => ({ kind: "attack" }),
        potions: {},
      },
    );
    expect(
      r.finalState.log.some((e) => e.text.includes("50턴 경과")),
    ).toBe(false);
  });
});

describe("강공격 (powerAttackBonus)", () => {
  // 적 def 0, 플레이어 atk 1 → 일반 공격 1 데미지 / 강공격 (atk+2) = 3 데미지.
  const minimal: PlayerCombat = {
    ...PLAYER,
    atk: 1,
    spd: 100, // 항상 선공
    powerAttackBonus: 2,
  };
  const enemy = makeEnemy({ def: 0, hp: 100, atk: 0 });

  it("3턴마다 첫 공격이 ATK+2 로 발동", () => {
    let s = initialBattleState(minimal, enemy, "P");
    // turn 1 공격 → 일반 (1 dmg), enemy 공격, turn 2 공격 → 일반 (1 dmg), ...
    s = advanceTurn(s, minimal, "P"); // turn 1 — player attack
    s = advanceTurn(s, minimal, "P"); // turn 1 — enemy
    s = advanceTurn(s, minimal, "P"); // turn 2 — player attack
    s = advanceTurn(s, minimal, "P"); // turn 2 — enemy
    s = advanceTurn(s, minimal, "P"); // turn 3 — player attack (강공격 발동)
    const lastPlayerAttack = [...s.log]
      .reverse()
      .find((e) => e.kind === "player_attack")!;
    expect(lastPlayerAttack.text).toContain("[강공격]");
    expect(lastPlayerAttack.text).toContain("3 피해");
  });

  it("turn 1, 2, 4, 5 의 공격은 일반 — 강공격 마커 없음", () => {
    let s = initialBattleState(minimal, enemy, "P");
    const observed: string[] = [];
    for (let turn = 1; turn <= 7; turn += 1) {
      s = advanceTurn(s, minimal, "P"); // player
      const last = [...s.log].reverse().find((e) => e.kind === "player_attack");
      if (last) observed.push(`t${turn}:${last.text.includes("[강공격]") ? "POWER" : "NORMAL"}`);
      s = advanceTurn(s, minimal, "P"); // enemy
    }
    // 강공격 = turn 3, 6
    expect(observed).toEqual([
      "t1:NORMAL",
      "t2:NORMAL",
      "t3:POWER",
      "t4:NORMAL",
      "t5:NORMAL",
      "t6:POWER",
      "t7:NORMAL",
    ]);
  });

  it("powerAttackBonus 미설정(undefined) 시 강공격 발동 안 함", () => {
    const noSkill: PlayerCombat = { ...minimal, powerAttackBonus: undefined };
    let s = initialBattleState(noSkill, enemy, "P");
    for (let i = 0; i < 6; i += 1) s = advanceTurn(s, noSkill, "P");
    const playerAttacks = s.log.filter((e) => e.kind === "player_attack");
    for (const a of playerAttacks) expect(a.text).not.toContain("[강공격]");
  });

  it("attackCount 2 일 때 강공격은 첫 공격에만 적용", () => {
    const dual: PlayerCombat = { ...minimal, attackCount: 2 };
    let s = initialBattleState(dual, enemy, "P");
    // turn 3 까지 진행 (turn 3 = power turn)
    s = advanceTurn(s, dual, "P"); // turn 1 — attack 1
    s = advanceTurn(s, dual, "P"); // turn 1 — attack 2
    s = advanceTurn(s, dual, "P"); // turn 1 — enemy
    s = advanceTurn(s, dual, "P"); // turn 2 — attack 1
    s = advanceTurn(s, dual, "P"); // turn 2 — attack 2
    s = advanceTurn(s, dual, "P"); // turn 2 — enemy
    s = advanceTurn(s, dual, "P"); // turn 3 — attack 1 (강공격)
    s = advanceTurn(s, dual, "P"); // turn 3 — attack 2 (일반)
    const playerAttacks = s.log.filter((e) => e.kind === "player_attack");
    const recent = playerAttacks.slice(-2);
    expect(recent[0].text).toContain("[강공격]");
    expect(recent[1].text).not.toContain("[강공격]");
  });
});

describe("회피 강화 (guaranteedEvades)", () => {
  it("미보유면 첫 적 공격이 데미지로 들어온다", () => {
    const enemy = makeEnemy({ spd: 99 });
    const s0 = initialBattleState(PLAYER, enemy, "P");
    expect(s0.phase).toBe("enemy");
    const s1 = advanceTurn(s0, PLAYER, "P");
    expect(s1.playerHp).toBeLessThan(PLAYER.hp);
  });

  it("guaranteedEvades=1 이면 첫 적 공격을 무조건 회피", () => {
    const guarded: PlayerCombat = { ...PLAYER, guaranteedEvades: 1 };
    const enemy = makeEnemy({ spd: 99, atk: 100 });
    const s0 = initialBattleState(guarded, enemy, "P");
    expect(s0.stacks.evadesRemaining).toBe(1);
    const s1 = advanceTurn(s0, guarded, "P");
    expect(s1.playerHp).toBe(PLAYER.hp); // 그대로
    expect(s1.stacks.evadesRemaining).toBe(0);
    expect(s1.log.some((e) => e.text.includes("[회피 강화]"))).toBe(true);
  });
});

describe("연타 (extraAttackEveryNTurns)", () => {
  it("매 5턴마다 마지막 공격 후 추가 1회 공격", () => {
    const dbl: PlayerCombat = {
      ...PLAYER,
      attackCount: 1,
      extraAttackEveryNTurns: 2,
      atk: 100, // 즉 1회 처치 가능
    };
    let s = initialBattleState(dbl, makeEnemy({ hp: 9999, atk: 0 }), "P");
    s = advanceTurn(s, dbl, "P"); // turn 1 attack — 연타 안 터짐
    expect(s.phase).toBe("enemy");
    s = advanceTurn(s, dbl, "P"); // enemy phase
    s = advanceTurn(s, dbl, "P"); // turn 2 attack — 연타 트리거
    // 연타 발동: phase 가 player 로 유지되고 추가 공격 1회 예정
    expect(s.phase).toBe("player");
    expect(s.playerAttacksLeft).toBe(1);
    expect(s.turn.doubleStrikeUsedThisTurn).toBe(true);
    expect(s.log.some((e) => e.text.includes("[연타]"))).toBe(true);
  });
});

describe("크리티컬 (critChancePct)", () => {
  it("Math.random 모킹 시 크리티컬 발동 → 데미지 ×critMult (기본)", () => {
    vi.spyOn(Math, "random").mockReturnValue(0); // 항상 발동
    const lucky: PlayerCombat = { ...PLAYER, critChancePct: 5 };
    const enemy = makeEnemy({ hp: 9999 });
    const s0 = initialBattleState(lucky, enemy, "P");
    const s1 = advanceTurn(s0, lucky, "P");
    const dmg = enemy.hp - s1.enemyHp;
    expect(dmg).toBe(Math.floor(damageBetween(PLAYER.atk, 3) * CRIT_MULT_BASE));
    expect(s1.log.some((e) => e.text.includes("[크리티컬]"))).toBe(true);
  });

  it("critMult 명시 시 그 값으로 곱해짐 (luk 비례 가정)", () => {
    vi.spyOn(Math, "random").mockReturnValue(0);
    const lucky: PlayerCombat = { ...PLAYER, critChancePct: 5, critMult: 3.0 };
    const enemy = makeEnemy({ hp: 9999 });
    const s0 = initialBattleState(lucky, enemy, "P");
    const s1 = advanceTurn(s0, lucky, "P");
    const dmg = enemy.hp - s1.enemyHp;
    expect(dmg).toBe(Math.floor(damageBetween(PLAYER.atk, 3) * 3.0));
  });

  it("Math.random=0.99 면 크리티컬 미발동 → 일반 데미지", () => {
    vi.spyOn(Math, "random").mockReturnValue(0.99);
    const lucky: PlayerCombat = { ...PLAYER, critChancePct: 5 };
    const enemy = makeEnemy({ hp: 9999 });
    const s0 = initialBattleState(lucky, enemy, "P");
    const s1 = advanceTurn(s0, lucky, "P");
    const dmg = enemy.hp - s1.enemyHp;
    expect(dmg).toBe(damageBetween(PLAYER.atk, 3));
  });
});

describe("가드 (guard)", () => {
  it("적 선공일 때 첫 N번의 적 페이즈 동안 받는 데미지 -reduction, 이후엔 정상", () => {
    vi.spyOn(Math, "random").mockReturnValue(0.99); // 회피 미발동
    const tough: PlayerCombat = {
      ...PLAYER,
      guard: { turns: 2, reduction: 1 },
    };
    const enemy = makeEnemy({ atk: 10, spd: 99 });
    const expectedDmg = damageBetween(enemy.atk, PLAYER.def);
    let s = initialBattleState(tough, enemy, "P"); // enemy 선공
    s = advanceTurn(s, tough, "P"); // turn 1 enemy phase — 가드 적용
    let dealt = PLAYER.hp - s.playerHp;
    expect(dealt).toBe(expectedDmg - 1);
    s = advanceTurn(s, tough, "P"); // turn 1 player attack
    s = advanceTurn(s, tough, "P"); // turn 2 enemy phase — 가드 적용
    dealt = PLAYER.hp - s.playerHp;
    expect(dealt).toBe((expectedDmg - 1) * 2);
    s = advanceTurn(s, tough, "P"); // turn 2 player attack
    s = advanceTurn(s, tough, "P"); // turn 3 enemy phase — 가드 만료
    dealt = PLAYER.hp - s.playerHp;
    expect(dealt).toBe((expectedDmg - 1) * 2 + expectedDmg);
  });

  it("플레이어 선공일 때도 가드는 정확히 N번의 적 페이즈 동안 발동", () => {
    // 회귀 — 과거엔 completedPlayerTurns 기준이라 플레이어 선공이면 N-1번만 발동.
    vi.spyOn(Math, "random").mockReturnValue(0.99); // 회피 미발동
    const tough: PlayerCombat = {
      ...PLAYER,
      guard: { turns: 3, reduction: 1 },
    };
    const enemy = makeEnemy({ atk: 10, spd: 1 }); // player 선공
    const expectedDmg = damageBetween(enemy.atk, PLAYER.def);
    let s = initialBattleState(tough, enemy, "P");
    // 3번의 적 페이즈 모두 가드 적용
    for (let i = 0; i < 3; i += 1) {
      s = advanceTurn(s, tough, "P"); // player attack
      s = advanceTurn(s, tough, "P"); // enemy phase
    }
    expect(PLAYER.hp - s.playerHp).toBe((expectedDmg - 1) * 3);
    // 4번째 적 페이즈는 가드 만료
    s = advanceTurn(s, tough, "P"); // player attack
    s = advanceTurn(s, tough, "P"); // enemy phase
    expect(PLAYER.hp - s.playerHp).toBe((expectedDmg - 1) * 3 + expectedDmg);
  });
});

describe("처형 (executionDamageMult)", () => {
  it("적 HP 비율 ≥ executionHpFraction 이면 일반 데미지", () => {
    // enemy hp 100, fraction 0.3 → HP 30 미만일 때만 처형. 첫 공격은 100/100 → 비활성.
    const enemy = makeEnemy({ hp: 100, def: 0 });
    const exec: PlayerCombat = {
      ...PLAYER,
      atk: 10,
      executionDamageMult: 1.5,
      executionHpFraction: 0.3,
    };
    let s = initialBattleState(exec, enemy, "P");
    s = advanceTurn(s, exec, "P");
    expect(s.enemyHp).toBe(90); // 일반 10 데미지
  });
  it("적 HP 비율 < executionHpFraction 이면 데미지 ×1.5", () => {
    // enemy hp 100, 시작 hp 25 (= 25%), fraction 0.3
    const enemy = makeEnemy({ hp: 100, def: 0 });
    const exec: PlayerCombat = {
      ...PLAYER,
      atk: 10,
      executionDamageMult: 1.5,
      executionHpFraction: 0.3,
    };
    const start = { ...initialBattleState(exec, enemy, "P"), enemyHp: 25 };
    const next = advanceTurn(start, exec, "P");
    expect(next.enemyHp).toBe(10); // 25 - floor(10×1.5) = 25 - 15
    expect(next.log.some((l) => l.text.includes("처형"))).toBe(true);
  });
});

describe("정확 (precisionEvasionMult)", () => {
  it("evasion 20% 적에게 mult 0.5 적용 시 회피 10% — 100번 시도에서 회피 빈도가 절반에 가까움", () => {
    // 결정적 검증을 위해 Math.random 모킹.
    const enemy = makeEnemy({ hp: 1000, def: 0, evasionPct: 20 });
    const precise: PlayerCombat = {
      ...PLAYER,
      atk: 10,
      precisionEvasionMult: 0.5,
    };
    // 첫 공격에 0.05 굴림 (5%) → 정확 적용된 10% 임계 안 → 회피 발동.
    vi.spyOn(Math, "random").mockReturnValue(0.05);
    let s = initialBattleState(precise, enemy, "P");
    s = advanceTurn(s, precise, "P");
    // 회피 → enemyHp 그대로
    expect(s.enemyHp).toBe(1000);
    expect(s.log.some((l) => l.text.includes("피했다"))).toBe(true);
  });
  it("evasion 20% 에 mult 0.5 적용 시 12% 굴림은 명중", () => {
    const enemy = makeEnemy({ hp: 1000, def: 0, evasionPct: 20 });
    const precise: PlayerCombat = {
      ...PLAYER,
      atk: 10,
      precisionEvasionMult: 0.5,
    };
    // 정확 적용 후 임계 10% — 0.12 = 12% 는 임계 위 → 회피 실패 → 명중.
    vi.spyOn(Math, "random").mockReturnValue(0.12);
    let s = initialBattleState(precise, enemy, "P");
    s = advanceTurn(s, precise, "P");
    expect(s.enemyHp).toBe(990);
  });
});

describe("불굴 (enduranceActive)", () => {
  it("HP 0 데미지 받으면 HP 1 로 버틴다", () => {
    const enemy = makeEnemy({ atk: 100, def: 0 }); // 강한 적
    const tough: PlayerCombat = {
      ...PLAYER,
      hp: 30,
      maxHp: 30,
      def: 0,
      enduranceActive: true,
    };
    let s = initialBattleState(tough, enemy, "P");
    // 플레이어 선공 후 적 턴 — 적이 100 데미지를 가하지만 불굴로 hp=1.
    s = advanceTurn(s, tough, "P"); // player phase
    s = advanceTurn(s, tough, "P"); // enemy phase
    expect(s.playerHp).toBe(1);
    expect(s.phase).not.toBe("ended");
    expect(s.flags.enduranceTriggered).toBe(true);
    expect(s.log.some((l) => l.text.includes("불굴"))).toBe(true);
  });
  it("두 번째 치명 피해에서는 사망 — 전투당 1회만 발동", () => {
    const enemy = makeEnemy({ hp: 1000, atk: 100, def: 0 });
    const tough: PlayerCombat = {
      ...PLAYER,
      hp: 30,
      maxHp: 30,
      atk: 1, // 적이 안 죽도록 약하게
      def: 0,
      enduranceActive: true,
    };
    let s = initialBattleState(tough, enemy, "P");
    s = advanceTurn(s, tough, "P"); // player
    s = advanceTurn(s, tough, "P"); // enemy → 불굴 첫 발동, hp=1
    expect(s.playerHp).toBe(1);
    s = advanceTurn(s, tough, "P"); // player
    s = advanceTurn(s, tough, "P"); // enemy → 두 번째 치명 피해, 정상 사망
    expect(s.phase).toBe("ended");
    expect(s.outcome).toBe("lose");
  });
});

describe("광속 (lightspeedExtraAttackPct)", () => {
  it("마지막 공격 후 확률 굴림 통과 시 추가 1회 공격", () => {
    const enemy = makeEnemy({ hp: 1000, def: 0, evasionPct: 0 });
    const swift: PlayerCombat = {
      ...PLAYER,
      atk: 10,
      lightspeedExtraAttackPct: 50, // 50% 확률 — 굴림 0.4 면 통과
    };
    // Math.random — 적 회피 0 이라 그 굴림은 패스. extraAttack(spd 미설정 → 0) 도 굴림 없음.
    // 광속 굴림에서 0.4 → 50 미만 → 통과.
    vi.spyOn(Math, "random").mockReturnValue(0.4);
    let s = initialBattleState(swift, enemy, "P");
    s = advanceTurn(s, swift, "P"); // 일반 1회 공격 → 광속 발동 → player phase 1회 추가
    expect(s.phase).toBe("player");
    expect(s.turn.lightspeedUsedThisTurn).toBe(true);
    expect(s.playerAttacksLeft).toBe(1);
  });
  it("같은 턴에 두 번 발동 X — 한 번 사용 후 게이트 차단", () => {
    const enemy = makeEnemy({ hp: 1000, def: 0, evasionPct: 0 });
    const swift: PlayerCombat = {
      ...PLAYER,
      atk: 10,
      lightspeedExtraAttackPct: 100, // 항상 발동
    };
    vi.spyOn(Math, "random").mockReturnValue(0.0);
    let s = initialBattleState(swift, enemy, "P");
    s = advanceTurn(s, swift, "P"); // 일반 + 광속 트리거 → player phase 1회 추가
    expect(s.phase).toBe("player");
    expect(s.turn.lightspeedUsedThisTurn).toBe(true);
    s = advanceTurn(s, swift, "P"); // 광속으로 추가된 1회 공격 → 광속 게이트 차단 → enemy phase
    expect(s.phase).toBe("enemy");
  });
});

describe("만개 (critMult / critChance) 누적", () => {
  it("크리티컬 발동 시 critMult 그대로 적용 (만개 보너스 호출 측 사전 계산)", () => {
    const enemy = makeEnemy({ hp: 1000, def: 0, evasionPct: 0 });
    // 만개 슬롯 시 호출 측이 critMult 에 base + bloom 보너스 합산해서 넘긴다.
    // 여기서는 엔진이 그 값을 그대로 사용함을 확인.
    const lucky: PlayerCombat = {
      ...PLAYER,
      atk: 10,
      critChancePct: 100,
      critMult: 3.0, // luk 비례 + 만개 보너스 가정
    };
    vi.spyOn(Math, "random").mockReturnValue(0.0);
    let s = initialBattleState(lucky, enemy, "P");
    s = advanceTurn(s, lucky, "P");
    // baseDmg = 10, crit ×3 = 30
    expect(1000 - s.enemyHp).toBe(30);
  });
});

describe("잡몹 스킬", () => {
  it("관통 — 적 공격이 플레이어 DEF 를 무시", () => {
    // PLAYER def 5, 적 atk 8 → 평소 3 피해. 관통 3 이면 def 2 취급 → 6 피해.
    const enemy = makeEnemy({
      atk: 8,
      spd: 99, // 적 선공
      skill: { kind: "pierce", name: "관통", armorPierce: 3 },
    });
    let s = initialBattleState(PLAYER, enemy, "P");
    s = advanceTurn(s, PLAYER, "P");
    expect(PLAYER.hp - s.playerHp).toBe(6);
  });

  it("방어 태세 — 플레이어 공격 데미지 감소 (최소 1 클램프)", () => {
    // PLAYER atk 10, 적 def 3 → 평소 7 피해. 방어 태세 2 이면 5.
    const enemy = makeEnemy({
      hp: 1000,
      def: 3,
      spd: 1, // 플레이어 선공
      skill: { kind: "brace", name: "방어", damageReduction: 2 },
    });
    let s = initialBattleState(PLAYER, enemy, "P");
    s = advanceTurn(s, PLAYER, "P");
    expect(1000 - s.enemyHp).toBe(5);
    // 클램프 — 기본 피해 2 라도 -5 면 1.
    const tanky = makeEnemy({
      hp: 1000,
      def: 8,
      spd: 1,
      skill: { kind: "brace", name: "방어", damageReduction: 5 },
    });
    let t = initialBattleState(PLAYER, tanky, "P");
    t = advanceTurn(t, PLAYER, "P");
    expect(1000 - t.enemyHp).toBe(1);
  });

  it("강타 — everyPhases 번째 적 페이즈마다 데미지 ×배율", () => {
    // 적 atk 8, PLAYER def 5 → 평소 3. everyPhases 2 / multiplier 2 → 2번째 적 페이즈에 6.
    const enemy = makeEnemy({
      hp: 1000,
      atk: 8,
      def: 0,
      spd: 99, // 적 선공
      skill: { kind: "heavy_blow", name: "강타", everyPhases: 2, multiplier: 2 },
    });
    let s = initialBattleState(PLAYER, enemy, "P");
    s = advanceTurn(s, PLAYER, "P"); // 적 페이즈 1 — 평타 3
    expect(PLAYER.hp - s.playerHp).toBe(3);
    s = advanceTurn(s, PLAYER, "P"); // 플레이어 페이즈
    s = advanceTurn(s, PLAYER, "P"); // 적 페이즈 2 — 강타 ×2 → +6
    expect(PLAYER.hp - s.playerHp).toBe(9);
    expect(s.log.some((e) => e.text.startsWith("[강타]"))).toBe(true);
  });

  it("격노 — HP 임계 도달 시 1회, 적 ATK 영구 증가", () => {
    // 적 hp 30, hpFraction 0.5 (임계 15), atkBonus 10. PLAYER atk 12 로 두 번 때리면 6 → 임계 미만.
    const strong: PlayerCombat = { ...PLAYER, atk: 12 };
    const enemy = makeEnemy({
      hp: 30,
      atk: 8,
      def: 0,
      spd: 1, // 플레이어 선공
      skill: { kind: "enrage", name: "격노", hpFraction: 0.5, atkBonus: 10 },
    });
    let s = initialBattleState(strong, enemy, "P");
    s = advanceTurn(s, strong, "P"); // 플레이어 — 적 30→18 (≥ 15, 격노 X)
    s = advanceTurn(s, strong, "P"); // 적 페이즈 — 평타 8-5 = 3
    expect(strong.hp - s.playerHp).toBe(3);
    expect(s.buffs.enemyAtkBonus).toBe(0);
    s = advanceTurn(s, strong, "P"); // 플레이어 — 적 18→6 (< 15)
    s = advanceTurn(s, strong, "P"); // 적 페이즈 — 격노 발동, atk 18 → 18-5 = 13 피해
    expect(s.buffs.enemyAtkBonus).toBe(10);
    expect(s.flags.enrageTriggered).toBe(true);
    expect(strong.hp - s.playerHp).toBe(3 + 13);
    expect(s.log.filter((e) => e.text.startsWith("[격노]")).length).toBe(1);
  });
});

describe("반격의 룬 — non-lethal counter 데미지 반영", () => {
  it("반격의 룬 카운터가 적 HP 에서 차감된다 (적 생존)", () => {
    // 적 ATK 8 / DEF 0, 플레이어 ATK 10 / DEF 5 → 평타 7. 반사 갑주 없음.
    // 플레이어 피해는 적 ATK 8 - DEF 5 = 3. 반격의 룬 100% — 적에게 ATK 10 반격.
    // 1턴 적 페이즈 후 적 HP = (시작 HP) - 평타 7 (플레이어 턴) - 10 (반격).
    const p: PlayerCombat = { ...PLAYER, runeCounterChancePct: 100 };
    const enemy = makeEnemy({ hp: 100, atk: 8, def: 0, spd: 1 });
    let s = initialBattleState(p, enemy, "P");
    s = advanceTurn(s, p, "P"); // 플레이어 페이즈 — 평타 10, 적 100 → 90
    expect(s.enemyHp).toBe(90);
    s = advanceTurn(s, p, "P"); // 적 페이즈 — 피해 3 + 반격의 룬 10 → 적 90 → 80
    expect(p.hp - s.playerHp).toBe(3);
    expect(s.enemyHp).toBe(80);
    expect(s.log.some((e) => e.text.startsWith("[반격의 룬]"))).toBe(true);
  });
});

describe("한기 (chill) 스킬 — 「별을 잊은 것」 기믹", () => {
  // perHit 2 / dmgPerStack 3 / threshold 4 / deepHpFraction 0.5.
  const chillEnemy = (over: Partial<Monster> = {}) =>
    makeEnemy({
      hp: 1000,
      atk: 6,
      spd: 5,
      skill: {
        kind: "chill",
        name: "선천의 한기",
        perHit: 2,
        dmgPerStack: 3,
        threshold: 4,
        deepHpFraction: 0.5,
      },
      ...over,
    });
  // DEF 100 탱커 — 적 평타를 바닥(1)으로 눌러 한기 DoT 를 분리 관측.
  const tank: PlayerCombat = { ...PLAYER, hp: 200, maxHp: 200, def: 100 };

  it("적 공격이 적중하면 한기가 perHit 만큼 누적된다", () => {
    const enemy = chillEnemy();
    const s0 = initialBattleState(tank, enemy, "P");
    const primed = { ...s0, phase: "enemy" as const };
    const after = advanceTurn(primed, tank, "P");
    expect(after.stacks.chillStacks).toBe(2);
  });

  it("threshold 이상이면 적 페이즈 시작에 스택당 dmgPerStack 피해 (DEF 무시)", () => {
    const enemy = chillEnemy();
    const s0 = initialBattleState(tank, enemy, "P");
    // 스택 5 로 시작 → 한기 DoT 5×3=15, 적 평타 1 → 200-16=184. 누적은 +2 → 7.
    const primed = {
      ...s0,
      phase: "enemy" as const,
      stacks: { ...s0.stacks, chillStacks: 5 },
    };
    const after = advanceTurn(primed, tank, "P");
    expect(after.playerHp).toBe(184);
    expect(after.stacks.chillStacks).toBe(7);
    expect(
      after.log.some((e) => e.text.startsWith("[한기]") && e.text.includes("15 피해")),
    ).toBe(true);
  });

  it("maxStacks 지정 시 누적이 상한에서 멈춘다 (폭주 방지)", () => {
    const enemy = chillEnemy({
      skill: {
        kind: "chill",
        name: "선천의 한기",
        perHit: 2,
        dmgPerStack: 3,
        threshold: 4,
        maxStacks: 5,
      },
    });
    const s0 = initialBattleState(tank, enemy, "P");
    // 스택 4 에서 적 공격 적중(+2) → 6 이지만 maxStacks 5 로 클램프.
    const primed = {
      ...s0,
      phase: "enemy" as const,
      stacks: { ...s0.stacks, chillStacks: 4 },
    };
    const after = advanceTurn(primed, tank, "P");
    expect(after.stacks.chillStacks).toBe(5);
  });

  it("threshold 미만이면 DoT 가 발동하지 않는다", () => {
    const enemy = chillEnemy();
    const s0 = initialBattleState(tank, enemy, "P");
    const primed = {
      ...s0,
      phase: "enemy" as const,
      stacks: { ...s0.stacks, chillStacks: 3 },
    };
    const after = advanceTurn(primed, tank, "P");
    // 한기 DoT 없음 → 적 평타 1 만. 200-1=199.
    expect(after.playerHp).toBe(199);
    expect(after.log.some((e) => e.text.startsWith("[한기]"))).toBe(false);
  });

  it("깊은 한기 — 적 HP 가 deepHpFraction 미만이면 perHit 가 2배", () => {
    const enemy = chillEnemy();
    const s0 = initialBattleState(tank, enemy, "P");
    // 적 HP 400 (< 1000×0.5) → chillAdd = perHit×2 = 4.
    const primed = {
      ...s0,
      phase: "enemy" as const,
      enemyHp: 400,
    };
    const after = advanceTurn(primed, tank, "P");
    expect(after.stacks.chillStacks).toBe(4);
  });

  it("한기로 HP 가 0 이 되면 패배 처리", () => {
    const enemy = chillEnemy();
    const frail: PlayerCombat = { ...tank, hp: 10, maxHp: 10 };
    const s0 = initialBattleState(frail, enemy, "P");
    const primed = {
      ...s0,
      phase: "enemy" as const,
      stacks: { ...s0.stacks, chillStacks: 5 }, // 5×3=15 ≥ 10
    };
    const after = advanceTurn(primed, frail, "P");
    expect(after.playerHp).toBe(0);
    expect(after.outcome).toBe("lose");
    expect(after.phase).toBe("ended");
    expect(after.log.some((e) => e.text.includes("얼어붙어"))).toBe(true);
  });
});
