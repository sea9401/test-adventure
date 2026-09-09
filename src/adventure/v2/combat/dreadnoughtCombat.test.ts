import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { applyEnemyV2SkillCast, applyPlayerV2SkillCast, applyPassiveCounterOnHitIfAny, initialBattleState, type PlayerCombat } from "./engine";
import { castV2SkillOnAttackerTurnPvP, initialBattleStatePvP, maybeApplyMartialCounter } from "./engine-pvp";
import { resolveEnemyPhase } from "./engine.enemyPhase";
import type { V2SkillId, V2SkillsState } from "@/adventure/data/v2/v2Skills";
import { derivePlayerCombatV2FromSaves } from "@/lib/server/derivePlayerCombatV2";

const player: PlayerCombat = {
  hp: 500, maxHp: 1000, atk: 100, def: 200, spd: 50,
  mp: 1000, maxMp: 1000, attackCount: 1, accuracyPct: 100, evasionPct: 0,
  passiveCounterChancePct: 100, counterImpactGain: 1, fortressImpactHealPctPerStack: 2,
  fortressImpactOnHit: true, fortressImpactDamagePctPerStack: 20,
};
const enemy = { name: "반격 실험체", hp: 100_000, atk: 300, def: 0, spd: 30, exp: 0, tags: [], evasionPct: 0 };
const maps = { selfBuffs: {}, selfDebuffs: {}, enemyDebuffs: {} };
function skills(id: V2SkillId = "v2c_dreadnought_siegebreaker"): V2SkillsState {
  return { learned: [id], equipped: [id], pattern: { blocks: [{ condition: { kind: "always" }, action: { kind: "skill", skillId: id } }] } };
}
function pve(id?: V2SkillId, impact = 3) {
  const state = initialBattleState(player, enemy, "드레드노트", skills(id));
  return { ...state, stacks: { ...state.stacks, fortressImpact: impact } };
}
function pvp(id?: V2SkillId) {
  const state = initialBattleStatePvP(player, { ...player, hp: 100_000, maxHp: 100_000, def: 0, passiveCounterChancePct: 0 }, "드레드노트", "상대", skills(id));
  return { ...state, p1: { ...state.p1, stacks: { ...state.p1.stacks, fortressImpact: 3 } } };
}

beforeEach(() => vi.spyOn(Math, "random").mockReturnValue(0.1));
afterEach(() => vi.restoreAllMocks());

