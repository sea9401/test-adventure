import { afterEach, describe, expect, it, vi } from "vitest";
import { aggregateEquippedPassives, describeV2Skill, spCostOf, V2_SKILLS, type V2SkillId } from "@/adventure/data/v2/v2Skills";
import { derivePlayerCombatV2Pure } from "@/lib/server/derivePlayerCombatV2";
import { initialBattleState, applyPlayerV2SkillCast, type PlayerCombat } from "./engine";
import { initialBattleStatePvP, castV2SkillOnAttackerTurnPvP } from "./engine-pvp";

const heart = "v2c_dragonlord_heart";
const actor: PlayerCombat = { hp: 10000, maxHp: 10000, mp: 10000, maxMp: 10000, atk: 100, magicAtk: 100, strStat: 100, intStat: 100, spiStat: 100, def: 100, spd: 100, evasionPct: 0, accuracyPct: 100, attackCount: 1 };
afterEach(() => vi.restoreAllMocks());

describe("고대 용의 심장 — 능력치 배분과 무관한 공격 강화", () => {
  it("힘·지능 대신 피해·HP·연소를 집계하고 학습 설명과 18 SP에 반영한다", () => {
    const passive = aggregateEquippedPassives([heart]);
    expect(passive.statPct.str ?? 0).toBe(0);
    expect(passive.statPct.int ?? 0).toBe(0);
    expect(passive).toMatchObject({ physicalSkillDamagePct: 20, magicSkillDamagePct: 20, maxHpPct: 20, burnDamagePct: 50 });
    expect(describeV2Skill(V2_SKILLS[heart])).toContain("물리 스킬 피해 +20%");
    expect(spCostOf(V2_SKILLS[heart])).toBe(18);
    const derived = derivePlayerCombatV2Pure({ level: 100, allocatedStats: {}, v2Equipped: {}, playerClass: "warrior", classTier: 1, passivePhysicalSkillDamagePct: passive.physicalSkillDamagePct, passiveMagicSkillDamagePct: passive.magicSkillDamagePct }).player;
    expect(derived).toMatchObject({ physicalSkillDamagePct: 20, magicSkillDamagePct: 20 });
  });

  for (const mode of ["pve", "p1", "p2"] as const) {
    function damage(id: V2SkillId, physicalPct: number, magicPct: number): number {
      vi.spyOn(Math, "random").mockReturnValue(0.1);
      const player = { ...actor, physicalSkillDamagePct: physicalPct, magicSkillDamagePct: magicPct };
      const skills = { learned: [id], equipped: [id] };
      if (mode === "pve") {
        const enemy = { name: "허수아비", tags: [], hp: 10000, atk: 1, def: 100, magicDef: 100, spd: 1, exp: 0, drops: [] };
        const state = initialBattleState(player, enemy, "용", skills);
        return 10000 - applyPlayerV2SkillCast(state, player, { selfBuffs: {}, selfDebuffs: {}, enemyDebuffs: {} }).state.enemyHp;
      }
      const other = mode === "p1" ? "p2" : "p1";
      const state = initialBattleStatePvP(player, actor, "A", "B", skills, skills);
      state[mode].player = player;
      return 10000 - castV2SkillOnAttackerTurnPvP(state, mode).state[other].hp;
    }
    it.each(["v2c_dragonlord_claw", "v2c_martial_combo"] as const)(`${mode}: %s 물리 단일·다단 스킬을 강화한다`, (id) => {
      const base = damage(id, 0, 0);
      expect(base).toBeGreaterThan(0);
      expect(Math.abs(damage(id, 20, 0) - base * 1.2)).toBeLessThanOrEqual(3);
      expect(damage(id, 0, 20)).toBe(base);
    });
    it(`${mode}: 마법에는 물리 보너스를 중복 적용하지 않는다`, () => {
      const id = "v2c_dragonlord_breath";
      const base = damage(id, 0, 0);
      expect(base).toBeGreaterThan(0);
      expect(damage(id, 20, 0)).toBe(base);
      expect(Math.abs(damage(id, 20, 20) - base * 1.2)).toBeLessThanOrEqual(3);
    });
    it(`${mode}: 물리·마법 혼합 스킬도 전체 20%만 강화한다`, () => {
      const id = "v2c_aegis_strike";
      const base = damage(id, 0, 0);
      expect(base).toBeGreaterThan(0);
      expect(Math.abs(damage(id, 20, 20) - base * 1.2)).toBeLessThanOrEqual(3);
    });
  }
});
