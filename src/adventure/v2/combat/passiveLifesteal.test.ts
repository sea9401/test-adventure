import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Monster } from "@/adventure/data/monsters";
import type { V2SkillId, V2SkillsState } from "@/adventure/data/v2/v2Skills";
import { advanceTurn, applyPlayerV2SkillCast, initialBattleState, type PlayerCombat } from "./engine";
import { createCombatDiagnostics, withCombatDiagnostics } from "./combatDiagnostics";
import { makePoisonDot } from "./combatShared";
import { advanceTurnPvP, castV2SkillOnAttackerTurnPvP, initialBattleStatePvP } from "./engine-pvp";

function player(over: Partial<PlayerCombat> = {}): PlayerCombat {
  return {
    hp: 1_000, maxHp: 10_000, mp: 10_000, maxMp: 10_000,
    atk: 500, magicAtk: 500, intStat: 200, def: 0, magicDef: 0,
    spd: 100, attackCount: 1, accuracyPct: 100, accRating: 1_000,
    evasionPct: 0, evaRating: 0, passiveLifestealPct: 2,
    ...over,
  };
}
function skills(skillId: V2SkillId): V2SkillsState {
  return { learned: [skillId], equipped: [skillId], pattern: { blocks: [{
    condition: { kind: "always" }, action: { kind: "skill", skillId },
  }] } };
}
const enemy: Monster = {
  name: "흡혈 시험체", tags: [], hp: 100_000, atk: 1, def: 0, spd: 1, exp: 1,
};
const buffs = { selfBuffs: {}, selfDebuffs: {}, enemyDebuffs: {} };
const PASSIVE_LOG = "[패시브 흡혈]";

beforeEach(() => { vi.spyOn(Math, "random").mockReturnValue(0); });
afterEach(() => { vi.restoreAllMocks(); });

describe("패시브 흡혈 PvE", () => {
  it.each(["v2c_mage_boltcast", "v2c_mage_barrage"] as const)("%s의 실제 총 HP 피해 2퍼센트를 회복한다", (id) => {
    const p = player();
    const start = initialBattleState(p, enemy, "순교자", skills(id));
    const diagnostics = createCombatDiagnostics();
    const result = withCombatDiagnostics(diagnostics, () =>
      applyPlayerV2SkillCast(start, p, buffs, "순교자"),
    );
    expect(result.castFired).toBe(true);
    const damage = start.enemyHp - result.state.enemyHp;
    const heal = Math.floor(damage * 0.02);
    expect(heal).toBeGreaterThan(0);
    expect(result.state.playerHp - start.playerHp).toBe(heal);
    expect(diagnostics.snapshot()).toContainEqual({
      metric: "healing", source: "passive_lifesteal", target: "player", total: heal, count: 1,
    });
    expect(result.state.log.some((e) => e.text === `${PASSIVE_LOG} 순교자의 HP +${heal}`)).toBe(true);
    expect(result.state.log.some((e) => e.text.includes("별빛 흡혈"))).toBe(false);
  });

  it.each([49, 100])("남은 적 HP %i를 초과한 피해로는 회복하지 않는다", (hp) => {
    const p = player();
    const start = initialBattleState(p, { ...enemy, hp }, "순교자", skills("v2c_mage_barrage"));
    const result = applyPlayerV2SkillCast(start, p, buffs, "순교자").state;
    const heal = Math.floor(hp * 0.02);
    expect(result.playerHp - start.playerHp).toBe(heal);
    expect(result.log.some((e) => e.text.includes(PASSIVE_LOG))).toBe(heal > 0);
  });

  it.each([9_999, 10_000])("HP %i에서는 최대 HP까지만 회복하며 0 회복 로그는 없다", (hp) => {
    const p = player({ hp });
    const start = initialBattleState(p, enemy, "순교자", skills("v2c_mage_boltcast"));
    const result = applyPlayerV2SkillCast(start, p, buffs, "순교자").state;
    expect(result.playerHp).toBe(10_000);
    expect(result.log.filter((e) => e.text.includes(PASSIVE_LOG)).map((e) => e.text)).toEqual(
      hp < 10_000 ? [`${PASSIVE_LOG} 순교자의 HP +1`] : [],
    );
  });

  it("받는 회복 보정을 한 번 적용한다", () => {
    const p = player({ receivedHealMult: 0.5 });
    const start = initialBattleState(p, enemy, "순교자", skills("v2c_mage_boltcast"));
    const result = applyPlayerV2SkillCast(start, p, buffs, "순교자").state;
    expect(result.playerHp - start.playerHp).toBe(Math.floor(Math.floor((start.enemyHp - result.enemyHp) * 0.02) * 0.5));
  });

  it.each([0, 100])("일반 공격 및 분신 추가타(%i퍼센트)에도 패시브 로그로 회복한다", (shadowCloneAtkPct) => {
    const p = player({ shadowCloneAtkPct });
    const start = initialBattleState(p, enemy, "순교자");
    const result = advanceTurn({ ...start, phase: "player" }, p, "순교자");
    expect(result.playerHp - start.playerHp).toBe(shadowCloneAtkPct ? 20 : 10);
    expect(result.log.filter((e) => e.text.includes(PASSIVE_LOG))).toHaveLength(shadowCloneAtkPct ? 2 : 1);
  });

  it("패시브를 장착하지 않은 스킬은 흡혈하지 않는다", () => {
    const p = player({ passiveLifestealPct: 0 });
    const start = initialBattleState(p, enemy, "순교자", skills("v2c_mage_boltcast"));
    const result = applyPlayerV2SkillCast(start, p, buffs, "순교자").state;
    expect(result.playerHp).toBe(start.playerHp);
    expect(result.log.some((e) => e.text.includes(PASSIVE_LOG))).toBe(false);
  });
});