describe("드레드노트 실제 전투 연계", () => {
  it("저장한 장착 패시브를 전투 필드로 전달한다", () => {
    const ids: V2SkillId[] = ["v2c_dreadnought_armor", "v2c_dreadnought_march", "v2c_vajraarhat_body"];
    const derived = derivePlayerCombatV2FromSaves({
      character: { level: 50, hp: 500, mp: 100, class: "warrior" },
      equipmentSave: { owned: [], equipped: {} }, proficiencyRaw: {},
      skillsRaw: { learned: ids, equipped: ids },
    })!;
    expect(derived.player).toMatchObject({ passiveCounterChancePct: 40, counterImpactGain: 1, fortressImpactHealPctPerStack: 2 });
  });

  it.each(["v2c_dreadnought_siegebreaker", "v2c_fortressknight_ram"] as const)("PvE %s의 충격 소비는 6% 회복한다", id => {
    const result = applyPlayerV2SkillCast(pve(id), player, maps);
    expect(result.castFired).toBe(true);
    expect(result.state.stacks.fortressImpact).toBe(0);
    expect(result.state.playerHp).toBe(560);
    expect(result.state.stacks.dreadnought?.counterBoostPct ?? 0).toBe(id.includes("siegebreaker") ? 50 : 0);
    expect(result.state.log.some(entry => entry.text.includes("[끝없는 진군]"))).toBe(true);
  });

  it("PvE 강화 반격은 한 번 소비하고 같은 적 행동에 충격을 두 번 얻지 않는다", () => {
    const start = pve(undefined, 0);
    const boosted = { ...start, stacks: { ...start.stacks, dreadnought: { counterBoostPct: 50 } } };
    const normal = applyPassiveCounterOnHitIfAny(start, player);
    const first = applyPassiveCounterOnHitIfAny(boosted, player);
    expect(start.enemyHp - first.enemyHp).toBe(Math.floor((start.enemyHp - normal.enemyHp) * 1.5));
    expect(first.stacks.fortressImpact).toBe(1);
    expect(first.stacks.dreadnought?.counterBoostPct).toBe(0);
    const second = applyPassiveCounterOnHitIfAny(first, player);
    expect(second.stacks.fortressImpact).toBe(1);
    expect(first.enemyHp - second.enemyHp).toBe(start.enemyHp - normal.enemyHp);
  });

  it("시즈 브레이커 자체 20%와 움직이는 성채 20%를 충격당 합산한다", () => {
    const base = pve(undefined, 0);
    const full = pve();
    const plain = applyPlayerV2SkillCast(base, player, maps).state;
    const boosted = applyPlayerV2SkillCast(full, player, maps).state;
    expect(full.enemyHp - boosted.enemyHp).toBe(Math.floor((base.enemyHp - plain.enemyHp) * 2.2));
  });

  it("충격이 없거나 끝없는 진군 미장착이면 회복하지 않고 회복은 HP 상한을 지킨다", () => {
    expect(applyPlayerV2SkillCast(pve(undefined, 0), player, maps).state.playerHp).toBe(500);
    expect(applyPlayerV2SkillCast(pve(), { ...player, fortressImpactHealPctPerStack: undefined }, maps).state.playerHp).toBe(500);
    const nearlyFull = { ...pve(), playerHp: 990 };
    expect(applyPlayerV2SkillCast(nearlyFull, player, maps).state.playerHp).toBe(1000);
  });

  it("PvE 화상과 받는 회복량 보정은 진군 회복에 각각 한 번 적용한다", () => {
    const state = { ...pve(), playerV2Dots: [{ tag: "burn" as const, label: "화상", stacks: 1, maxStacks: 3, turns: 3, flatPerStack: 1, atkCoefPerStack: 0, pctMaxHpPerStack: 0, sourceAtk: 1 }] };
    const result = applyPlayerV2SkillCast(state, { ...player, receivedHealMult: 0.5 }, maps);
    expect(result.state.playerHp).toBe(515);
  });

  it("보호막으로 HP 피해를 막으면 철벽 반사만 발동하고 자동 반격 강화는 보존한다", () => {
    const start = pve(undefined, 0);
    const state = { ...start, stacks: { ...start.stacks, playerShield: 10000, ironWallReflectCharges: 1, dreadnought: { counterBoostPct: 50 } } };
    const result = resolveEnemyPhase(state, player, "드레드노트", true);
    expect(result.playerHp).toBe(500);
    expect(result.stacks.fortressImpact).toBe(1);
    expect(result.stacks.dreadnought?.counterBoostPct).toBe(50);
    expect(result.log.some(entry => entry.text.includes("[철벽 반사]"))).toBe(true);
  });

  it("일반 적 공격은 피격 충격과 반격 충격을 모두 남긴다", () => {
    const state = pve(undefined, 0);
    const result = resolveEnemyPhase(state, player, "드레드노트", true);
    expect(result.stacks.fortressImpact).toBe(2);
  });

  it("한 적 행동의 여러 기본 타격에서도 추가 충격은 한 번만 얻는다", () => {
    const actor = { ...player, fortressImpactOnHit: false };
    const start = pve(undefined, 0);
    const first = resolveEnemyPhase({ ...start, playerHp: 10_000, playerMaxHp: 10_000, phase: "enemy", turn: { ...start.turn, enemyAttacksLeft: 2 } }, actor, "드레드노트", true);
    expect(first.stacks.fortressImpact).toBe(1);
    const second = resolveEnemyPhase(first, actor, "드레드노트", false);
    expect(second.stacks.fortressImpact).toBe(1);
    const nextAction = resolveEnemyPhase({ ...second, phase: "enemy", turn: { ...second.turn, enemyAttacksLeft: 1 } }, actor, "드레드노트", true);
    expect(nextAction.stacks.fortressImpact).toBe(2);
  });

  it("도발로 유도한 PvE 공격은 이전·다음 정상 행동과 충격 획득 제한을 공유하지 않는다", () => {
    const actor = { ...player, fortressImpactOnHit: false };
    const start = pve("v2c_warden_aegis", 0);
    const state = { ...start, playerHp: 10000, playerMaxHp: 10000, stacks: { ...start.stacks, dreadnought: { enemyActionId: 1, lastImpactAction: 1 } } };
    const cast = applyPlayerV2SkillCast(state, actor, maps).state;
    expect(cast.stacks.fortressImpact).toBe(1);
    const next = resolveEnemyPhase({ ...cast, phase: "enemy", turn: { ...cast.turn, enemyAttacksLeft: 1 } }, actor, "드레드노트", true);
    expect(next.stacks.fortressImpact).toBe(2);
  });

  it("도발로 유도한 PvP 공격도 다음 정상 행동의 추가 충격을 소모하지 않는다", () => {
    const start = pvp("v2c_warden_aegis");
    const state = { ...start, p1: { ...start.p1, player: { ...start.p1.player, fortressImpactOnHit: false }, stacks: { ...start.p1.stacks, fortressImpact: 0, dreadnought: { lastImpactAction: 1 } } } };
    const cast = castV2SkillOnAttackerTurnPvP(state, "p1").state;
    expect(cast.p1.stacks.fortressImpact).toBe(1);
    expect(maybeApplyMartialCounter(cast, "p2", "p1").state.p1.stacks.fortressImpact).toBe(2);
  });

  it("몬스터 스킬 반격의 충격·강화 소비 상태를 보존한다", () => {
    const start = pve(undefined, 0);
    const state = { ...start, stacks: { ...start.stacks, dreadnought: { counterBoostPct: 50 } }, enemyV2Skills: skills("v2c_warrior_flurry"), enemyMp: 1000, enemyMaxMp: 1000 };
    const result = applyEnemyV2SkillCast(state, player);
    expect(result.castFired).toBe(true);
    expect(result.state.stacks.fortressImpact).toBe(2);
    expect(result.state.stacks.dreadnought?.counterBoostPct).toBe(0);
  });

  it.each(["v2c_dreadnought_siegebreaker", "v2c_fortressknight_ram"] as const)("PvP %s도 소비·회복하고 회복 감소를 적용한다", id => {
    const start = pvp(id);
    const state = { ...start, p1: { ...start.p1, stacks: { ...start.p1.stacks, healReducePct: 50, healReduceTurns: 3 } } };
    const result = castV2SkillOnAttackerTurnPvP(state, "p1");
    expect(result.castFired).toBe(true);
    expect(result.state.p1.hp).toBe(530);
    expect(result.state.p1.stacks.fortressImpact).toBe(0);
    expect(result.state.p1.stacks.dreadnought?.counterBoostPct ?? 0).toBe(id.includes("siegebreaker") ? 50 : 0);
  });

  it("PvP 확정 회피 시 충격·회복·반격 강화가 발생하지 않는다", () => {
    const start = pvp();
    const result = castV2SkillOnAttackerTurnPvP({ ...start, p2: { ...start.p2, stacks: { ...start.p2.stacks, evadesRemaining: 1 } } }, "p1");
    expect(result.castFired).toBe(true);
    expect(result.state.p1.hp).toBe(500);
    expect(result.state.p1.stacks.fortressImpact).toBe(3);
    expect(result.state.p1.stacks.dreadnought?.counterBoostPct ?? 0).toBe(0);
  });

  it("PvP 반격도 강화는 한 번, 충격은 상대 행동당 한 번 적용한다", () => {
    const start = pvp();
    const boosted = { ...start, p1: { ...start.p1, stacks: { ...start.p1.stacks, fortressImpact: 0, dreadnought: { counterBoostPct: 50 } } } };
    const normal = maybeApplyMartialCounter(start, "p2", "p1").state;
    const first = maybeApplyMartialCounter(boosted, "p2", "p1").state;
    expect(start.p2.hp - first.p2.hp).toBe(Math.floor((start.p2.hp - normal.p2.hp) * 1.5));
    expect(first.p1.stacks.fortressImpact).toBe(1);
    expect(first.p1.stacks.dreadnought?.counterBoostPct).toBe(0);
    expect(maybeApplyMartialCounter(first, "p2", "p1").state.p1.stacks.fortressImpact).toBe(1);
  });
});
