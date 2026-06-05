import { afterEach, describe, expect, it, vi } from "vitest";
import {
  advanceTurn,
  appendLog,
  applyPotionEffect,
  damageBetween,
  initialBattleState,
  resolveBattle,
  type BattleLogEntry,
  type BattleState,
  type PlayerCombat,
} from "../v2/combat/engine";
import {
  BLEED_MAX_STACKS,
  POISON_CAP_ATK_COEF,
  POISON_PCT_PER_POINT,
  CRIT_MULT_BASE,
} from "../data/v2/v2CombatConstants";
import { makeBleedDot, makePoisonDot } from "../v2/combat/combatShared";
import { AP_SKILLS, DEFAULT_AP_SKILL_CONDITION } from "../character/apSkills";
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

  it("계파 받피감(passiveDamageTakenReductionPct) — 받는 피해 %감소, 미보유=불변", () => {
    vi.spyOn(Math, "random").mockReturnValue(0.99); // 무조건 피격
    const enemy = makeEnemy({ atk: 40 }); // base 피해 충분히 크게(반올림 영향 최소)
    const base = damageBetween(enemy.atk, PLAYER.def);
    // 받피감 50% → floor(base×0.5) 피해
    const tanky: PlayerCombat = {
      ...PLAYER,
      passiveDamageTakenReductionPct: 50,
    };
    const s1 = advanceTurn(
      { ...initialBattleState(tanky, enemy, "P"), phase: "enemy" as const },
      tanky,
      "P",
    );
    expect(s1.playerHp).toBe(tanky.hp - Math.max(1, Math.floor(base * 0.5)));
    // 대조: 미보유 = full 피해(라이브 불변)
    const s1b = advanceTurn(
      { ...initialBattleState(PLAYER, enemy, "P"), phase: "enemy" as const },
      PLAYER,
      "P",
    );
    expect(s1b.playerHp).toBe(PLAYER.hp - base);
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

  it("PR-6 — MP 포션 (heal_mp) 으로 playerMp 회복, maxMp 클램프", () => {
    const intPlayer: PlayerCombat = { ...PLAYER, maxMp: 100 };
    const s0 = initialBattleState(intPlayer, makeEnemy(), "P");
    // 시작 시 playerMp = playerMaxMp (풀충전). 강제로 깎아 회복 검증.
    const drained: BattleState = { ...s0, playerMp: 10 };
    const mpPotion: Potion = {
      id: "potion_mp_s",
      name: "작은 마력약",
      description: "",
      effect: { kind: "heal_mp", flat: 30, pct: 20 },
      price: 0,
    };
    const after = applyPotionEffect(drained, mpPotion, "P");
    // 회복 = max(30, ceil(100 × 20%)) = max(30, 20) = 30. 10 + 30 = 40 ≤ 100.
    expect(after.playerMp).toBe(40);
    expect(after.playerHp).toBe(drained.playerHp); // hp 무관
  });

  it("PR-6 — MP 포션 maxMp 0 (INT 없는 캐릭) → no-op", () => {
    const s0 = initialBattleState(PLAYER, makeEnemy(), "P");
    // PLAYER 에 maxMp 미지정 → 0.
    expect(s0.playerMaxMp).toBe(0);
    const mpPotion: Potion = {
      id: "potion_mp_s",
      name: "작은 마력약",
      description: "",
      effect: { kind: "heal_mp", flat: 30, pct: 20 },
      price: 0,
    };
    const after = applyPotionEffect(s0, mpPotion, "P");
    expect(after.playerMp).toBe(0);
  });
});