describe("패시브 흡혈 PvP", () => {
  it.each(["p1", "p2"] as const)("%s가 직접 피해 스킬로 깎은 HP에서만 흡혈한다", (who) => {
    const p = player();
    const start = initialBattleStatePvP(p, player({ hp: 8_000 }), "순교자1", "순교자2", skills("v2c_mage_barrage"), skills("v2c_mage_barrage"));
    const other = who === "p1" ? "p2" : "p1";
    const result = castV2SkillOnAttackerTurnPvP(start, who);
    const heal = Math.floor((start[other].hp - result.state[other].hp) * 0.02);
    expect(heal).toBeGreaterThan(0);
    expect(result.state[who].hp - start[who].hp).toBe(heal);
    expect(result.state.log.some((e) => e.side === who && e.text.includes(PASSIVE_LOG))).toBe(true);
  });

  it.each([0, 150, 100_000])("보호막 %i의 흡수량은 흡혈에서 제외한다", (shield) => {
    const start = initialBattleStatePvP(player(), player({ hp: 8_000 }), "순교자", "상대", skills("v2c_mage_barrage"));
    start.p2.stacks.playerShield = shield;
    const result = castV2SkillOnAttackerTurnPvP(start, "p1").state;
    const heal = Math.floor((start.p2.hp - result.p2.hp) * 0.02);
    expect(result.p1.hp - start.p1.hp).toBe(heal);
    expect(result.log.some((e) => e.text.includes(PASSIVE_LOG))).toBe(heal > 0);
  });

  it("PvP 지속력 보정과 받는 회복 보정을 적용한다", () => {
    const start = initialBattleStatePvP(player({ receivedHealMult: 0.5 }), player({ hp: 8_000 }), "순교자", "상대", skills("v2c_mage_barrage"));
    start.sustainMultiplier = 0.5;
    const result = castV2SkillOnAttackerTurnPvP(start, "p1").state;
    const raw = Math.floor((start.p2.hp - result.p2.hp) * 0.02);
    expect(raw).toBeGreaterThan(4);
    expect(result.p1.hp - start.p1.hp).toBe(Math.floor(Math.floor(raw * 0.5) * 0.5));
  });

  it.each([0, 100])("일반 공격 및 분신 추가타(%i퍼센트)에도 적용한다", (shadowCloneAtkPct) => {
    const start = initialBattleStatePvP(player({ shadowCloneAtkPct }), player({ hp: 8_000, spd: 1, passiveLifestealPct: 0 }), "순교자", "상대");
    const result = advanceTurnPvP({ ...start, phase: "p1" });
    expect(result.p1.hp - start.p1.hp).toBe(shadowCloneAtkPct ? 20 : 10);
    expect(result.log.filter((e) => e.text.includes(PASSIVE_LOG))).toHaveLength(shadowCloneAtkPct ? 2 : 1);
  });
});