describe("resolveBattle", () => {
  it("openingNote 가 있으면 전투 시작 로그에 info 로 박힌다", () => {
    const note = "공세 전술을 취한다.";
    const r = resolveBattle(PLAYER, makeEnemy(), "P", {
      pickAction: () => ({ kind: "attack" }),
      potions: {},
      openingNote: note,
    });
    const hit = r.finalState.log.find(
      (e) => e.kind === "info" && e.text === note,
    );
    expect(hit).toBeDefined();
  });

  it("openingNote 미지정이면 추가 안 됨", () => {
    const r = resolveBattle(PLAYER, makeEnemy(), "P", {
      pickAction: () => ({ kind: "attack" }),
      potions: {},
    });
    expect(
      r.finalState.log.some(
        (e) => e.kind === "info" && e.text.includes("전술을 취한다"),
      ),
    ).toBe(false);
  });

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

  it("maxTurns 로 턴 상한을 낮추면 그 턴에 lose 로 종료(스파링 샌드백)", () => {
    // 안 죽는 샌드백: HP 100만, atk/def 0. PLAYER(atk 10)는 50턴 안에 절대 못 깎는다.
    const dummy = makeEnemy({ hp: 1_000_000, atk: 0, def: 0 });
    const r = resolveBattle(PLAYER, dummy, "P", {
      pickAction: () => ({ kind: "attack" }),
      potions: {},
      maxTurns: 50,
    });
    expect(r.outcome).toBe("lose"); // 타임아웃(처치 못 함)
    expect(r.turns).toBe(50); // maxTurns 에 도달한 그 턴에 멈춘다(>=).
    // 그동안 데미지는 누적되고, 샌드백은 살아있다.
    const dealt = 1_000_000 - r.finalState.enemyHp;
    expect(dealt).toBeGreaterThan(0);
    expect(r.finalState.enemyHp).toBeGreaterThan(0);
  });

  it("maxTurns 미지정이면 기본 500 안전캡 — 평범한 적은 정상 승리", () => {
    const r = resolveBattle(PLAYER, makeEnemy(), "P", {
      pickAction: () => ({ kind: "attack" }),
      potions: {},
    });
    expect(r.outcome).toBe("win");
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

// PR-4a v2 스킬 framework 통합 테스트 — resolveBattle 통해.
describe("v2 스킬 런타임 framework (PR-4a)", () => {
  it("ctx.v2Skills 미지정 → state.v2Skills 빈 배열 (no-op)", () => {
    const r = resolveBattle(PLAYER, makeEnemy({ hp: 50 }), "P", {
      pickAction: () => ({ kind: "attack" }),
      potions: {},
    });
    expect(r.finalState.v2Skills).toEqual({ learned: [], equipped: [] });
    expect(r.finalState.v2SkillCooldowns).toEqual({});
  });

  it("equipped + MP 충분 → 첫 턴 cast 후 cooldown 세팅 + MP 차감 + 로그", () => {
    const skillsPlayer: PlayerCombat = { ...PLAYER, maxMp: 1000 };
    const r = resolveBattle(skillsPlayer, makeEnemy({ hp: 60 }), "P", {
      pickAction: () => ({ kind: "attack" }),
      potions: {},
      v2Skills: {
        learned: ["v2_skill_strike"],
        equipped: ["v2_skill_strike"],
      },
    });
    // strike 가 적어도 한 번은 발동 (cd=3, mp=20 가정 — 충분).
    expect(r.finalState.playerMp).toBeLessThan(1000);
    // 로그에 강타 prefix 가 박힌 player_attack 존재 (일반 공격과 구분).
    expect(
      r.finalState.log.some(
        (e) => e.kind === "player_attack" && e.text.includes("[강타]"),
      ),
    ).toBe(true);
  });

  it("MP 0 / maxMp 0 → cast 안 됨 (INT 없는 캐릭 안전)", () => {
    // PLAYER 는 maxMp 미지정 → undefined → 0 으로 클램프.
    const r = resolveBattle(PLAYER, makeEnemy({ hp: 60 }), "P", {
      pickAction: () => ({ kind: "attack" }),
      potions: {},
      v2Skills: {
        learned: ["v2_skill_strike"],
        equipped: ["v2_skill_strike"],
      },
    });
    expect(r.finalState.playerMp).toBe(0);
    expect(r.finalState.v2SkillCooldowns).toEqual({});
    expect(
      r.finalState.log.some(
        (e) => e.kind === "player_attack" && e.text.includes("[강타]"),
      ),
    ).toBe(false);
  });

  it("슬롯 우선순위 — 첫 슬롯 cooldown 중이면 다음 슬롯 cast", () => {
    const skillsPlayer: PlayerCombat = { ...PLAYER, maxMp: 1000 };
    const r = resolveBattle(skillsPlayer, makeEnemy({ hp: 200 }), "P", {
      pickAction: () => ({ kind: "attack" }),
      potions: {},
      v2Skills: {
        learned: ["v2_skill_strike", "v2_skill_flurry"],
        equipped: ["v2_skill_strike", "v2_skill_flurry"],
      },
    });
    // 두 스킬 모두 한 번 이상 발동 — player_attack 로그에 prefix.
    const strikeFired = r.finalState.log.some(
      (e) => e.kind === "player_attack" && e.text.includes("[강타]"),
    );
    const flurryFired = r.finalState.log.some(
      (e) => e.kind === "player_attack" && e.text.includes("[연격]"),
    );
    expect(strikeFired).toBe(true);
    // 전투 길이에 따라 flurry 도 cd 사이에 발동될 수 있음.
    // 최소 하나는 발동했으면 OK — 우선순위 검증은 단위테스트가 cover.
    expect(strikeFired || flurryFired).toBe(true);
  });

  // 회귀: 포션-only 턴 종료가 completedPlayerTurns 를 증가시키지 않아 옛 카운터 dedupe 가
  // 한 턴 건너뛰던 문제 (Codex Q2). phase-entry flag 로 교체 후 정상 동작 확인.
  it("포션-only 턴 후 다음 player phase 에서도 정상 cast (dedupe phase-entry 기반)", () => {
    const skillsPlayer: PlayerCombat = {
      ...PLAYER,
      maxMp: 10000,
      attackCount: 1,
      hp: 200,
      maxHp: 200,
    };
    let actionCount = 0;
    const r = resolveBattle(
      skillsPlayer,
      makeEnemy({ hp: 500, atk: 5 }),
      "P",
      {
        // 첫 player phase 액션 = 포션 (turn 종료). 그 후엔 공격.
        pickAction: () => {
          actionCount += 1;
          if (actionCount === 1) {
            return { kind: "use_potion", potionId: "potion_heal_s", potion: HEAL_POTION };
          }
          return { kind: "attack" };
        },
        potions: { potion_heal_s: 1 },
        v2Skills: {
          learned: ["v2_skill_strike"],
          equipped: ["v2_skill_strike"],
        },
      },
    );
    // 강타 시전 로그가 최소 2회 이상 (T1 포션턴, T2 공격턴 — 둘 다 player phase 진입).
    const castLogs = r.finalState.log.filter(
      (e) => e.kind === "player_attack" && e.text.includes("[강타]"),
    );
    expect(castLogs.length).toBeGreaterThanOrEqual(2);
  });
});

describe("v2 스킬 효과 적용 (PR-4b)", () => {
  it("damage effect — strike 발동 시 적 HP 차감 (atk - def 식)", () => {
    // atk 50, def 5 의 적 → strike (coef 1.0) → 50 - 5 = 45 데미지/cast
    // 적 hp 200 → 적어도 1회 cast 후 HP 차감 확인.
    const skillsPlayer: PlayerCombat = {
      ...PLAYER,
      atk: 50,
      maxMp: 1000,
      hp: 200,
      maxHp: 200,
      spd: 100,
    };
    const r = resolveBattle(
      skillsPlayer,
      makeEnemy({ hp: 1000, atk: 1, def: 5 }),
      "P",
      {
        pickAction: () => ({ kind: "attack" }),
        potions: {},
        v2Skills: {
          learned: ["v2_skill_strike"],
          equipped: ["v2_skill_strike"],
        },
      },
    );
    // 데미지 로그 — player_attack kind + 스킬명 prefix "[강타]".
    const dmgLog = r.finalState.log.find(
      (e) =>
        e.kind === "player_attack" &&
        e.text.includes("피해를 입혔다") &&
        e.text.includes("강타"),
    );
    expect(dmgLog).toBeDefined();
  });

  it("heal effect — recover 발동 시 player HP 회복 (maxHp 클램프)", () => {
    // recover: pctMaxHp=10, maxHp=200 → 20 heal.
    // 시작 HP=50 (낮춤) → cast 후 HP 70 이상.
    const skillsPlayer: PlayerCombat = {
      ...PLAYER,
      hp: 50,
      maxHp: 200,
      maxMp: 1000,
    };
    const r = resolveBattle(
      skillsPlayer,
      makeEnemy({ hp: 1000, atk: 1 }),
      "P",
      {
        pickAction: () => ({ kind: "attack" }),
        potions: {},
        v2Skills: {
          learned: ["v2_skill_recover"],
          equipped: ["v2_skill_recover"],
        },
      },
    );
    const healLog = r.finalState.log.find(
      (e) => e.kind === "player_attack" && e.text.includes("HP") && e.text.includes("회복했다"),
    );
    expect(healLog).toBeDefined();
  });

  it("selfBuff effect — dash 발동 시 [강화] 로그 + v2SelfBuffs 갱신", () => {
    // dash: selfBuff spd +10% 3턴
    const skillsPlayer: PlayerCombat = {
      ...PLAYER,
      maxMp: 1000,
      hp: 200,
      maxHp: 200,
      spd: 100,
    };
    const r = resolveBattle(
      skillsPlayer,
      makeEnemy({ hp: 1000 }),
      "P",
      {
        pickAction: () => ({ kind: "attack" }),
        potions: {},
        v2Skills: {
          learned: ["v2_skill_dash"],
          equipped: ["v2_skill_dash"],
        },
      },
    );
    // 라벨은 스킬명. 본문에 "+N% (3턴)" 패턴이 안정적.
    const buffLog = r.finalState.log.find(
      (e) =>
        e.kind === "info" && e.text.includes("SPD +") && e.text.includes("3턴"),
    );
    expect(buffLog).toBeDefined();
  });

  it("PR-8 — dot effect 스킬 발동 후 적 hp 가 후속 turn tick 으로 추가 감소", () => {
    // mob_rending_claw(살점 뜯기): dot (출혈 3턴). 스킬 kind:"dot" 효과 경로 검증 픽스처.
    const dexPlayer: PlayerCombat = {
      ...PLAYER,
      atk: 50,
      maxMp: 1000,
      hp: 500,
      maxHp: 500,
      spd: 100,
      def: 50,
    };
    const r = resolveBattle(
      dexPlayer,
      makeEnemy({ hp: 2000, atk: 5, def: 5 }),
      "P",
      {
        pickAction: () => ({ kind: "attack" }),
        potions: {},
        v2Skills: {
          learned: ["v2_skill_flurry", "mob_rending_claw"],
          equipped: ["mob_rending_claw"],
        },
      },
    );
    // 출혈 박힘 로그 (apply 시점 — info kind 유지). 새 포맷: [스킬명 + 출혈] +N스택 (M턴).
    const dotApplyLog = r.finalState.log.find(
      (e) => e.kind === "info" && e.text.includes("스택") && e.text.includes("(3턴)"),
    );
    expect(dotApplyLog).toBeDefined();
    // tick 로그 (enemy 측 turn 진입 시 누적 피해) — 일반 공격 패턴 (player_attack + "[출혈]").
    const dotTickLogs = r.finalState.log.filter(
      (e) =>
        e.kind === "player_attack" &&
        e.text.includes("출혈") &&
        e.text.includes("피해를 입혔다"),
    );
    expect(dotTickLogs.length).toBeGreaterThan(0);
  });

  // PR-cast-attack 부터 cast 가 attacksLeft 를 소모해 일반 공격 대체 (포션 패턴).
  // PR-5a 격리 해제 검증은 unit 테스트 (combatShared.test 의 v2AtkBuffMult) 가 cover —
  // 통합 비교 (with-skill vs no-skill 누적 데미지) 는 cast 가 attack 대체라 의미 변경.

  it("damage 누계 + 첫 cast 가 lethal — outcome win 처리", () => {
    // 적 HP 30, strike 데미지 (atk 50 - def 5 = 45) > 30 → 1발에 처치.
    const skillsPlayer: PlayerCombat = {
      ...PLAYER,
      atk: 50,
      maxMp: 1000,
      hp: 200,
      maxHp: 200,
      spd: 100,
    };
    const r = resolveBattle(
      skillsPlayer,
      makeEnemy({ hp: 30, atk: 1, def: 5 }),
      "P",
      {
        pickAction: () => ({ kind: "attack" }),
        potions: {},
        v2Skills: {
          learned: ["v2_skill_strike"],
          equipped: ["v2_skill_strike"],
        },
      },
    );
    expect(r.outcome).toBe("win");
    expect(r.finalState.enemyHp).toBe(0);
  });
});

describe("PR-5b — monster v2 cast (enemy phase)", () => {
  it("monster.v2Skills 미지정 → enemy cast hook no-op (기존 잡몹 동작 보존)", () => {
    const r = resolveBattle(PLAYER, makeEnemy(), "P", {
      pickAction: () => ({ kind: "attack" }),
      potions: {},
    });
    // enemy v2 cast 발동 로그 없음 (강타 prefix 없음 — 일반 적 공격 enemy_attack 와 구분).
    expect(
      r.finalState.log.some(
        (e) => e.kind === "enemy_attack" && e.text.includes("[강타]"),
      ),
    ).toBe(false);
    // enemy v2 state 빈 그대로.
    expect(r.finalState.enemyV2Skills.equipped).toEqual([]);
    expect(r.finalState.enemyMp).toBe(0);
  });

  it("monster.v2Skills 장착 + v2MaxMp > 0 → enemy phase 진입 시 cast 발동 + 로그", () => {
    const skilledEnemy = makeEnemy({
      hp: 1000,
      atk: 30,
      def: 5,
      v2Skills: { learned: ["v2_skill_strike"], equipped: ["v2_skill_strike"] },
      v2MaxMp: 200,
    });
    const tough: PlayerCombat = { ...PLAYER, hp: 500, maxHp: 500, atk: 5, def: 50 };
    const r = resolveBattle(tough, skilledEnemy, "P", {
      pickAction: () => ({ kind: "attack" }),
      potions: {},
    });
    // enemy 강타 발동 로그 존재.
    expect(
      r.finalState.log.some(
        (e) => e.kind === "enemy_attack" && e.text.includes("[강타]"),
      ),
    ).toBe(true);
    // enemy MP 차감됨.
    expect(r.finalState.enemyMp).toBeLessThan(200);
  });

  it("PR-5b 회귀 — enemy cast 가 매 enemy phase 마다 발동 (Codex bug 1: flag reset 누락)", () => {
    // monster strike (cd 2) — 첫 enemy phase 만 cast 가 아니라 cd 풀리는 후속 phase 에도 cast.
    // tough player 로 long battle → enemy 가 mp 떨어질 때까지 여러 cast.
    const monster = makeEnemy({
      hp: 5000,
      atk: 1,
      def: 5,
      v2Skills: { learned: ["v2_skill_strike"], equipped: ["v2_skill_strike"] },
      v2MaxMp: 200,
    });
    const tough: PlayerCombat = { ...PLAYER, hp: 1000, maxHp: 1000, atk: 50, def: 50 };
    const r = resolveBattle(tough, monster, "P", {
      pickAction: () => ({ kind: "attack" }),
      potions: {},
    });
    // strike mpCost=15. v2MaxMp=200. 최대 ~13 회 cast 가능. flag reset 없으면 1회만.
    // 시전 별도 로그 폐기됐고 damage 로그가 enemy_attack — 강타 prefix 로 매 cast 식별.
    const castLogs = r.finalState.log.filter(
      (e) => e.kind === "enemy_attack" && e.text.includes("강타"),
    );
    expect(castLogs.length).toBeGreaterThan(1);
  });

  it("monster selfBuff cast → enemyV2SelfBuffs 에 buff 박힘 (격리 해제 반영 단위는 combatShared 테스트로 cover)", () => {
    // dash (selfBuff spd +10%) 만 장착. 첫 enemy phase 에서 cast 가 fire 되면 enemyV2SelfBuffs 에 spd 키 박힘.
    const buffEnemy = makeEnemy({
      hp: 1000,
      atk: 30,
      def: 5,
      v2Skills: { learned: ["v2_skill_dash"], equipped: ["v2_skill_dash"] },
      v2MaxMp: 200,
    });
    // tough player — 죽지 않고 buff 누적 관찰.
    const tough: PlayerCombat = { ...PLAYER, hp: 500, maxHp: 500, atk: 5, def: 50 };
    const r = resolveBattle(tough, buffEnemy, "P", {
      pickAction: () => ({ kind: "attack" }),
      potions: {},
    });
    // enemy 의 자강화 로그 — 새 포맷은 [스킬명] STAT +N% (M턴). enemy turn 으로 태깅됨.
    const buffLog = r.finalState.log.find(
      (e) =>
        e.kind === "info" &&
        e.turn === "enemy" &&
        /[A-Z]+\s*\+\d+%/.test(e.text) &&
        e.text.includes("턴)"),
    );
    expect(buffLog).toBeDefined();
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
      critChancePct: 75,
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

  it("defMitigationFraction 만큼 플레이어 DEF 로 한기가 감산된다 (하한 1)", () => {
    const enemy = chillEnemy({
      skill: {
        kind: "chill",
        name: "선천의 한기",
        perHit: 2,
        dmgPerStack: 30,
        threshold: 4,
        defMitigationFraction: 0.3,
      },
    });
    // tank def 100 → 한기 차감 round(100×0.3)=30. 스택 5 → 5×30=150, −30 = 120.
    const s0 = initialBattleState(tank, enemy, "P");
    const primed = {
      ...s0,
      phase: "enemy" as const,
      stacks: { ...s0.stacks, chillStacks: 5 },
    };
    const after = advanceTurn(primed, tank, "P");
    expect(
      after.log.some((e) => e.text.startsWith("[한기]") && e.text.includes("120 피해")),
    ).toBe(true);
    // 한기 120 + 적 평타 바닥 1 → 200 − 121 = 79.
    expect(after.playerHp).toBe(79);
  });

  it("evasionPenaltyPerStack — 한기 스택만큼 회피율이 줄어 못 피한다 (슬로우)", () => {
    const enemy = chillEnemy({
      atk: 50,
      skill: {
        kind: "chill",
        name: "선천의 한기",
        perHit: 0,
        dmgPerStack: 0, // DoT 끄고 회피 효과만 관측
        threshold: 99,
        evasionPenaltyPerStack: 5,
      },
    });
    const dodgy: PlayerCombat = {
      ...PLAYER,
      hp: 500,
      maxHp: 500,
      def: 0,
      evasionPct: 50,
    };
    const s0 = initialBattleState(dodgy, enemy, "P");
    // 회피 굴림 40 — 한기 0 이면 유효 50%로 피하고, 4스택(-20%p)이면 30%라 못 피한다.
    vi.spyOn(Math, "random").mockReturnValue(0.4);
    const noChill = advanceTurn(
      { ...s0, phase: "enemy" as const, stacks: { ...s0.stacks, chillStacks: 0 } },
      dodgy,
      "P",
    );
    expect(noChill.playerHp).toBe(500); // 회피 성공
    const chilled = advanceTurn(
      { ...s0, phase: "enemy" as const, stacks: { ...s0.stacks, chillStacks: 4 } },
      dodgy,
      "P",
    );
    expect(chilled.playerHp).toBeLessThan(500); // 슬로우로 못 피함 → 피격
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

  it("다대시 적이어도 한기 DoT 는 적 페이즈당 1회만 발동한다", () => {
    const enemy = chillEnemy({ bonusAttackChancePct: 100 });
    const s0 = initialBattleState(tank, enemy, "P");
    const primed = {
      ...s0,
      phase: "enemy" as const,
      stacks: { ...s0.stacks, chillStacks: 5 },
    };
    const after1 = advanceTurn(primed, tank, "P");
    const after2 = advanceTurn(after1, tank, "P");
    expect(after2.playerHp).toBe(183);
    expect(after2.log.filter((e) => e.text.startsWith("[한기]")).length).toBe(1);
  });

  it("다대시 적이어도 출혈 DoT 는 적 페이즈당 1회만 발동한다", () => {
    const bleeder: PlayerCombat = { ...tank };
    const enemy = chillEnemy({ bonusAttackChancePct: 100, skill: undefined });
    const s0 = initialBattleState(bleeder, enemy, "P");
    const primed = {
      ...s0,
      phase: "enemy" as const,
      enemyV2Dots: [makeBleedDot({ stacks: 3, flatPerStack: 4, sourceAtk: 0 })],
    };
    const after1 = advanceTurn(primed, bleeder, "P");
    const after2 = advanceTurn(after1, bleeder, "P");
    expect(after2.enemyHp).toBe(988);
    expect(after2.log.filter((e) => e.text.startsWith("[출혈]")).length).toBe(1);
  });

  it("출혈(기본 DoT)은 STR 기반 고정 — 적 HP 와 무관", () => {
    const bleeder: PlayerCombat = { ...tank, hp: 10000, maxHp: 10000 };
    const enemy = makeEnemy({ hp: 50000, atk: 5 });
    const s0 = initialBattleState(bleeder, enemy, "P");
    const primed = {
      ...s0,
      phase: "enemy" as const,
      enemyHp: 50000,
      enemyV2Dots: [makeBleedDot({ stacks: 3, flatPerStack: 4, sourceAtk: 0 })],
    };
    const after = advanceTurn(primed, bleeder, "P");
    expect(after.enemyHp).toBe(50000 - 3 * 4); // 49988 — 고정 4, %HP 아님
  });

  it("중독(체력% DoT)은 적 최대HP 비례 + ATK cap", () => {
    const venomer: PlayerCombat = {
      ...tank,
      hp: 10000,
      maxHp: 10000,
    };
    const enemy = makeEnemy({ hp: 50000, atk: 5 });
    const s0 = initialBattleState(venomer, enemy, "P");
    const pct = 20 * POISON_PCT_PER_POINT;
    const primed = {
      ...s0,
      phase: "enemy" as const,
      enemyHp: 50000,
      enemyV2Dots: [makePoisonDot({ stacks: 3, pctMaxHpPerStack: pct, sourceAtk: 1000 })],
    };
    const after = advanceTurn(primed, venomer, "P");
    const poisonPer = Math.min(50000 * pct, 1000 * POISON_CAP_ATK_COEF);
    expect(after.enemyHp).toBe(50000 - 3 * poisonPer);
  });

  it("출혈 스택은 BLEED_MAX_STACKS 로 캡된다", () => {
    const bleeder: PlayerCombat = {
      ...tank,
      hp: 10000,
      maxHp: 10000,
      atk: 1000,
      bleedOnHit: { flatPerStack: 4, atkCoefPerStack: 0.08 },
    };
    const enemy = makeEnemy({ hp: 50000, def: 0, atk: 5, evasionPct: 0 });
    const s0 = initialBattleState(bleeder, enemy, "P");
    const primed = {
      ...s0,
      phase: "player" as const,
      enemyV2Dots: [makeBleedDot({ stacks: BLEED_MAX_STACKS, flatPerStack: 4, sourceAtk: 1000 })],
    };
    // 이미 캡인데 플레이어 적중(+1) → 캡 유지.
    const after = advanceTurn(primed, bleeder, "P");
    expect(after.enemyV2Dots.find((d) => d.tag === "bleed")?.stacks).toBe(BLEED_MAX_STACKS);
  });


  it("한기 DoT 는 결의 피해 감소를 적용한다", () => {
    const enemy = chillEnemy();
    const s0 = initialBattleState(tank, enemy, "P");
    const primed = {
      ...s0,
      phase: "enemy" as const,
      buffs: {
        ...s0.buffs,
        playerDmgReductionPct: 50,
        playerDmgReductionTurnsLeft: 1,
      },
      stacks: { ...s0.stacks, chillStacks: 5 },
    };
    const after = advanceTurn(primed, tank, "P");
    expect(after.playerHp).toBe(192);
    expect(
      after.log.some((e) => e.text.startsWith("[한기]") && e.text.includes("7 피해")),
    ).toBe(true);
  });

  it("한기 DoT 는 별빛 인내 피해 감소를 적용한다", () => {
    const enemy = chillEnemy();
    const enduring: PlayerCombat = { ...tank, enchantEndurePct: 50 };
    const s0 = initialBattleState(enduring, enemy, "P");
    const primed = {
      ...s0,
      phase: "enemy" as const,
      stacks: { ...s0.stacks, chillStacks: 5 },
    };
    const after = advanceTurn(primed, enduring, "P");
    expect(after.playerHp).toBe(192);
    expect(
      after.log.some((e) => e.text.startsWith("[한기]") && e.text.includes("7 피해")),
    ).toBe(true);
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