describe("패시브 흡혈의 다른 회복 효과와 경계", () => {
  it("PvE 일반 공격에서 별빛 흡혈과 패시브 흡혈은 한 번씩만 합산한다", () => {
    const p = player({ enchantLifestealPct: 3 });
    const start = initialBattleState(p, enemy, "순교자");
    const result = advanceTurn({ ...start, phase: "player" }, p, "순교자");
    expect(result.playerHp - start.playerHp).toBe(25);
    expect(result.log.some((e) => e.text === "[별빛 흡혈 + 패시브 흡혈] 순교자의 HP +25")).toBe(true);
  });

  it.each(["pve", "pvp"] as const)("%s 스킬 자체 회복에 패시브 흡혈을 별도로 더한다", (mode) => {
    const p = player();
    const noPassive = player({ passiveLifestealPct: 0 });
    const loadout = skills("v2c_blooddemon_reign");
    if (mode === "pve") {
      const start = initialBattleState(p, enemy, "순교자", loadout);
      const baseline = applyPlayerV2SkillCast(start, noPassive, buffs, "순교자").state;
      const result = applyPlayerV2SkillCast(start, p, buffs, "순교자").state;
      const expected = Math.floor((start.enemyHp - result.enemyHp) * 0.02);
      expect(expected).toBeGreaterThan(0);
      expect(result.playerHp - baseline.playerHp).toBe(expected);
    } else {
      const start = initialBattleStatePvP(p, player({ hp: 8_000 }), "순교자", "상대", loadout);
      const baseline = castV2SkillOnAttackerTurnPvP({ ...start, p1: { ...start.p1, player: noPassive } }, "p1").state;
      const result = castV2SkillOnAttackerTurnPvP(start, "p1").state;
      const expected = Math.floor((start.p2.hp - result.p2.hp) * 0.02);
      expect(expected).toBeGreaterThan(0);
      expect(result.p1.hp - baseline.p1.hp).toBe(expected);
    }
  });

  it("직접 피해가 없는 강화 스킬과 발동 실패는 흡혈하지 않는다", () => {
    const p = player();
    const start = initialBattleState(p, enemy, "순교자", skills("v2c_lawguardian_inviolable"));
    const buff = applyPlayerV2SkillCast(start, p, buffs, "순교자");
    expect(buff.castFired).toBe(true);
    expect(buff.state.playerHp).toBe(start.playerHp);
    expect(buff.state.log.some((e) => e.text.includes(PASSIVE_LOG))).toBe(false);
    const attack = initialBattleState(p, enemy, "순교자", skills("v2c_mage_barrage"));
    const failed = applyPlayerV2SkillCast({ ...attack, playerMp: 0 }, p, buffs, "순교자");
    expect(failed.castFired).toBe(false);
    expect(failed.state.playerHp).toBe(attack.playerHp);
  });

  it("중독 지속 피해에서는 패시브 흡혈이 발생하지 않는다", () => {
    const p = player();
    const start = initialBattleState(p, enemy, "순교자");
    const poisoned = { ...start, phase: "enemy" as const, turn: { ...start.turn, enemyAttacksLeft: 0 }, enemyV2Dots: [makePoisonDot({ sourceAtk: 500, pctMaxHpPerStack: 1, turns: 2 })] };
    const result = advanceTurn(poisoned, p, "순교자", { kind: "attack" }, true);
    expect(result.enemyHp).toBeLessThan(start.enemyHp);
    expect(result.playerHp).toBe(start.playerHp);
    expect(result.log.some((e) => e.text.includes(PASSIVE_LOG))).toBe(false);
  });

  it("마법 장벽에 전부 막힌 PvP 스킬은 흡혈하지 않는다", () => {
    const start = initialBattleStatePvP(player(), player({ hp: 8_000, magicBarrierMax: 100_000, magicBarrierPvpAbsorbPct: 100, magicBarrierPvpEfficiencyPct: 0 }), "순교자", "상대", skills("v2c_mage_barrage"));
    const result = castV2SkillOnAttackerTurnPvP(start, "p1").state;
    expect(result.p2.magicBarrier).toBeLessThan(start.p2.magicBarrier ?? 0);
    expect(result.p2.hp).toBe(start.p2.hp);
    expect(result.p1.hp).toBe(start.p1.hp);
    expect(result.log.some((e) => e.text.includes(PASSIVE_LOG))).toBe(false);
  });

  it.each([49, 100])("PvP 다단 스킬도 남은 HP %i까지만 흡혈한다", (hp) => {
    const start = initialBattleStatePvP(player(), player({ hp }), "순교자", "상대", skills("v2c_mage_barrage"));
    const result = castV2SkillOnAttackerTurnPvP(start, "p1").state;
    expect(result.p1.hp - start.p1.hp).toBe(Math.floor(hp * 0.02));
  });

  it("패시브 흡혈로 실제 회복했을 때 회복 보호막도 생성한다", () => {
    const p = player({ equipSignatures: [{ trigger: "on_heal", label: "회복 보호막", healToShieldPct: 100 }] });
    const start = initialBattleState(p, enemy, "순교자", skills("v2c_mage_boltcast"));
    const result = applyPlayerV2SkillCast(start, p, buffs, "순교자").state;
    expect(result.stacks.playerShield).toBe(result.playerHp - start.playerHp);
    expect(result.stacks.playerShield).toBeGreaterThan(0);
  });
});
